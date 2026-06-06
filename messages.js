// Messages (Msg) are the only thing that flows into a model's update().
//
// A Msg is just a tagged plain object — authors can define their own. These are
// the ones the runtime itself produces. We keep the shapes small and stable so
// they read the same as Bubble Tea's KeyMsg / WindowSizeMsg / QuitMsg.

// KeyMsg wraps a decoded key from bare-ansi-escapes' KeyDecoder. The raw fields
// (name, ctrl, meta, shift, sequence) are preserved; toString() renders the
// Bubble Tea-style chord ("ctrl+c", "up", "enter") so update() can match on a
// single string instead of juggling booleans.
class KeyMsg {
  constructor(key) {
    this.type = 'key'
    this.name = key.name
    this.sequence = key.sequence
    this.ctrl = key.ctrl
    this.meta = key.meta
    this.shift = key.shift
  }

  toString() {
    const parts = []
    if (this.ctrl) parts.push('ctrl')
    if (this.meta) parts.push('alt')
    // Only surface shift for named keys; letters already arrive upper/lower.
    if (this.shift && this.name && this.name.length > 1) parts.push('shift')
    parts.push(this.name === 'return' ? 'enter' : this.name)
    return parts.join('+')
  }

  // True if this key matches any of the given chords. A chord is matched
  // against both the full string form ("ctrl+c", "enter") and the bare name
  // ("c", "return"), so 'enter'/'return' and 'esc'/'escape' both work.
  //   if (msg.is('q', 'ctrl+c')) ...
  is(...chords) {
    const str = this.toString()
    for (let chord of chords) {
      if (chord === 'esc') chord = 'escape'
      if (chord === str || chord === this.name) return true
    }
    return false
  }
}

// Emitted on startup and whenever the terminal is resized.
function windowSize(width, height) {
  return { type: 'resize', width, height }
}

// The runtime tears down and exits when it sees this. `quit` (see commands.js)
// is the Cmd that produces it.
function quitMsg() {
  return { type: 'quit' }
}

// Wraps an error thrown by a Cmd so it can be handled in update() rather than
// crashing the loop.
function errorMsg(error) {
  return { type: 'error', error }
}

module.exports = { KeyMsg, windowSize, quitMsg, errorMsg }
