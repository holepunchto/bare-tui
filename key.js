// Key matching helpers — the ergonomic front door to KeyMsg in update().
//
//   const { key } = require('./lib/tea')
//   if (key.matches(msg, 'q', 'ctrl+c')) return [model, quit]
//
// matches() is null/type-safe: it returns false for any non-key Msg, so you
// don't have to guard `msg.type === 'key'` first.

// A reusable named binding: the chords that trigger an action plus optional
// help text. Shaped for a future help component, but useful now as a single
// place to define an action's keys.
//   const up = key.binding({ keys: ['up', 'k'], help: { key: '↑/k', desc: 'up' } })
//   if (key.matches(msg, up)) ...
function binding({ keys = [], help = null } = {}) {
  return { keys: [].concat(keys), help }
}

// True if `msg` is a key matching any of the given chords or bindings. Bindings
// are expanded to their `keys`, so you can mix:
//   key.matches(msg, 'enter', someBinding, 'ctrl+c')
function matches(msg, ...items) {
  if (!msg || msg.type !== 'key' || typeof msg.is !== 'function') return false
  const chords = items.flatMap((item) =>
    item && typeof item === 'object' && Array.isArray(item.keys) ? item.keys : [item]
  )
  return msg.is(...chords)
}

module.exports = { matches, binding }
