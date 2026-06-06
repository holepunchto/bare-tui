// textarea — a multi-line editable field.
//
// The sibling of textinput: it holds logical lines and a (row, col) cursor,
// soft-wraps each line to `width` for display, and scrolls a `height`-row
// window. Editing splits/merges lines (enter/backspace); arrows move by
// character horizontally and by *visual* row vertically (so up/down feel right
// inside wrapped text). Like textinput it only consumes keys when focused and
// draws its own reverse-video cursor.
//
//   const ta = textarea.create({ width: 60, height: 10, placeholder: '…' }).focus()
const ansi = require('../ansi')

const dim = (s) => ansi.modifierDim + s + ansi.modifierReset
const reverse = (s) => ansi.modifierReverse + s + ansi.modifierNotReverse

class TextArea {
  constructor(opts = {}) {
    this.width = Math.max(1, opts.width || 40)
    this.height = Math.max(1, opts.height || 6)
    this.placeholder = opts.placeholder || ''
    this.charLimit = opts.charLimit || 0 // 0 = unlimited
    this.focused = !!opts.focused

    this.lines = String(opts.value || '').split('\n')
    this.row = this.lines.length - 1
    this.col = this.lines[this.row].length
    this.yOffset = 0
  }

  get value() {
    return this.lines.join('\n')
  }

  // Total character count including the newlines between lines.
  get length() {
    let n = this.lines.length - 1
    for (const line of this.lines) n += line.length
    return n
  }

  focus() {
    this.focused = true
    return this
  }

  blur() {
    this.focused = false
    return this
  }

  setValue(v) {
    this.lines = String(v).split('\n')
    if (this.lines.length === 0) this.lines = ['']
    this.row = this.lines.length - 1
    this.col = this.lines[this.row].length
    this._clamp()
    return this
  }

  setSize(width, height) {
    if (width) this.width = Math.max(1, width)
    if (height) this.height = Math.max(1, height)
    return this
  }

  reset() {
    this.lines = ['']
    this.row = 0
    this.col = 0
    this.yOffset = 0
    return this
  }

  update(msg) {
    if (!this.focused || !msg || msg.type !== 'key') return [this, null]

    if (msg.is('left', 'ctrl+b')) this._left()
    else if (msg.is('right', 'ctrl+f')) this._right()
    else if (msg.is('up')) this._vertical(-1)
    else if (msg.is('down')) this._vertical(1)
    else if (msg.is('home', 'ctrl+a')) this._home()
    else if (msg.is('end', 'ctrl+e')) this._end()
    else if (msg.is('enter')) this._newline()
    else if (msg.is('backspace')) this._backspace()
    else if (msg.is('delete')) this._delete()
    else this._insert(msg)

    return [this, null]
  }

  // ── editing ────────────────────────────────────────────────────────────

  _line() {
    return this.lines[this.row]
  }

  _left() {
    if (this.col > 0) this.col--
    else if (this.row > 0) {
      this.row--
      this.col = this._line().length
    }
  }

  _right() {
    if (this.col < this._line().length) this.col++
    else if (this.row < this.lines.length - 1) {
      this.row++
      this.col = 0
    }
  }

  _home() {
    const { vrow, rows } = this._cursor()
    this.col = rows[vrow].start
  }

  _end() {
    const { vrow, rows } = this._cursor()
    this.col = rows[vrow].start + rows[vrow].text.length
  }

  _newline() {
    if (this.charLimit && this.length >= this.charLimit) return
    const line = this._line()
    this.lines.splice(this.row, 1, line.slice(0, this.col), line.slice(this.col))
    this.row++
    this.col = 0
  }

  _backspace() {
    const line = this._line()
    if (this.col > 0) {
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col)
      this.col--
    } else if (this.row > 0) {
      const prev = this.lines[this.row - 1]
      this.col = prev.length
      this.lines[this.row - 1] = prev + line
      this.lines.splice(this.row, 1)
      this.row--
    }
  }

  _delete() {
    const line = this._line()
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1)
    } else if (this.row < this.lines.length - 1) {
      this.lines[this.row] = line + this.lines[this.row + 1]
      this.lines.splice(this.row + 1, 1)
    }
  }

  _insert(msg) {
    const ch = msg.sequence
    const printable =
      !msg.ctrl &&
      !msg.meta &&
      typeof ch === 'string' &&
      ch.length === 1 &&
      ch >= ' ' &&
      ch !== '\x7f'
    if (!printable) return
    if (this.charLimit && this.length >= this.charLimit) return

    const line = this._line()
    this.lines[this.row] = line.slice(0, this.col) + ch + line.slice(this.col)
    this.col++
  }

  _vertical(delta) {
    const { vrow, vcol, rows } = this._cursor()
    const target = Math.max(0, Math.min(vrow + delta, rows.length - 1))
    if (target === vrow) return
    const r = rows[target]
    this.row = r.line
    this.col = r.start + Math.min(vcol, r.text.length)
  }

  _clamp() {
    this.row = Math.max(0, Math.min(this.row, this.lines.length - 1))
    this.col = Math.max(0, Math.min(this.col, this._line().length))
  }

  // ── wrapping / cursor mapping ────────────────────────────────────────────

  // Visual rows: each logical line char-wrapped to width. A line whose length
  // is an exact multiple of width gets a trailing empty row so the cursor has
  // somewhere to sit at the wrap boundary.
  _visualRows() {
    const w = this.width
    const rows = []
    for (let l = 0; l < this.lines.length; l++) {
      const line = this.lines[l]
      if (line.length === 0) {
        rows.push({ line: l, start: 0, text: '' })
        continue
      }
      for (let s = 0; s < line.length; s += w) {
        rows.push({ line: l, start: s, text: line.slice(s, s + w) })
      }
      if (line.length % w === 0) rows.push({ line: l, start: line.length, text: '' })
    }
    return rows
  }

  // Locate the cursor among the visual rows.
  _cursor() {
    const rows = this._visualRows()
    let last = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.line !== this.row) continue
      last = i
      if (this.col >= r.start && this.col < r.start + r.text.length) {
        return { vrow: i, vcol: this.col - r.start, rows }
      }
      if (r.text.length === 0 && this.col === r.start) {
        return { vrow: i, vcol: 0, rows }
      }
    }
    const r = rows[last]
    return { vrow: last, vcol: this.col - r.start, rows }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  view() {
    const empty = this.lines.length === 1 && this.lines[0] === ''
    const { vrow, vcol, rows } = this._cursor()

    // Scroll the window to keep the cursor visible.
    if (vrow < this.yOffset) this.yOffset = vrow
    else if (vrow >= this.yOffset + this.height) this.yOffset = vrow - this.height + 1
    const maxOffset = Math.max(0, rows.length - this.height)
    this.yOffset = Math.max(0, Math.min(this.yOffset, maxOffset))

    const out = []
    for (let i = 0; i < this.height; i++) {
      const idx = this.yOffset + i
      if (empty && idx === 0) {
        out.push(this._placeholderRow())
      } else if (!rows[idx]) {
        out.push(' '.repeat(this.width))
      } else {
        const onCursor = this.focused && idx === vrow
        out.push(this._renderRow(rows[idx].text, onCursor ? vcol : -1))
      }
    }
    return out.join('\n')
  }

  _renderRow(text, cursorCol) {
    if (cursorCol < 0) return text.padEnd(this.width)
    const at = text[cursorCol] ?? ' '
    const line = text.slice(0, cursorCol) + reverse(at) + text.slice(cursorCol + 1)
    const visible = Math.max(text.length, cursorCol + 1)
    return line + ' '.repeat(Math.max(0, this.width - visible))
  }

  _placeholderRow() {
    const ph = this.placeholder
    if (!this.focused) return this._pad(dim(ph), ph.length)
    const head = ph.slice(0, 1) || ' '
    const body = reverse(head) + dim(ph.slice(1))
    return this._pad(body, Math.max(ph.length, 1))
  }

  _pad(styled, visibleLen) {
    return styled + ' '.repeat(Math.max(0, this.width - visibleLen))
  }
}

function create(opts) {
  return new TextArea(opts)
}

module.exports = { create, TextArea }
