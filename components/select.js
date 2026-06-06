// select — a compact dropdown over a fixed list of options.
//
// Where autocomplete is for *open* typing with a filtered menu, select is for a
// *closed* set you pick from. It shows one line (the current choice) until you
// open it, then a menu of options to choose from. Like autocomplete it splits
// rendering in two so a dropdown never reflows the layout:
//
//   view()      → the one-line control (always one line, stable width)
//   menuView()  → the dropdown rows, or '' when closed — overlay this where it
//                 fits (below a top-anchored control, above a bottom one)
//
//   const fruit = select.create({
//     options: ['apple', 'banana', 'cherry'],
//     placeholder: 'pick one'
//   }).focus()
//   fruit.value()   // 'apple', or null while nothing is chosen
//
// Key contract (mirrors the other field controls): while *closed* it consumes
// only space (to open) and never enter, so a parent form keeps enter for
// submit. While *open* it owns the menu — up/down move, enter or space commit,
// esc cancels — which is fine because a form won't submit with a menu open.
const key = require('../key')
const ansi = require('../ansi')
const { style } = require('../style')

const dim = (s) => ansi.modifierDim + s + ansi.modifierReset

const keys = {
  open: key.binding({ keys: ['space'], help: { key: 'space', desc: 'open' } }),
  up: key.binding({ keys: ['up', 'k'], help: { key: '↑/k', desc: 'up' } }),
  down: key.binding({ keys: ['down', 'j'], help: { key: '↓/j', desc: 'down' } }),
  commit: key.binding({ keys: ['enter', 'space'], help: { key: 'enter', desc: 'select' } }),
  cancel: key.binding({ keys: ['esc'], help: { key: 'esc', desc: 'cancel' } })
}

// Normalise an option to { label, value }. Bare values become their own label.
function normalize(opt) {
  if (opt !== null && typeof opt === 'object') {
    const value = 'value' in opt ? opt.value : opt.label
    return { label: String(opt.label ?? opt.value ?? ''), value }
  }
  return { label: String(opt), value: opt }
}

class Select {
  constructor(opts = {}) {
    this.options = (opts.options || []).map(normalize)
    this.selected = opts.selected ?? -1 // committed choice; -1 = none yet
    this.placeholder = opts.placeholder || 'select…'
    this.focused = !!opts.focused
    this.maxVisible = opts.maxVisible || 6
    this.openGlyph = opts.openGlyph || '▾'

    this.open = false
    this.highlight = 0 // cursor within the menu while open
    this._clampSelected()
  }

  focus() {
    this.focused = true
    return this
  }

  blur() {
    this.focused = false
    this.open = false
    return this
  }

  // The committed value, or null when nothing is chosen.
  value() {
    const o = this.options[this.selected]
    return o ? o.value : null
  }

  selectedOption() {
    return this.options[this.selected] || null
  }

  setOptions(options) {
    this.options = (options || []).map(normalize)
    this._clampSelected()
    return this
  }

  // Select by value; no-op if absent.
  setValue(v) {
    const i = this.options.findIndex((o) => o.value === v)
    if (i >= 0) this.selected = i
    return this
  }

  update(msg) {
    if (!this.focused || !msg || msg.type !== 'key') return [this, null]

    if (!this.open) {
      if (key.matches(msg, keys.open) && this.options.length) {
        this.open = true
        this.highlight = this.selected >= 0 ? this.selected : 0
      }
      return [this, null]
    }

    // Menu is open: it owns navigation, commit and cancel.
    if (key.matches(msg, keys.cancel)) this.open = false
    else if (key.matches(msg, keys.up)) this._move(-1)
    else if (key.matches(msg, keys.down)) this._move(1)
    else if (key.matches(msg, keys.commit)) {
      this.selected = this.highlight
      this.open = false
    }
    return [this, null]
  }

  _move(delta) {
    if (!this.options.length) return
    this.highlight = Math.max(0, Math.min(this.highlight + delta, this.options.length - 1))
  }

  _clampSelected() {
    if (this.selected < -1) this.selected = -1
    if (this.selected > this.options.length - 1) this.selected = this.options.length - 1
  }

  view() {
    const pointer = this.focused ? '› ' : '  '
    const chosen = this.options[this.selected]
    const label = chosen ? chosen.label : dim(this.placeholder)
    return pointer + label + ' ' + this.openGlyph
  }

  // The dropdown, or '' when closed. Highlight is drawn black-on-magenta to
  // match autocomplete's menu; a footer notes options scrolled out of view.
  menuView() {
    if (!this.open || !this.options.length) return ''

    // Keep the highlight inside a maxVisible-row window.
    const n = this.options.length
    const start =
      n > this.maxVisible
        ? Math.max(0, Math.min(this.highlight - this.maxVisible + 1, n - this.maxVisible))
        : 0
    const shown = this.options.slice(start, start + this.maxVisible)

    const rows = shown.map((o, i) => {
      const isSel = start + i === this.highlight
      if (isSel)
        return style()
          .foreground('black')
          .background('magenta')
          .render(' ' + o.label + ' ')
      return ' ' + o.label
    })

    if (n > shown.length) rows.push(dim(`  …${n - shown.length} more`))
    return rows.join('\n')
  }
}

function create(opts) {
  return new Select(opts)
}

module.exports = { create, Select, keys }
