// dialog — a bordered box painted over the screen: a title in its top edge,
// a hint in its bottom one, centred unless placed. It holds no state of its
// own; what it shows is the caller's, so a palette, a form or a confirmation
// is a dialog around a component the app already routes keys to.
//
//   const { dialog, style } = require('bare-tui')
//   const box = dialog.create({ title: 'Commands', hint: 'esc close', width: 60 })
//
//   view() {
//     const screen = [header, body, footer].join('\n')
//     return this.open ? box.overlay(screen, this.palette.view()) : screen
//   }
const { style } = require('../style')

function create(opts) {
  return new Dialog(opts)
}

class Dialog {
  constructor({
    title = '',
    hint = '',
    width = 0,
    border = style.borders.rounded,
    borderForeground = null,
    titleStyle = style().bold(true),
    hintStyle = style().faint(true)
  } = {}) {
    this.title = title
    this.hint = hint
    this.width = width // outer width; 0 fits the content
    this.border = border
    this.borderForeground = borderForeground
    this.titleStyle = titleStyle
    this.hintStyle = hintStyle
  }

  // The box around `content`, lines truncated to fit.
  view(content) {
    const lines = String(content).split('\n')
    const w = this.width || Math.max(...lines.map(style.width)) + 4
    const inner = w - 4 // the border and a space of padding each side
    let box = style()
      .width(inner)
      .padding(0, 1)
      .border(this.border)
      .borderForeground(this.borderForeground)
      .render(lines.map((l) => style.truncate(l, inner)).join('\n'))

    const rows = box.split('\n').length
    const label = (s, st) => ' ' + st.render(s) + ' '
    if (this.title) box = style.overlay(box, label(this.title, this.titleStyle), 2, 0)
    if (this.hint) {
      const at = w - 4 - style.width(this.hint)
      box = style.overlay(box, label(this.hint, this.hintStyle), Math.max(2, at), rows - 1)
    }
    return box
  }

  // `screen` with the box painted over its middle, or at (x, y).
  overlay(screen, content, x, y) {
    return style.overlay(screen, this.view(content), x, y)
  }
}

module.exports = { create }
