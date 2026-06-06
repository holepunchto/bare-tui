// A textarea demo: a little notes editor in a box.
//
//   bare examples/textarea.js
//
// Type to edit, enter for new lines, arrows/home/end to move (up/down move by
// visual row through wrapped text). ctrl+c quits — q is just a character here,
// since the textarea owns the keyboard.
const { Program, quit, key, textarea, style } = require('..')

class Editor {
  constructor() {
    this.width = 80
    this.height = 24
    this.ta = textarea.create({ width: 60, height: 10, placeholder: 'Start typing…' }).focus()
  }

  update(msg) {
    if (msg.type === 'key' && key.matches(msg, 'ctrl+c')) return [this, quit]
    if (msg.type === 'resize') {
      this.width = msg.width
      this.height = msg.height
      this.ta.setSize(Math.max(20, this.width - 4), Math.max(3, this.height - 4))
      return [this, null]
    }
    const [ta] = this.ta.update(msg)
    this.ta = ta
    return [this, null]
  }

  view() {
    const box = style()
      .border(style.borders.rounded)
      .borderForeground('blue')
      .width(this.ta.width)
      .render(this.ta.view())

    return style.joinVertical(
      style.position.left,
      style().bold(true).foreground('magenta').render(' notes'),
      box,
      style().faint(true).render(` ${this.ta.length} chars · ctrl+c quit`)
    )
  }
}

new Program(new Editor()).run()
