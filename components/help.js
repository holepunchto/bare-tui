// help — renders keybinding hints from key.binding({ keys, help }) objects.
//
// Unlike the other components this one is a *view helper*, not a loop model:
// its view(keymap) takes the bindings to show (mirroring bubbles/help, where
// help.View(keymap) is called from the parent's View). Bindings without a
// `help` entry are skipped, so internal keys stay hidden.
//
//   const h = help.create()
//   h.view([keys.up, keys.down, keys.quit])      // short: one line
//   h.showAll = true
//   h.view([[keys.up, keys.down], [keys.quit]])  // full: aligned columns
//
// A keymap can be an array of bindings, an object of bindings (values are
// used), or an object exposing shortHelp()/fullHelp() for full control.
const { style, width, truncate } = require('../style')

const defaultStyles = {
  key: (s) => s,
  desc: (s) => style().faint(true).render(s),
  sep: (s) => style().faint(true).render(s)
}

function toBindings(x) {
  if (!x) return []
  return Array.isArray(x) ? x : Object.values(x)
}

// Resolve a keymap into the binding list (short) or list-of-columns (full).
function resolve(keymap, showAll) {
  if (Array.isArray(keymap)) {
    if (!showAll) return keymap
    // Full mode: an array of arrays is already columns; a flat list is one.
    return keymap.length && Array.isArray(keymap[0]) ? keymap : [keymap]
  }

  if (showAll) {
    if (typeof keymap.fullHelp === 'function') return keymap.fullHelp()
    if (keymap.full) return keymap.full
    const short =
      typeof keymap.shortHelp === 'function'
        ? keymap.shortHelp()
        : keymap.short || toBindings(keymap)
    return [short]
  }

  if (typeof keymap.shortHelp === 'function') return keymap.shortHelp()
  if (keymap.short) return keymap.short
  return toBindings(keymap)
}

function helpful(binding) {
  return binding && binding.help && binding.help.key
}

class Help {
  constructor(opts = {}) {
    this.width = opts.width || 0 // 0 = no truncation
    this.showAll = !!opts.showAll
    this.separator = opts.separator || ' • '
    this.styles = { ...defaultStyles, ...(opts.styles || {}) }
  }

  setWidth(n) {
    this.width = n
    return this
  }

  view(keymap) {
    if (this.showAll) {
      const columns = resolve(keymap, true)
        .map((group) => this._column(group))
        .filter((c) => c.length)
      if (!columns.length) return ''

      const blocks = []
      columns.forEach((c, i) => {
        if (i) blocks.push('   ') // gutter between columns
        blocks.push(c)
      })
      return style.joinHorizontal(style.position.top, ...blocks)
    }

    return this._short(resolve(keymap, false))
  }

  _short(bindings) {
    const items = bindings.filter(helpful)
    if (!items.length) return ''

    const sep = this.styles.sep(this.separator)
    let line = items
      .map((b) => this.styles.key(b.help.key) + ' ' + this.styles.desc(b.help.desc))
      .join(sep)

    if (this.width > 0 && width(line) > this.width) line = truncate(line, this.width)
    return line
  }

  _column(bindings) {
    const items = bindings.filter(helpful)
    if (!items.length) return ''

    const keyW = Math.max(...items.map((b) => width(b.help.key)))
    return items
      .map((b) => {
        const gap = ' '.repeat(keyW - width(b.help.key) + 2)
        return this.styles.key(b.help.key) + gap + this.styles.desc(b.help.desc)
      })
      .join('\n')
  }
}

function create(opts) {
  return new Help(opts)
}

module.exports = { create, Help }
