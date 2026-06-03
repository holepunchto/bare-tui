// table — fixed-width columns with selectable, scrolling rows.
//
//   const t = table.create({
//     columns: [{ title: 'Name', width: 12 }, { title: 'Lang', width: 8 }],
//     rows: [['corestore', 'js'], ['hypercore', 'js']],
//     height: 8
//   })
//
// Cells are truncated/padded to their column width (ANSI-aware), the selection
// is a reverse-video bar, and the body scrolls in a `height`-row window. Like
// list/viewport it always responds to its keys — the parent decides routing.
const key = require('../key')
const { style, width, truncate } = require('../style')

const header = (s) => style().bold(true).render(s)
const selected = (s) => style().reverse(true).render(s)
const dim = (s) => style().faint(true).render(s)

const keys = {
  up: key.binding({ keys: ['up', 'k'], help: { key: '↑/k', desc: 'up' } }),
  down: key.binding({ keys: ['down', 'j'], help: { key: '↓/j', desc: 'down' } }),
  pageUp: key.binding({ keys: ['pageup'] }),
  pageDown: key.binding({ keys: ['pagedown'] }),
  top: key.binding({ keys: ['home'], help: { key: 'home', desc: 'top' } }),
  bottom: key.binding({ keys: ['end'], help: { key: 'end', desc: 'bottom' } })
}

// Truncate/pad a value to exactly `w` visible cells.
function cell(value, w) {
  const text = String(value ?? '')
  if (width(text) > w) return truncate(text, w)
  return text + ' '.repeat(w - width(text))
}

class Table {
  constructor(opts = {}) {
    this.columns = opts.columns || []
    this.rows = opts.rows || []
    this.height = opts.height || 10 // visible body rows
    this.rule = opts.rule || '─'
    this.cursor = 0
    this.offset = 0
    this._clamp()
  }

  get totalWidth() {
    if (!this.columns.length) return 0
    const cols = this.columns.reduce((sum, c) => sum + c.width, 0)
    return cols + (this.columns.length - 1) // single-space gutters
  }

  selectedRow() {
    return this.rows[this.cursor] || null
  }

  setRows(rows) {
    this.rows = rows
    this._clamp()
    return this
  }

  setColumns(columns) {
    this.columns = columns
    return this
  }

  gotoTop() {
    this.cursor = 0
    this.offset = 0
    return this
  }

  gotoBottom() {
    this.cursor = Math.max(0, this.rows.length - 1)
    this.offset = Math.max(0, this.rows.length - this.height)
    return this
  }

  _move(delta) {
    if (!this.rows.length) return
    this.cursor = Math.max(0, Math.min(this.cursor + delta, this.rows.length - 1))
    if (this.cursor < this.offset) this.offset = this.cursor
    else if (this.cursor >= this.offset + this.height) {
      this.offset = this.cursor - this.height + 1
    }
  }

  _clamp() {
    this.cursor = Math.max(0, Math.min(this.cursor, Math.max(0, this.rows.length - 1)))
    const maxOffset = Math.max(0, this.rows.length - this.height)
    this.offset = Math.max(0, Math.min(this.offset, maxOffset))
  }

  update(msg) {
    if (!msg || msg.type !== 'key') return [this, null]
    if (key.matches(msg, keys.up)) this._move(-1)
    else if (key.matches(msg, keys.down)) this._move(1)
    else if (key.matches(msg, keys.pageUp)) this._move(-this.height)
    else if (key.matches(msg, keys.pageDown)) this._move(this.height)
    else if (key.matches(msg, keys.top)) this.gotoTop()
    else if (key.matches(msg, keys.bottom)) this.gotoBottom()
    return [this, null]
  }

  _row(cells) {
    return this.columns.map((c, i) => cell(cells[i], c.width)).join(' ')
  }

  view() {
    const lines = []
    lines.push(header(this._row(this.columns.map((c) => c.title))))
    lines.push(dim(this.rule.repeat(this.totalWidth)))

    const end = Math.min(this.offset + this.height, this.rows.length)
    const body = []
    for (let i = this.offset; i < end; i++) {
      const line = this._row(this.rows[i])
      body.push(i === this.cursor ? selected(line) : line)
    }
    while (body.length < this.height) body.push(' '.repeat(this.totalWidth))

    return lines.concat(body).join('\n')
  }
}

function create(opts) {
  return new Table(opts)
}

module.exports = { create, Table, keys }
