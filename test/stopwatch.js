// Tests for the stopwatch: tick accumulation, id/tag guards, stop, format.
const { test } = require('brittle')
const { stopwatch } = require('..')

const tickMsg = (sw, tag = sw.tag) => ({ type: 'stopwatch.tick', id: sw.id, tag })

test('stopwatch: ticks accumulate; id/tag reject strays', (t) => {
  const sw = stopwatch.create({ interval: 1000 })

  t.is(typeof sw.start(), 'function', 'start returns a Cmd')
  t.ok(sw.running, 'running after start')

  const result = sw.update(tickMsg(sw, 0))
  t.is(sw.elapsed, 1000, 'own tick advances elapsed')
  t.is(typeof result[1], 'function', 'and re-issues the next tick')

  sw.update(tickMsg(sw, 0)) // stale tag
  t.is(sw.elapsed, 1000, 'stale tag ignored')
  sw.update({ type: 'stopwatch.tick', id: sw.id + 99, tag: sw.tag }) // foreign id
  t.is(sw.elapsed, 1000, 'foreign id ignored')

  sw.update(tickMsg(sw))
  t.is(sw.elapsed, 2000, 'next tick advances again')

  sw.stop()
  t.absent(sw.running, 'stopped')
  sw.update(tickMsg(sw))
  t.is(sw.elapsed, 2000, 'stopped stopwatch ignores ticks')
})

test('stopwatch: reset zeroes elapsed', (t) => {
  const sw = stopwatch.create()
  sw.elapsed = 5000
  sw.reset()
  t.is(sw.elapsed, 0)
})

test('stopwatch: formats elapsed time', (t) => {
  const sw = stopwatch.create()
  t.is(sw.view(), '00:00', 'zero')
  sw.elapsed = 65000
  t.is(sw.view(), '01:05', 'minutes:seconds')
  sw.elapsed = 3661000
  t.is(sw.view(), '1:01:01', 'hours shown when present')
})
