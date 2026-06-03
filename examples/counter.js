// A small tea app. Run it in a real terminal:
//
//   bare examples/counter.js
//
// It shows the whole lifecycle: init() kicks off a repeating timer Cmd, key
// presses and resizes flow through update() as Msgs, view() renders the frame,
// and `quit` restores the terminal cleanly.
const { Program, quit, every, key } = require('..')

// A Cmd that fires a 'tick' Msg once per second, aligned to the clock. We
// re-issue it from update() to keep it going.
const everySecond = every(1000, () => ({ type: 'tick' }))

class Counter {
  constructor() {
    this.count = 0
    this.ticks = 0
    this.width = 0
    this.height = 0
    this.lastKey = ''
  }

  init() {
    return everySecond
  }

  update(msg) {
    switch (msg.type) {
      case 'resize':
        this.width = msg.width
        this.height = msg.height
        return [this, null]

      case 'tick':
        this.ticks++
        return [this, everySecond]

      case 'key': {
        this.lastKey = String(msg)
        if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'up', 'k')) this.count++
        if (key.matches(msg, 'down', 'j')) this.count--
        return [this, null]
      }

      default:
        return [this, null]
    }
  }

  view() {
    return [
      '',
      '  Bare Tea — counter demo',
      '  ─────────────────────────',
      '',
      `  count : ${this.count}`,
      `  ticks : ${this.ticks}s`,
      `  size  : ${this.width}×${this.height}`,
      `  key   : ${this.lastKey || '—'}`,
      '',
      '  ↑/k up · ↓/j down · q quit',
      ''
    ].join('\n')
  }
}

new Program(new Counter()).run()
