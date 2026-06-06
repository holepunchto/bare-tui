// radio — single choice from a fixed set of options.
//
// A tiny vertical list where the cursor *is* the value: up/down (or k/j) move
// the selection directly, so there is no separate "highlight vs commit" step.
// Like the other field controls it only reacts when focused and never consumes
// enter, leaving enter free for a parent's submit.
//
//   const size = radio.create({
//     options: ['small', 'medium', 'large'],
//     selected: 1
//   }).focus()
//   // in update: const [r] = size.update(msg); this.size = r
//   // in view:   size.view()
//   size.value()   // 'medium'
//
// Options may be strings or { label, value } objects; value() returns the
// underlying value (the label when none is given). The chosen option always
// shows a filled bullet so the value is visible even when blurred; a leading
// '›' marks the focused row.
const key = require('../key')

const keys = {
  up: key.binding({ keys: ['up', 'k'], help: { key: '↑/k', desc: 'up' } }),
  down: key.binding({ keys: ['down', 'j'], help: { key: '↓/j', desc: 'down' } })
}

// Normalise an option to { label, value }. Bare values become their own label.
function normalize(opt) {
  if (opt !== null && typeof opt === 'object') {
    const value = 'value' in opt ? opt.value : opt.label
    return { label: String(opt.label ?? opt.value ?? ''), value }
  }
  return { label: String(opt), value: opt }
}

class Radio {
  constructor(opts = {}) {
    this.options = (opts.options || []).map(normalize)
    this.selected = opts.selected || 0 // index into options
    this.focused = !!opts.focused
    this.onGlyph = opts.onGlyph || '(•)'
    this.offGlyph = opts.offGlyph || '( )'
    this._clamp()
  }

  focus() {
    this.focused = true
    return this
  }

  blur() {
    this.focused = false
    return this
  }

  // The chosen option's value, or null when there are no options.
  value() {
    const o = this.options[this.selected]
    return o ? o.value : null
  }

  // The chosen { label, value }, or null.
  selectedOption() {
    return this.options[this.selected] || null
  }

  setOptions(options) {
    this.options = (options || []).map(normalize)
    this._clamp()
    return this
  }

  // Select by value; no-op if the value isn't present.
  setValue(v) {
    const i = this.options.findIndex((o) => o.value === v)
    if (i >= 0) this.selected = i
    return this
  }

  update(msg) {
    if (!this.focused || !msg || msg.type !== 'key') return [this, null]
    if (key.matches(msg, keys.up)) this._move(-1)
    else if (key.matches(msg, keys.down)) this._move(1)
    return [this, null]
  }

  _move(delta) {
    if (!this.options.length) return
    this.selected = Math.max(0, Math.min(this.selected + delta, this.options.length - 1))
  }

  _clamp() {
    if (!this.options.length) this.selected = 0
    else this.selected = Math.max(0, Math.min(this.selected, this.options.length - 1))
  }

  view() {
    return this.options
      .map((o, i) => {
        const chosen = i === this.selected
        const pointer = this.focused && chosen ? '› ' : '  '
        const bullet = chosen ? this.onGlyph : this.offGlyph
        return pointer + bullet + ' ' + o.label
      })
      .join('\n')
  }
}

function create(opts) {
  return new Radio(opts)
}

module.exports = { create, Radio, keys }
