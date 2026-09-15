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
    // The decoder reports a lone escape — the one that arrives by itself and
    // times out — with the meta flag it uses for ESC-prefixed keys, which
    // would spell it alt+escape. A real alt+escape is two escape bytes.
    this.meta = key.meta && !(key.name === 'escape' && key.sequence === '\x1b')
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

  // True if this key matches any of the given chords. A chord is compared
  // whole, so 'up' means up and not ctrl+up or shift+up; 'esc'/'escape' and
  // 'enter'/'return' are aliases.
  //   if (msg.is('q', 'ctrl+c')) ...
  is(...chords) {
    const str = this.toString()
    for (const chord of chords) {
      if (alias(chord) === str) return true
    }
    return false
  }
}

// The names a key goes by: the decoder says 'escape' and 'return', chords
// usually say 'esc' and 'enter'. Only the final segment is a key name.
function alias(chord) {
  return String(chord).replace(
    /(^|\+)(esc|return)$/,
    (m, sep, name) => sep + (name === 'esc' ? 'escape' : 'enter')
  )
}

// Emitted on startup and whenever the terminal is resized.
function windowSize(width, height) {
  return { type: 'resize', width, height }
}

// Emitted when the terminal window gains or loses focus. Only ever produced
// when the Program was created with `focus: true`, which puts the terminal into
// focus reporting (DEC private mode 1004). Reports are *transitions*: a terminal
// that supports the mode says nothing until the focus actually changes, so a
// model should assume it starts focused rather than wait to be told.
function focusMsg(focused) {
  return { type: 'focus', focused }
}

// Asks the runtime to repaint the whole screen on the next frame. The renderer
// only rewrites rows whose text changed, so anything that draws to the terminal
// behind its back — a native library logging to the same fd, a multiplexer
// redrawing a pane — leaves stale rows that never heal on their own. `repaint`
// (see commands.js) is the Cmd that produces it, and program.repaint() sends it
// from outside the loop.
function repaintMsg() {
  return { type: 'repaint' }
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

module.exports = { KeyMsg, windowSize, focusMsg, repaintMsg, quitMsg, errorMsg }
