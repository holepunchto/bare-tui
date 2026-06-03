// The renderer turns a model's View() string into terminal output, repainting
// only what changed.
//
// View() returns the whole frame as text. Naively rewriting it every tick
// flickers and wastes bandwidth, so we keep the previous frame and, on each
// render, only rewrite the lines that actually differ — addressing them with
// absolute cursor moves. This is the same strategy as Bubble Tea's standard
// renderer, and it's what makes a redraw-on-every-keystroke loop feel instant.
const ansi = require('./ansi')

module.exports = class Renderer {
  constructor(output, { altScreen = true } = {}) {
    this.out = output
    this.altScreen = altScreen
    this.lastLines = null // null => next render is a full repaint
  }

  // Enter the screen: optional alt buffer, hide the cursor, clear.
  start() {
    let s = ''
    if (this.altScreen) s += ansi.enterAltScreen
    s += ansi.cursorHide + ansi.home + ansi.eraseDisplay
    this.out.write(s)
  }

  // Force the next render() to repaint everything (used on resize).
  clear() {
    this.lastLines = null
  }

  render(view) {
    const lines = String(view).split('\n')
    let s = ''

    if (this.lastLines === null) {
      // Full repaint. \r\n (not \n) because raw mode doesn't translate \n into
      // a carriage return, so we'd otherwise stair-step down the screen.
      s += ansi.home
      for (let i = 0; i < lines.length; i++) {
        s += ansi.eraseLineEnd + lines[i]
        if (i < lines.length - 1) s += '\r\n'
      }
      s += ansi.eraseDisplayEnd
    } else {
      // Diff: touch only changed rows.
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== this.lastLines[i]) {
          s += ansi.cursorTo(i, 0) + ansi.eraseLineEnd + lines[i]
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
