// Tests for Cmd/Msg ergonomics: sequence ordering (incl. nested batch + nulls),
// batch concurrency, wall-clock `every`, and the key matcher.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, quit, batch, sequence, every, key, KeyMsg } = require('..')

// Run a model headlessly to quit, discarding rendered output.
function run(model) {
  const input = new PassThrough()
  const output = new Writable({ write: (d, e, cb) => cb() })
  return new Program(model, {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24
  }).run()
}

// A Cmd that resolves to a 'mark' Msg after `delay`ms.
const mark =
  (id, delay = 0) =>
  () =>
    new Promise((r) => setTimeout(() => r({ type: 'mark', id }), delay))

test('sequence: ordered, awaits nested batch, skips nulls', async (t) => {
  const order = []

  class Model {
    init() {
      return sequence(
        mark('a', 20), // longer delay than b...
        null, // nulls are skipped, not called
        mark('b', 5), // ...yet b must still come after a
        batch(mark('c', 15), mark('d', 0)), // both before the next step
        mark('e', 0)
      )
    }
    update(msg) {
      if (msg.type === 'mark') {
        order.push(msg.id)
        if (msg.id === 'e') return [this, quit]
      }
      return [this, null]
    }
    view() {
      return ''
    }
  }

  await run(new Model())

  t.alike(order.slice(0, 2), ['a', 'b'], 'steps ran in order despite delays')
  t.ok(order.indexOf('c') > 1 && order.indexOf('d') > 1, 'batch ran after b')
  t.is(order[order.length - 1], 'e', 'final step waited for the batch')
  t.is(order.length, 5, 'every non-null step ran exactly once')
})

test('batch: cmds run concurrently, not serially', async (t) => {
  const start = Date.now()
  let finished = 0
  let elapsed = 0

  const slow = (id) => () => new Promise((r) => setTimeout(() => r({ type: 'mark', id }), 40))

  class Model {
    init() {
      return batch(slow('x'), slow('y'))
    }
    update(msg) {
      if (msg.type === 'mark' && ++finished === 2) {
        elapsed = Date.now() - start
        return [this, quit]
      }
      return [this, null]
    }
    view() {
      return ''
    }
  }

  await run(new Model())

  t.is(finished, 2, 'both batch cmds delivered')
  t.ok(elapsed < 80, `concurrent (~40ms), not serial 80ms — was ${elapsed}ms`)
})

test('every: re-issued to produce repeated, aligned ticks', async (t) => {
  let beats = 0
  const beat = () => every(25, () => ({ type: 'beat' }))

  class Model {
    init() {
      return beat()
    }
    update(msg) {
      if (msg.type === 'beat') {
        if (++beats >= 3) return [this, quit]
        return [this, beat()]
      }
      return [this, null]
    }
    view() {
      return ''
    }
  }

  await run(new Model())
  t.is(beats, 3, 'every repeated when re-issued from update')
})

test('key matcher: is() and key.matches()', (t) => {
  const mk = (k) => new KeyMsg({ ctrl: false, meta: false, shift: false, sequence: '', ...k })

  const ctrlC = mk({ name: 'c', ctrl: true, sequence: '\x03' })
  const up = mk({ name: 'up', sequence: '\x1b[A' })
  const enter = mk({ name: 'return', sequence: '\r' })
  const esc = mk({ name: 'escape', sequence: '\x1b' })

  t.ok(ctrlC.is('ctrl+c'), 'chord form')
  t.ok(up.is('up'), 'bare-name form')
  t.ok(enter.is('enter') && enter.is('return'), 'enter/return interchangeable')
  t.ok(esc.is('esc'), 'esc alias for escape')
  t.absent(up.is('down', 'left'), 'no false positive')

  t.ok(key.matches(ctrlC, 'q', 'ctrl+c'), 'matches any of several chords')
  t.ok(key.matches(up, key.binding({ keys: ['up', 'k'] })), 'expands a binding to its keys')
  t.absent(key.matches({ type: 'resize' }, 'q'), 'non-key Msg never matches')
  t.absent(key.matches(null, 'q'), 'null Msg is safe')
})
