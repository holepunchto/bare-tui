// Tests for the timer: countdown, timeout signal, start guard, reset.
const { test } = require('brittle')
const { timer } = require('..')

const tickMsg = (tm, tag = tm.tag) => ({ type: 'timer.tick', id: tm.id, tag })

test('timer: counts down and signals timeout at zero', (t) => {
  const tm = timer.create({ timeout: 3000, interval: 1000 })

  t.is(typeof tm.start(), 'function', 'start returns a Cmd')

  tm.update(tickMsg(tm))
  t.is(tm.timeout, 2000)
  tm.update(tickMsg(tm))
  t.is(tm.timeout, 1000)

  const [, cmd] = tm.update(tickMsg(tm))
  t.is(tm.timeout, 0, 'reaches zero')
  t.absent(tm.running, 'stops at zero')
  t.ok(tm.timedOut, 'timedOut is true')
  t.is(typeof cmd, 'function', 'returns a one-shot timeout Cmd')
  t.alike(cmd(), { type: 'timer.timeout', id: tm.id }, 'Cmd yields the timeout Msg')
})

test('timer: will not start at zero, reset restores duration', (t) => {
  const tm = timer.create({ timeout: 5000 })

  tm.timeout = 0
  t.is(tm.start(), null, 'cannot start an expired timer')

  tm.reset()
  t.is(tm.timeout, 5000, 'reset restores the initial duration')
  t.is(typeof tm.start(), 'function', 'can start again after reset')
})

test('timer: stale ticks are ignored', (t) => {
  const tm = timer.create({ timeout: 3000, interval: 1000 })
  tm.start()
  tm.update(tickMsg(tm, 0))
  t.is(tm.timeout, 2000)
  tm.update(tickMsg(tm, 0)) // stale
  t.is(tm.timeout, 2000, 'stale tag ignored')
})
