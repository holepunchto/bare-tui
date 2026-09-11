// Input pre-parser — peels the sequences that aren't keystrokes off the byte
// stream before the key decoder sees them.
//
// bare-ansi-escapes' KeyDecoder only understands keys, so anything else the
// terminal reports has to be claimed first: SGR mouse reports
// (\x1b[<b;x;yM / m) and focus reports (\x1b[I on focus in, \x1b[O on focus
// out). InputParser does both in a single pass with a single partial buffer and
// hands the remaining bytes on untouched:
//
//   const parser = new InputParser({ mouse: 'basic', focus: true })
//   const { keys, events } = parser.feed(chunk)
//
// Each stream is opt-in: with `focus` off a focus report is left in `keys` and
// reaches the decoder exactly as it does today (as a key named 'undefined'), so
// enabling one mode never changes the other's behaviour. latin1 throughout so
// non-claimed bytes — including 8-bit meta keys — round-trip intact.
const { decode } = require('./mouse')
const { focusMsg } = require('./messages')

const ESC = '\x1b'

// An SGR mouse body is "b;x;y" — at most a handful of digits. Bounding the scan
// keeps a stray \x1b[< (which a user can type) from swallowing the rest of the
// session while it hunts for a terminator that never comes.
const MAX_MOUSE_BODY = 24

class InputParser {
  constructor({ mouse = null, focus = false } = {}) {
    this.mouse = !!mouse
    this.focus = !!focus
    this._partial = ''
  }

  // Drop any half-claimed sequence. Called when the terminal is handed to a
  // child process and reclaimed, so a prefix from before the suspend can't
  // corrupt the first bytes read after it.
  reset() {
    this._partial = ''
  }

  feed(buf) {
    const s = this._partial + buf.toString('latin1')
    this._partial = ''

    let keys = ''
    const events = []
    let i = 0

    while (i < s.length) {
      // Only CSI (ESC [) introduces something we might claim. This is also what
      // keeps SS3 (ESC O, the prefix for F1-F4 and application-mode arrows)
      // safe: it has no '[', so it never looks like a focus report.
      if (s[i] !== ESC || s[i + 1] !== '[') {
        keys += s[i++]
        continue
      }

      // The read ended on a bare "ESC [". Hold it: the decoder would park on
      // those same two bytes and emit nothing either way (its 500ms escape
      // timer only arms when ESC is the *last* byte written), so holding costs
      // no latency and lets a report split across reads still be recognised. A
      // lone trailing ESC is never held — that one does time out into an
      // escape key, and swallowing it would break the Escape key.
      if (i + 2 >= s.length) {
        this._partial = s.slice(i)
        break
      }

      const c = s[i + 2]

      if (this.focus && (c === 'I' || c === 'O')) {
        events.push(focusMsg(c === 'I'))
        i += 3
        continue
      }

      if (this.mouse && c === '<') {
        const cap = i + 3 + MAX_MOUSE_BODY
        let j = i + 3
        while (j < s.length && j < cap && ((s[j] >= '0' && s[j] <= '9') || s[j] === ';')) j++

        // Stopped because the input ran out (rather than because the body is
        // overlong or ended in something that isn't a terminator): wait for the
        // rest of the report.
        if (j === s.length && j < cap) {
          this._partial = s.slice(i)
          break
        }

        if (s[j] === 'M' || s[j] === 'm') {
          const event = decode(s.slice(i + 3, j), s[j])
          if (event) {
            events.push(event)
            i = j + 1
            continue
          }
        }
        // Malformed or overlong — not a report after all; fall through and let
        // the bytes go to the decoder as keys.
      }

      // Not ours: emit the ESC and re-examine the rest as ordinary key bytes.
      keys += s[i++]
    }

    return { keys: Buffer.from(keys, 'latin1'), events }
  }
}

module.exports = { InputParser }
