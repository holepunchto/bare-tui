// Tests for the input pre-parser and focus reporting (DEC mode 1004): what the
// parser claims, what it deliberately leaves alone, and the Program's
// enable/deliver/disable cycle. Mouse-specific decoding lives in test/mouse.js.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, quit, suspend } = require('..')
const { InputParser } = require('../input')

function captureStream() {
  const chunks = []
  const stream = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  stream.text = () => Buffer.concat(chunks).toString('utf8')
  return stream
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15))

test('input: focus reports decode to focus msgs', (t) => {
  const p = new InputParser({ focus: true })
  const { keys, events } = p.feed(Buffer.from('a\x1b[Ib\x1b[Oc'))

  t.alike(
    events,
    [
      { type: 'focus', focused: true },
      { type: 'focus', focused: false }
    ],
    'ESC [ I is focus in, ESC [ O is focus out'
  )
  t.is(keys.toString('latin1'), 'abc', 'surrounding key bytes preserved')
})

test('input: focus reports are left alone when focus is off', (t) => {
  const p = new InputParser({ mouse: 'basic' })
  const { keys, events } = p.feed(Buffer.from('\x1b[I'))

  t.is(events.length, 0, 'nothing claimed')
  t.is(keys.toString('latin1'), '\x1b[I', 'forwarded to the decoder unchanged')
})

test('input: SS3 and cursor keys are never mistaken for focus reports', (t) => {
  const p = new InputParser({ focus: true })

  // ESC O P is F1 — the missing '[' is the whole difference from ESC [ O.
  const f1 = p.feed(Buffer.from('\x1bOP'))
  t.is(f1.events.length, 0, 'SS3 F1 not claimed')
  t.is(f1.keys.toString('latin1'), '\x1bOP', 'F1 forwarded intact')

  const up = p.feed(Buffer.from('\x1bOA'))
  t.is(up.keys.toString('latin1'), '\x1bOA', 'application-mode up arrow intact')

  const shiftTab = p.feed(Buffer.from('\x1b[Z'))
  t.is(shiftTab.events.length, 0, 'shift+tab not claimed')
  t.is(shiftTab.keys.toString('latin1'), '\x1b[Z', 'shift+tab forwarded intact')
})

test('input: a focus report split across feeds', (t) => {
  const p = new InputParser({ focus: true })

  const first = p.feed(Buffer.from('\x1b[')) // ambiguous so far
  t.is(first.events.length, 0, 'nothing yet')
  t.is(first.keys.length, 0, 'and no stray bytes handed to the decoder')

  const second = p.feed(Buffer.from('I'))
  t.alike(second.events, [{ type: 'focus', focused: true }], 'completed next feed')
  t.is(second.keys.length, 0)
})

test('input: a lone trailing ESC is forwarded, never held', (t) => {
  const p = new InputParser({ focus: true, mouse: 'basic' })
  const { keys, events } = p.feed(Buffer.from('q\x1b'))

  t.is(events.length, 0)
  // Holding this would break the Escape key: the decoder's escape timer only
  // arms when ESC is the last byte written to it.
  t.is(keys.toString('latin1'), 'q\x1b', 'ESC passed straight through')
  t.is(p._partial, '', 'nothing buffered')
})

test('input: mouse, focus and key bytes in one read', (t) => {
  const p = new InputParser({ mouse: 'basic', focus: true })
  const { keys, events } = p.feed(Buffer.from('x\x1b[<0;3;4M\x1b[O\x1b[Ay'))

  t.is(events.length, 2, 'both reports claimed')
  t.is(events[0].type, 'mouse')
  t.alike(events[1], { type: 'focus', focused: false })
  t.is(keys.toString('latin1'), 'x\x1b[Ay', 'arrow key and plain bytes left over')
})

test('input: a malformed mouse report falls back to key bytes', (t) => {
  const p = new InputParser({ mouse: 'basic' })
  // Typing ESC [ < by hand must not swallow the rest of the session waiting
  // for a terminator that never comes.
  const { keys, events } = p.feed(Buffer.from('\x1b[<hello'))

  t.is(events.length, 0, 'not a report')
  t.is(keys.toString('latin1'), '\x1b[<hello', 'bytes handed on')
  t.is(p._partial, '', 'nothing left buffered')
})

test('input: reset() drops a half-claimed sequence', (t) => {
  const p = new InputParser({ focus: true })

  p.feed(Buffer.from('\x1b['))
  t.is(p._partial, '\x1b[', 'prefix held')

  p.reset()
  t.is(p._partial, '', 'cleared')
  t.is(p.feed(Buffer.from('a')).keys.toString('latin1'), 'a', 'next feed is clean')
})

test('program: focus reporting is enabled, delivered and disabled', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const seen = []

  class M {
    update(msg) {
      if (msg.type === 'focus') {
        seen.push(msg.focused)
        if (seen.length === 2) return [this, quit]
      }
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), { input, output, isTTY: true, focus: true })
  const done = program.run()
  input.write(Buffer.from('\x1b[O')) // blurred
  input.write(Buffer.from('\x1b[I')) // focused again
  await done

  const out = output.text()
  t.ok(out.includes('\x1b[?1004h'), 'enabled focus reporting on setup')
  t.ok(out.includes('\x1b[?1004l'), 'disabled focus reporting on teardown')
  t.alike(seen, [false, true], 'both transitions reached update()')
})

test('program: focus reporting is off unless asked for', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  let key = null

  class M {
    update(msg) {
      if (msg.type === 'key') {
        key = String(msg)
        return [this, quit]
      }
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), { input, output, isTTY: true })
  const done = program.run()
  input.write(Buffer.from('\x1b[I'))
  await done

  const out = output.text()
  // Safe to assert absence: mode switches are control writes, not diffed
  // screen content.
  t.absent(out.includes('\x1b[?1004h'), 'no focus reporting enabled')
  t.is(key, 'undefined', 'and a stray report still decodes as it does today')
})

test('program: keys and mouse still flow with focus enabled', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const got = []

  class M {
    update(msg) {
      if (msg.type === 'mouse' || msg.type === 'focus') got.push(msg.type)
      if (msg.type === 'key' && String(msg) === 'q') {
        got.push('key')
        return [this, quit]
      }
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), {
    input,
    output,
    isTTY: true,
    mouse: true,
    focus: true
  })
  const done = program.run()
  input.write(Buffer.from('\x1b[<0;5;3M\x1b[Iq'))
  await done

  const out = output.text()
  t.ok(out.includes('\x1b[?1000h'), 'mouse tracking enabled alongside focus')
  t.ok(out.includes('\x1b[?1004h'), 'focus reporting enabled alongside mouse')
  t.alike(got, ['mouse', 'focus', 'key'], 'all three arrived from one read')
})

test('program: focus reporting survives a suspend', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  let focused = null

  class M {
    update(msg) {
      if (msg.type === 'focus') focused = msg.focused
      if (msg.type === 'key' && String(msg) === 's') {
        return [this, suspend(() => Promise.resolve({ type: 'resumed' }))]
      }
      if (msg.type === 'key' && String(msg) === 'q') return [this, quit]
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), { input, output, isTTY: true, focus: true })
  const done = program.run()
  input.write(Buffer.from('s')) // hand the terminal to a "child"
  await settle()
  input.write(Buffer.from('\x1b[O')) // a report after the resume
  input.write(Buffer.from('q'))
  await done

  const out = output.text()
  const on = out.split('\x1b[?1004h').length - 1
  const off = out.split('\x1b[?1004l').length - 1
  t.ok(on >= 2, 'focus reporting re-enabled on resume')
  t.ok(off >= 2, 'disabled for the child, then again on teardown')
  t.is(focused, false, 'reports are decoded again after the resume')
})
