// The renderer turns a model's View() string into terminal output, repainting
// only what changed.
//
// View() returns the whole frame as text. Naively rewriting it every tick
// flickers and wastes bandwidth, so we keep the previous frame and, on each
// render, only rewrite the lines that actually differ — addressing them with
// absolute cursor moves. This is the same strategy as Bubble Tea's standard
// renderer, and it's what makes a redraw-on-every-keystroke loop feel instant.
//
// Absolute addressing is only correct while the screen hasn't moved under us,
// so the renderer also owns two safeguards:
//
//   - it knows the screen geometry and fits every frame to it, because a frame
//     one row too tall (or one cell too wide, which wraps) scrolls the terminal
//     and puts every subsequent row address permanently out by one;
//   - clear() re-syncs from scratch, for the damage it can't prevent — another
//     process writing to the same fd, a terminal that dropped the alt-screen.
//
// Without those, a stale row is never repainted again: only rows whose *text*
// changed are rewritten, so a header with a clock heals itself every frame
// while a static body stays broken for the life of the process.
const ansi = require('./ansi')
const { style } = require('./style')

module.exports = class Renderer {
  constructor(output, { altScreen = true, width = 0, height = 0 } = {}) {
    this.out = output
    this.altScreen = altScreen
    this.width = width > 0 ? width : 0 // 0 => unknown, don't fit
    this.height = height > 0 ? height : 0
    this.lastLines = null // null => next render is a full repaint
  }

  // Enter the screen: optional alt buffer, hide the cursor, clear.
  start() {
    let s = ''
    if (this.altScreen) s += ansi.enterAltScreen
    s += ansi.cursorHide + ansi.home + ansi.eraseDisplay
    this.out.write(s)
  }

  // Force the next render() to repaint everything (used on resize, on a
  // repaint Msg, and when the terminal window regains focus).
  clear() {
    this.lastLines = null
  }

  // Tell the renderer how big the screen is. Frames are fitted to it from here
  // on, and the next render repaints in full since the geometry moved.
  resize(width, height) {
    this.width = width > 0 ? width : 0
    this.height = height > 0 ? height : 0
    this.clear()
  }

  // Trim one line to the screen width. Measured in visible cells — a styled
  // line's .length counts escape bytes the terminal never draws, and a wide
  // glyph occupies two columns.
  _fit(line) {
    if (this.width <= 0 || style.width(line) <= this.width) return line
    return style.truncate(line, this.width)
  }

  render(view) {
    let lines = String(view).split('\n')

    // Surplus rows would scroll the screen, and a scrolled screen breaks every
    // absolute cursor move from then on. Losing the overflow is recoverable;
    // losing the row addressing is not.
    if (this.height > 0 && lines.length > this.height) lines = lines.slice(0, this.height)

    let s = ''

    if (this.lastLines === null) {
      // Full repaint. \r\n (not \n) because raw mode doesn't translate \n into
      // a carriage return, so we'd otherwise stair-step down the screen.
      s += ansi.home
      for (let i = 0; i < lines.length; i++) {
        s += ansi.eraseLineEnd + this._fit(lines[i])
        if (i < lines.length - 1) s += '\r\n'
      }
      s += ansi.eraseDisplayEnd
    } else {
      // Diff: touch only changed rows. Compare the untrimmed text — _fit is a
      // pure function of (line, width) and a width change clears lastLines, so
      // equal input always means equal output.
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== this.lastLines[i]) {
          s += ansi.cursorTo(i, 0) + ansi.eraseLineEnd + this._fit(lines[i])
        }
      }
      // The frame got shorter — wipe the now-orphaned rows below it.
      if (this.lastLines.length > lines.length) {
        s += ansi.cursorTo(lines.length, 0) + ansi.eraseDisplayEnd
      }
    }

    this.lastLines = lines
    if (s) this.out.write(s)
  }

  // Restore the terminal: show the cursor, leave the alt buffer.
  stop() {
    let s = ansi.cursorShow
    if (this.altScreen) s += ansi.leaveAltScreen
    this.out.write(s)
  }
}
