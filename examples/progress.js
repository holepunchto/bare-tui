// A progress demo: a simulated download driven by a tick Cmd.
//
//   bare examples/progress.js
//
// The bar fills via a repeating tick; space restarts, q quits. Shows a gradient
// fill and the live percentage.
const { Program, quit, key, tick, progress } = require('..')

const step = () => tick(120, () => ({ type: 'tick' }))

class Download {
  constructor() {
    this.bar = progress.create({ width: 50, gradient: ['#5A56E0', '#EE6FF8'] })
    this.pct = 0
  }

  init() {
    return step()
  }

  update(msg) {
    switch (msg.type) {
      case 'tick':
        if (this.pct >= 1) return [this, null]
        this.pct = Math.min(1, this.pct + 0.04)
        return [this, step()]
      case 'resize':
        this.bar.setWidth(Math.max(10, msg.width - 10))
        return [this, null]
      case 'key':
        if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'space') && this.pct >= 1) {
          this.pct = 0
          return [this, step()]
        }
        return [this, null]
      default:
        return [this, null]
    }
  }

  view() {
    const status = this.pct >= 1 ? 'done — space to restart' : 'downloading…'
    return ['', '  ' + this.bar.view(this.pct), '', '  ' + status + '  ·  q quit', ''].join('\n')
  }
}

new Program(new Download()).run()
