// Mouse support — SGR (1006) tracking and decoding.
//
// bare-ansi-escapes' KeyDecoder doesn't understand mouse reports, so the
// Program runs raw input through MouseParser first: it pulls SGR sequences
// (\x1b[<b;x;yM for press / motion, \x1b[<b;x;ym for release) out of the byte
// stream as MouseMsgs and forwards everything else to the key decoder.
//
// A MouseMsg looks like:
//   { type: 'mouse', action, button, x, y, ctrl, alt, shift }
//   action: 'press' | 'release' | 'motion' | 'wheel'
//   button: 'left' | 'middle' | 'right' | 'none' | 'wheelup' | 'wheeldown'
//   x, y:   zero-indexed cell coordinates
const { constants } = require('bare-ansi-escapes')
const CSI = constants.CSI

const SGR = '?1006' // SGR extended coordinates (no 223-column cap, clean parse)
const MODES = {
  basic: '?1000', // press / release
  drag: '?1002', // + motion while a button is held
  all: '?1003' // + motion with no button (hover)
}

function enable(mode = 'basic') {
  const m = MODES[mode] || MODES.basic
  return CSI + m + 'h' + CSI + SGR + 'h'
}

function disable(mode = 'basic') {
  const m = MODES[mode] || MODES.basic
  return CSI + SGR + 'l' + CSI + m + 'l'
}

const BUTTONS = ['left', 'middle', 'right', 'none']

// Decode the "b;x;y" body of an SGR mouse report plus its final char.
function decode(body, final) {
  const parts = body.split(';')
  if (parts.length !== 3) return null
  const b = Number(parts[0])
  const col = Number(parts[1])
  const row = Number(parts[2])
  if (!Number.isInteger(b) || !Number.isInteger(col) || !Number.isInteger(row)) {
    return null
  }

  const mods = { ctrl: !!(b & 16), alt: !!(b & 8), shift: !!(b & 4) }

  let action
  let button
  if (b & 64) {
    action = 'wheel'
    button = b & 1 ? 'wheeldown' : 'wheelup'
  } else {
    button = BUTTONS[b & 3]
    action = b & 32 ? 'motion' : final === 'M' ? 'press' : 'release'
  }

  return { type: 'mouse', action, button, x: col - 1, y: row - 1, ...mods }
}

// Splits a byte stream into MouseMsgs and the remaining key bytes. Holds an
// incomplete trailing mouse sequence between feeds; uses latin1 throughout so
// non-mouse bytes (including 8-bit meta keys) round-trip to the decoder intact.
//
// Note: a mouse report split across two reads *before* its `<` arrives can't be
// distinguished from a key escape, so we only buffer once `\x1b[<` is seen.
// Terminals emit each report in a single write, so this is not a problem in
// practice.
class MouseParser {
  constructor() {
    this._partial = ''
  }

  feed(buf) {
    const s = this._partial + buf.toString('latin1')
    this._partial = ''

    let keys = ''
    const events = []
    let i = 0
    while (i < s.length) {
      if (s[i] === '\x1b' && s[i + 1] === '[' && s[i + 2] === '<') {
        let j = i + 3
        while (j < s.length && s[j] !== 'M' && s[j] !== 'm') j++
        if (j >= s.length) {
          this._partial = s.slice(i) // incomplete report; wait for more
          break
        }
        const ev = decode(s.slice(i + 3, j), s[j])
        if (ev) events.push(ev)
        i = j + 1
      } else {
        keys += s[i]
        i++
      }
    }

    return { keys: Buffer.from(keys, 'latin1'), events }
  }
}

module.exports = { enable, disable, decode, MouseParser, MODES }
