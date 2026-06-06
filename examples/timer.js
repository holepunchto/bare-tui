// A timer + stopwatch demo.
//
//   bare examples/timer.js
//
// space starts/pauses both, r resets, q quits. The countdown emits a
// timer.timeout Msg when it hits zero.
const { Program, quit, key, timer, stopwatch } = require('..')

class App {
  constructor() {
    this.sw = stopwatch.create({ interval: 1000 })
    this.timer = timer.create({ timeout: 10000, interval: 1000 })
    this.done = false
  }

  update(msg) {
    switch (msg.type) {
      case 'stopwatch.tick': {
        const [sw, cmd] = this.sw.update(msg)
        this.sw = sw
        return [this, cmd]
      }
      case 'timer.tick': {
        const [t, cmd] = this.timer.update(msg)
        this.timer = t
        return [this, cmd]
      }
      case 'timer.timeout':
        this.done = true
        return [this, null]
      case 'key':
        if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'space')) {
          // toggle() returns a start Cmd or null for each; run both as a batch.
          return [this, [this.sw.toggle(), this.timer.toggle()]]
        }
        if (key.matches(msg, 'r')) {
          this.sw.reset()
          this.timer.reset()
          this.done = false
          return [this, null]
        }
        return [this, null]
      default:
        return [this, null]
    }
  }

  view() {
    const verb = this.sw.running ? 'pause' : 'start'
    return [
      '',
      `  stopwatch   ${this.sw.view()}`,
      `  timer       ${this.timer.view()}${this.done ? '   ⏰ time!' : ''}`,
      '',
      `  space ${verb} · r reset · q quit`,
      ''
    ].join('\n')
  }
}

new Program(new App()).run()
