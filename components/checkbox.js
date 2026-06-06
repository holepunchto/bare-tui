// checkbox — a single boolean toggle.
//
// A leaf input in the textinput mould: it only reacts when focused, so a parent
// can broadcast keys to several controls and only the focused one moves. Space
// toggles; it deliberately never consumes enter, so a parent form can keep enter
// for "submit" while a checkbox has focus.
//
//   const agree = checkbox.create({ label: 'I agree', checked: false }).focus()
//   // in update: const [c] = agree.update(msg); this.agree = c
//   // in view:   agree.view()   // "› [x] I agree"
//
// Focus is shown with a leading '›' pointer (a blank when blurred), the same
// idiom radio and select use, so a stack of controls reads consistently and the
// pointer never shifts the line width.
const key = require('../key')

const keys = {
  // Space only — enter is left for the parent (e.g. submit).
  toggle: key.binding({ keys: ['space'], help: { key: 'space', desc: 'toggle' } })
}

class Checkbox {
  constructor(opts = {}) {
    this.label = opts.label || ''
    this.checked = !!opts.checked
    this.focused = !!opts.focused
    this.checkedGlyph = opts.checkedGlyph || '[x]'
    this.uncheckedGlyph = opts.uncheckedGlyph || '[ ]'
  }

  focus() {
    this.focused = true
    return this
  }

  blur() {
    this.focused = false
    return this
  }

  setChecked(v) {
    this.checked = !!v
    return this
  }

  toggle() {
    this.checked = !this.checked
    return this
  }

  update(msg) {
    if (!this.focused || !msg || msg.type !== 'key') return [this, null]
    if (key.matches(msg, keys.toggle)) this.toggle()
    return [this, null]
  }

  view() {
    const pointer = this.focused ? '› ' : '  '
    const box = this.checked ? this.checkedGlyph : this.uncheckedGlyph
    return pointer + (this.label ? box + ' ' + this.label : box)
  }
}

function create(opts) {
  return new Checkbox(opts)
}

module.exports = { create, Checkbox, keys }
