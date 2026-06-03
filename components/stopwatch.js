// stopwatch — counts elapsed time upward.
//
// Cmd-driven like the spinner: start() returns a tick Cmd, and each accepted
// 'stopwatch.tick' advances `elapsed` and re-issues the next tick. id + tag
// guard against strays so pausing/resuming can't double-drive it.
//
//   this.sw = stopwatch.create()
//   init()   { return this.sw.start() }
//   update(msg) { const [sw, cmd] = this.sw.update(msg); this.sw = sw; return [this, cmd] }
//   view()   { return this.sw.view() }   // "01:23"
const { tick } = require('../commands')

let nextId = 1

function pad(n) {
  return String(n).padStart(2, '0')
}

// ms → "M:SS" / "MM:SS" / "H:MM:SS"
function format(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

class Stopwatch {
  constructor(opts = {}) {
    this.interval = opts.interval || 1000
    this.elapsed = opts.elapsed || 0
    this.running = false
    this.id = nextId++
    this.tag = 0
  }

  _tick() {
    const id = this.id
    const tag = this.tag
    return tick(this.interval, () => ({ type: 'stopwatch.tick', id, tag }))
  }

  start() {
    if (this.running) return null
    this.running = true
    return this._tick()
  }

  stop() {
    this.running = false
    this.tag++ // invalidate any in-flight tick
    return null
  }

  toggle() {
    return this.running ? this.stop() : this.start()
  }

  reset() {
    this.elapsed = 0
    return null // a running stopwatch keeps ticking
  }

  update(msg) {
    if (
      !msg ||
      msg.type !== 'stopwatch.tick' ||
      msg.id !== this.id ||
      msg.tag !== this.tag ||
      !this.running
    ) {
      return [this, null]
    }
    this.elapsed += this.interval
    this.tag++
    return [this, this._tick()]
  }

  view() {
    return format(this.elapsed)
  }
}

function create(opts) {
  return new Stopwatch(opts)
}

module.exports = { create, Stopwatch, format }
