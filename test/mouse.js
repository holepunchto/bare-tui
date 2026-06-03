// Tests for mouse support: SGR decoding, the streaming parser (incl. mixed
// key/mouse bytes and split reports), and Program integration.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, quit } = require('..')
const mouse = require('../mouse')

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

test('mouse.decode: buttons, release, wheel, motion, modifiers', (t) => {
  t.alike(
    mouse.decode('0;11;6', 'M'),
    {
      type: 'mouse',
      action: 'press',
      button: 'left',
      x: 10,
      y: 5,
      ctrl: false,
      alt: false,
      shift: false
    },
    'left press, coords are zero-indexed'
  )
  t.is(mouse.decode('0;11;6', 'm').action, 'release', 'final m is a release')
  t.is(mouse.decode('2;1;1', 'M').button, 'right', 'button bits select right')

  const up = mouse.decode('64;1;1', 'M')
  t.is(up.action, 'wheel')
  t.is(up.button, 'wheelup')
  t.is(mouse.decode('65;1;1', 'M').button, 'wheeldown', 'wheel-down bit')

  const drag = mouse.decode('32;3;4', 'M')
  t.is(drag.action, 'motion', 'motion bit (32) → drag')
  t.is(drag.button, 'left', 'held button still reported during motion')

  const mod = mouse.decode('20;1;1', 'M') // 16 (ctrl) + 4 (shift)
  t.ok(mod.ctrl && mod.shift && !mod.alt, 'modifier bits decoded')
})

test('MouseParser: separates mouse reports from key bytes', (t) => {
  const p = new mouse.MouseParser()
  const { keys, events } = p.feed(Buffer.from('a\x1b[<0;3;4Mb'))

  t.is(events.length, 1, 'one mouse event extracted')
  t.is(events[0].action, 'press')
  t.is(keys.toString('latin1'), 'ab', 'surrounding key bytes preserved')
})

test('MouseParser: buffers a report split across feeds', (t) => {
  const p = new mouse.MouseParser()

  const first = p.feed(Buffer.from('\x1b[<0;5;6')) // no terminator yet
  t.is(first.events.length, 0, 'incomplete report yields nothing')
  t.is(first.keys.length, 0, 'and emits no stray key bytes')

  const second = p.feed(Buffer.from('M')) // completes it
  t.is(second.events.length, 1, 'completed on the next feed')
  t.is(second.events[0].x, 4)
  t.is(second.events[0].y, 5)
})

test('MouseParser: leaves arrow-key escapes untouched', (t) => {
  const p = new mouse.MouseParser()
  const { keys, events } = p.feed(Buffer.from('\x1b[A'))
  t.is(events.length, 0, 'no mouse events')
  t.is(keys.toString('latin1'), '\x1b[A', 'arrow sequence forwarded to the decoder')
})

test('program: mouse enabled emits tracking and delivers a MouseMsg', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  let got = null

  class M {
    update(msg) {
      if (msg.type === 'mouse') {
        got = msg
        return [this, quit]
      }
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), { input, output, isTTY: true, mouse: true })
  const done = program.run()
  input.write(Buffer.from('\x1b[<0;5;3M')) // left press at col5,row3
  await done

  const out = output.text()
  t.ok(out.includes('\x1b[?1000h'), 'enabled basic mouse tracking')
  t.ok(out.includes('\x1b[?1006h'), 'enabled SGR extended coordinates')
  t.ok(out.includes('\x1b[?1000l'), 'disabled mouse tracking on teardown')
  t.ok(got && got.action === 'press' && got.button === 'left', 'press delivered')
  t.is(got.x, 4, 'x is zero-indexed')
  t.is(got.y, 2, 'y is zero-indexed')
})

test('program: keys still flow when mouse is enabled', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  let quitKey = false

  class M {
    update(msg) {
      if (msg.type === 'key' && String(msg) === 'q') {
        quitKey = true
        return [this, quit]
      }
      return [this, null]
    }
    view() {
      return 'x'
    }
  }

  const program = new Program(new M(), { input, output, isTTY: true, mouse: true })
  const done = program.run()
  input.write(Buffer.from('q'))
  await done

  t.ok(quitKey, 'key bytes still reach the decoder alongside mouse parsing')
})
