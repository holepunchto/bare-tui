// A mouse demo: paint on the screen.
//
//   bare examples/mouse.js
//
// Click or drag to draw, right-click to erase, wheel to cycle the brush, c to
// clear, q to quit. Uses 'drag' tracking so held-button motion paints.
const { Program, quit, key, style } = require('..')

const BRUSHES = ['█', '▓', '▒', '░', '●', '*', '#', '·']

class Paint {
  constructor() {
    this.width = 80
    this.height = 24
    this.cells = new Map() // 'x,y' -> brush char
    this.brush = 0
    this.last = '—'
  }

  update(msg) {
    switch (msg.type) {
      case 'resize':
        this.width = msg.width
        this.height = msg.height
        return [this, null]

      case 'key':
        if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'c')) this.cells.clear()
        return [this, null]

      case 'mouse':
        this.last = `${msg.action}:${msg.button} @ ${msg.x},${msg.y}`
        if (msg.action === 'wheel') {
          const dir = msg.button === 'wheelup' ? 1 : -1
          this.brush = (this.brush + dir + BRUSHES.length) % BRUSHES.length
        } else if (msg.button === 'right') {
          this.cells.delete(`${msg.x},${msg.y}`)
        } else if (msg.action === 'press' || msg.action === 'motion') {
          // Row 0 is the status bar — paint everywhere below it.
          if (msg.y > 0) this.cells.set(`${msg.x},${msg.y}`, BRUSHES[this.brush])
        }
        return [this, null]

      default:
        return [this, null]
    }
  }

  view() {
    const grid = Array.from({ length: this.height }, () => new Array(this.width).fill(' '))
    for (const [pos, ch] of this.cells) {
      const [x, y] = pos.split(',').map(Number)
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) grid[y][x] = ch
    }

    const lines = grid.map((row) => row.join(''))
    lines[0] = style()
      .width(this.width)
      .foreground('black')
      .background('cyan')
      .render(
        ` paint  brush:${BRUSHES[this.brush]}  ${this.last}  · drag draw · right erase · wheel brush · c clear · q quit`
      )
    return lines.join('\n')
  }
}

new Program(new Paint(), { mouse: 'drag' }).run()
