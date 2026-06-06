// timer — counts a duration down to zero.
//
// Cmd-driven like the stopwatch. Each accepted 'timer.tick' decrements
// `timeout`; when it hits zero the timer stops and emits a one-shot
// { type: 'timer.timeout', id } Msg so the app can react.
//
//   this.timer = timer.create({ timeout: 10000 })   // 10s
//   init()   { return this.timer.start() }
//   update(msg) {
//     if (msg.type === 'timer.timeout') { ...done... }
//     const [t, cmd] = this.timer.update(msg); this.timer = t; return [this, cmd]
//   }
//   view()   { return this.timer.view() }   // "00:09"
const { tick } = require('../commands')
const { format } = require('./stopwatch')

let nextId = 1

class Timer {
  constructor(opts = {}) {
    this.interval = opts.interval || 1000
    this.timeout = opts.timeout ?? 0 // ms remaining
    this.initial = this.timeout
    this.running = false
    this.id = nextId++
    this.tag = 0
  }

  get timedOut() {
    return this.timeout <= 0
  }

  _tick() {
    const id = this.id
    const tag = this.tag
    return tick(this.interval, () => ({ type: 'timer.tick', id, tag }))
  }

  start() {
    if (this.running || this.timeout <= 0) return null
    this.running = true
    return this._tick()
  }

  stop() {
    this.running = false
    this.tag++
    return null
  }

  toggle() {
    return this.running ? this.stop() : this.start()
  }

  reset() {
    this.timeout = this.initial
    return null // a running timer keeps counting, now from the initial duration
  }

  update(msg) {
    if (
      !msg ||
      msg.type !== 'timer.tick' ||
      msg.id !== this.id ||
      msg.tag !== this.tag ||
      !this.running
    ) {
      return [this, null]
    }

    this.timeout = Math.max(0, this.timeout - this.interval)
    this.tag++

    if (this.timeout === 0) {
      this.running = false
      const id = this.id
      return [this, () => ({ type: 'timer.timeout', id })]
    }
    return [this, this._tick()]
  }

  view() {
    return format(this.timeout)
  }
}

function create(opts) {
  return new Timer(opts)
}

module.exports = { create, Timer }
