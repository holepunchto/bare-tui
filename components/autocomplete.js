// autocomplete — a single-line input with a filtered suggestion menu.
//
// A composition over textinput (the same pattern list uses for its filter): it
// folds keys into an embedded field, then offers a menu of suggestions that
// match what's been typed. Typical use is a slash-command palette — the menu
// opens only once the line begins with a trigger character (default '/'), so
// ordinary prose typed into the same field never pops a menu.
//
//   const ac = autocomplete.create({
//     prompt: '> ',
//     placeholder: 'message, or / for commands',
//     suggestions: [
//       { name: 'help', desc: 'show help' },
//       { name: 'clear', desc: 'clear the screen' }
//     ]
//   }).focus()
//
// The component never consumes enter — the parent decides what it means. A
// common pattern is "enter submits the line, but the highlighted command when
// the menu is open", which both completes and runs in one keystroke:
//
//   if (key.matches(msg, 'enter')) {
//     const s = ac.open && ac.selectedSuggestion()
//     return [this, submit(s ? '/' + s.name : ac.value)]
//   }
//   const [f, cmd] = ac.update(msg); this.input = f; return [this, cmd]
//
// While the menu is open ↑/↓ move the highlight, tab accepts it (completing the
// line), and esc dismisses it; every other key edits the field. The view()
// draws the input line only — call menuView() to render the dropdown wherever
// it fits (above a bottom-anchored prompt, below a top one).
const key = require('../key')
const ansi = require('../ansi')
const { style } = require('../style')
const textinput = require('./textinput')

const dim = (s) => ansi.modifierDim + s + ansi.modifierReset

const keys = {
  up: key.binding({ keys: ['up', 'ctrl+p'], help: { key: '↑', desc: 'prev' } }),
  down: key.binding({ keys: ['down', 'ctrl+n'], help: { key: '↓', desc: 'next' } }),
  accept: key.binding({ keys: ['tab'], help: { key: 'tab', desc: 'accept' } }),
  dismiss: key.binding({ keys: ['esc'], help: { key: 'esc', desc: 'dismiss' } })
}

// Normalise a suggestion to { name, desc }. Bare strings become name-only.
function normalize(s) {
  if (typeof s === 'string') return { name: s, desc: '' }
  return { name: String(s.name ?? ''), desc: String(s.desc ?? '') }
}

class Autocomplete {
  constructor(opts = {}) {
    this.trigger = opts.trigger ?? '/'
    this.suggestions = (opts.suggestions || []).map(normalize)
    this.maxVisible = opts.maxVisible || 6
    this.width = opts.width || 0 // 0 = size the menu to its content

    this.input = textinput.create({
      value: opts.value || '',
      placeholder: opts.placeholder || '',
      prompt: opts.prompt || '',
      focused: !!opts.focused
    })

    this.selected = 0 // highlight within the current matches
    this.dismissed = false // esc / accept hides the menu until the value changes
    this._lastValue = this.input.value
  }

  get value() {
    return this.input.value
  }
  get focused() {
    return this.input.focused
  }

  focus() {
    this.input.focus()
    return this
  }
  blur() {
    this.input.blur()
    return this
  }

  setValue(v) {
    this.input.setValue(v)
    this._lastValue = this.input.value
    return this
  }
  reset() {
    this.input.reset()
    this.selected = 0
    this.dismissed = false
    this._lastValue = ''
    return this
  }
  setSuggestions(list) {
    this.suggestions = (list || []).map(normalize)
    return this
  }

  // The suggestions matching the typed text, or [] when no menu is warranted.
  // A menu is warranted once the line begins with the trigger; the text after
  // it is a case-insensitive prefix filter over suggestion names.
  matches() {
    const v = this.input.value
    if (!v.startsWith(this.trigger)) return []
    const typed = v.slice(this.trigger.length).toLowerCase()
    return this.suggestions.filter((s) => s.name.toLowerCase().startsWith(typed))
  }

  // Whether the dropdown is currently showing.
  get open() {
    return this.input.focused && !this.dismissed && this.matches().length > 0
  }

  // The highlighted suggestion, or null.
  selectedSuggestion() {
    const m = this.matches()
    return m.length ? m[Math.min(this.selected, m.length - 1)] : null
  }

  // Complete the line to the highlighted suggestion and close the menu.
  accept() {
    const s = this.selectedSuggestion()
    if (!s) return this
    this.input.setValue(this.trigger + s.name + ' ')
    this.input.cursor = this.input.value.length
    this.dismissed = true
    this._lastValue = this.input.value
    return this
  }

  update(msg) {
    if (!msg || msg.type !== 'key' || !this.input.focused) return [this, null]

    // Menu navigation takes priority over field editing while it's open.
    if (this.open) {
      if (key.matches(msg, keys.up)) return [this._move(-1), null]
      if (key.matches(msg, keys.down)) return [this._move(1), null]
      if (key.matches(msg, keys.accept)) return [this.accept(), null]
      if (key.matches(msg, keys.dismiss)) {
        this.dismissed = true
        return [this, null]
      }
    }

    const [input, cmd] = this.input.update(msg)
    this.input = input
    // Any edit to the text re-opens the menu and re-clamps the highlight.
    if (this.input.value !== this._lastValue) {
      this.dismissed = false
      this._lastValue = this.input.value
      this.selected = 0
    }
    return [this, cmd]
  }

  _move(dir) {
    const n = this.matches().length
    if (n) this.selected = (this.selected + dir + n) % n
    return this
  }

  view() {
    return this.input.view()
  }

  // The dropdown, or '' when closed. Rows are `/name  desc`, the highlight in
  // reverse video; a footer notes any matches scrolled out of view.
  menuView() {
    if (!this.open) return ''
    const all = this.matches()
    const sel = Math.min(this.selected, all.length - 1)

    // Keep the highlight inside a maxVisible-row window.
    const start = Math.max(0, Math.min(sel - this.maxVisible + 1, all.length - this.maxVisible))
    const top = all.length > this.maxVisible ? Math.max(0, start) : 0
    const shown = all.slice(top, top + this.maxVisible)

    const nameW = Math.max(...all.map((s) => (this.trigger + s.name).length))
    const rows = shown.map((s, i) => {
      const isSel = top + i === sel
      const label = (this.trigger + s.name).padEnd(nameW)
      const text = s.desc ? label + '  ' + s.desc : label
      if (isSel) {
        return style()
          .foreground('black')
          .background('magenta')
          .render(' ' + text + ' ')
      }
      return ' ' + style().foreground('magenta').render(label) + (s.desc ? '  ' + dim(s.desc) : '')
    })

    if (all.length > shown.length) {
      rows.push(dim(`  …${all.length - shown.length} more`))
    }
    return rows.join('\n')
  }
}

function create(opts) {
  return new Autocomplete(opts)
}

module.exports = { create, Autocomplete, keys }
