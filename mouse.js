// Mouse support — SGR (1006) tracking and decoding.
//
// This module owns the mode strings and the report decoder; pulling the reports
// out of the raw byte stream is input.js's job (it claims \x1b[<b;x;yM for
// press / motion and \x1b[<b;x;ym for release, and calls decode() on the body).
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

module.exports = { enable, disable, decode, MODES }
