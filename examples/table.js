// A table demo: a selectable, scrolling list of packages.
//
//   bare examples/table.js
//
// ↑/↓ or j/k to move, pgup/pgdn and home/end to jump, enter to "open" the
// selected row, q to quit.
const { Program, quit, key, table, style } = require('..')

const rows = [
  ['corestore', 'js', 'Namespaced collection of hypercores'],
  ['hyperswarm', 'js', 'Find and connect to peers by topic'],
  ['hypercore', 'js', 'Secure append-only log'],
  ['hyperbee', 'js', 'Append-only B-tree over a hypercore'],
  ['hyperdrive', 'js', 'Distributed real-time filesystem'],
  ['hyperdht', 'js', 'Distributed hash table for peers'],
  ['autobase', 'js', 'Multiwriter logs and views'],
  ['bare', 'c/js', 'Small modular JavaScript runtime'],
  ['bare-tty', 'c/js', 'Native TTY streams'],
  ['bare-ansi-escapes', 'js', 'Parse and produce ANSI escapes'],
  ['pear-runtime', 'js', 'Embed Pear into a Bare app']
]

class App {
  constructor() {
    this.table = table.create({
      columns: [
        { title: 'Package', width: 18 },
        { title: 'Lang', width: 5 },
        { title: 'Description', width: 36 }
      ],
      rows,
      height: 6
    })
    this.opened = null
  }

  update(msg) {
    if (msg.type === 'key') {
      if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
      if (key.matches(msg, 'enter')) {
        const row = this.table.selectedRow()
        this.opened = row ? row[0] : null
        return [this, null]
      }
    }
    const [t] = this.table.update(msg)
    this.table = t
    return [this, null]
  }

  view() {
    const box = style()
      .border(style.borders.rounded)
      .borderForeground('blue')
      .render(this.table.view())

    const footer = this.opened ? `  ▸ opened: ${this.opened}` : '  ↑/↓ move · enter open · q quit'

    return style.joinVertical(
      style.position.left,
      style().bold(true).foreground('magenta').render(' packages'),
      box,
      footer
    )
  }
}

new Program(new App()).run()
