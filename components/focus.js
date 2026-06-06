// focus — an ordered focus ring across a set of child components.
//
// This is connective tissue, not a widget: it has no view(). It holds an
// ordered list of focusable children and owns the one job every multi-field
// screen reimplements — moving focus between them with tab/shift+tab, blurring
// the old and focusing the new. It relies only on the component contract the
// built-ins already follow (`focus()` / `blur()` and `update(msg) → [m, cmd]`).
//
//   this.ring = focus.create({
//     items: [
//       textinput.create({ prompt: '> ' }),
//       radio.create({ options: ['a', 'b'] }),
//       checkbox.create({ label: 'ok' })
//     ]
//   })
//
//   update(msg) {
//     // Handle global / submit keys FIRST so a focused child can't swallow them.
//     if (key.matches(msg, 'ctrl+c')) return [this, quit]
//     if (key.matches(msg, 'enter')) return [this, this._submit()]
//     // Then let the ring move focus and route the rest to the focused child,
//     // threading its Cmd back up.
//     const [ring, cmd] = this.ring.update(msg)
//     this.ring = ring
//     return [this, cmd]
//   }
//   view() { return this.ring.items.map((it) => it.view()).join('\n') }
//
// Navigation defaults to tab/shift+tab ONLY — deliberately not up/down, because
// the focusable children (radio, select, list, textarea) use the arrows
// internally. Pass `keys` to override if your children don't. focus() syncs the
// children on construction so exactly the indexed one is focused.
const key = require('../key')

const defaultKeys = {
  next: key.binding({ keys: ['tab'], help: { key: 'tab', desc: 'next field' } }),
  prev: key.binding({ keys: ['shift+tab'], help: { key: 'shift+tab', desc: 'prev field' } })
}

class Focus {
  constructor(opts = {}) {
    this.items = opts.items ? opts.items.slice() : []
    this.index = opts.index || 0
    this.keys = opts.keys || defaultKeys
    this._clamp()
    this._sync()
  }

  // The currently focused child, or null when there are none.
  focused() {
    return this.items[this.index] || null
  }

  setItems(items) {
    this.items = items ? items.slice() : []
    this._clamp()
    this._sync()
    return this
  }

  // Focus a specific index (clamped); blurs the rest.
  focus(i) {
    this.index = i
    this._clamp()
    this._sync()
    return this
  }

  next() {
    this._move(1)
    return this
  }

  prev() {
    this._move(-1)
    return this
  }

  update(msg) {
    // Ring navigation is handled here, before the child sees the key. Check the
    // more-specific 'prev' chord (shift+tab) first: key matching also accepts a
    // bare name, so a 'tab' binding would otherwise swallow 'shift+tab' too.
    if (key.matches(msg, this.keys.prev)) {
      this._move(-1)
      return [this, null]
    }
    if (key.matches(msg, this.keys.next)) {
      this._move(1)
      return [this, null]
    }

    // Everything else goes to the focused child; thread its Cmd up.
    const cur = this.items[this.index]
    if (cur && typeof cur.update === 'function') {
      const [m, cmd] = cur.update(msg)
      this.items[this.index] = m
      return [this, cmd]
    }
    return [this, null]
  }

  _move(dir) {
    if (this.items.length < 2) return
    this.index = (this.index + dir + this.items.length) % this.items.length
    this._sync()
  }

  _clamp() {
    if (!this.items.length) this.index = 0
    else this.index = Math.max(0, Math.min(this.index, this.items.length - 1))
  }

  // Make exactly items[index] focused; blur the rest. Guards children that
  // don't implement the focus contract.
  _sync() {
    this.items.forEach((it, i) => {
      if (!it) return
      if (i === this.index) {
        if (typeof it.focus === 'function') it.focus()
      } else if (typeof it.blur === 'function') it.blur()
    })
  }
}

function create(opts) {
  return new Focus(opts)
}

module.exports = { create, Focus, defaultKeys }
