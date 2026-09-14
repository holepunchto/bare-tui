// Characterisation tests for how (and whether) a Program can be made to repaint.
//
// Companion to test/renderer.js. Those pin the renderer's diff contract; these
// pin what the runtime does with it — which paths reset `lastLines`, which
// don't, and what a model is told when the terminal reports a degenerate size.
//
// Written against a downstream report of a body that cleared and never came
// back. What these lock in:
//
//   - three Msgs resync the screen: `resize`, `repaint`, and a focus-in. An
//     ordinary Msg does not — that is what makes the diff renderer fast.
//   - `repaint` is reachable as a Cmd from update() and as program.repaint()
//     from outside the loop, so an app never has to forge a resize.
//   - rendering is never gated on focus: a blur still paints.
//   - a 0-sized window report is dropped rather than handed to the model.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, quit, repaint } = require('..')
const ansi = require('../ansi')

function captureStream(opts = {}) {
  const chunks = []
  const stream = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  stream.columns = opts.columns
  stream.rows = opts.rows
  stream.text = () => Buffer.concat(chunks).toString('utf8')
  stream.reset = () => {
    chunks.length = 0
  }
  return stream
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15))

const BODY = ['body one', 'body two', 'body three']

// A model shaped like the app that hit this: a header that changes on every
// bump, over a body that never changes.
class HeaderBody {
  constructor() {
    this.n = 0
    this.sizes = []
    this.focus = []
  }
  update(msg) {
    if (msg.type === 'resize') this.sizes.push([msg.width, msg.height])
    if (msg.type === 'focus') this.focus.push(msg.focused)
    if (msg.type === 'bump') this.n++
    if (msg.type === 'key' && String(msg) === 'q') return [this, quit]
    return [this, null]
  }
  view() {
    return ['header ' + this.n, ...BODY].join('\n')
  }
}

test('repaint: a resize forces a full repaint even when nothing changed', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const model = new HeaderBody()
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24,
    fps: 0
  })
  const done = program.run()
  await settle()

  // A no-op state change: the view is byte-identical, so nothing is written.
  output.reset()
  program.send({ type: 'noop' })
  await settle()
  t.is(output.text(), '', 'an unchanged view writes nothing')

  // The same geometry, sent again. Program calls renderer.clear() on any
  // resize, so the whole frame comes back even though it did not change.
  program.send({ type: 'resize', width: 80, height: 24 })
  await settle()

  const s = output.text()
  t.ok(s.includes(ansi.home), 'a resize triggers a full repaint')
  for (const line of BODY) t.ok(s.includes(line), 'body line repainted: ' + line)
  t.alike(model.sizes.at(-1), [80, 24], 'the model saw the resize too')

  input.write(Buffer.from('q'))
  await done
})

test('repaint: no other message resyncs the screen', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const program = new Program(new HeaderBody(), {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24,
    fps: 0
  })
  const done = program.run()
  await settle()
  output.reset()

  // A key, a custom Msg, and a state change that only touches the header.
  input.write(Buffer.from('x'))
  await settle()
  program.send({ type: 'custom' })
  program.send({ type: 'bump' })
  await settle()

  const s = output.text()
  t.ok(s.includes('header 1'), 'the changed header row is repainted')
  t.absent(s.includes(ansi.home), 'nothing triggered a full repaint')
  for (const line of BODY) {
    t.absent(s.includes(line), 'the static body is never resynced: ' + line)
  }

  input.write(Buffer.from('q'))
  await done
})

test('repaint: a zero-sized window report is dropped', async (t) => {
  // Terminals and multiplexers report 0x0 transiently — minimised, occluded,
  // a detached pty. That is "unknown", not a real geometry: handing it to the
  // model collapses any `height - chrome` layout to nothing, with no way back
  // until the next real resize.
  const input = new PassThrough()
  const output = captureStream({ columns: 80, rows: 24 })
  const model = new HeaderBody()
  const program = new Program(model, { input, output, isTTY: true, fps: 0 })
  const done = program.run()
  await settle()

  t.alike(model.sizes[0], [80, 24], 'the real size is seeded at startup')

  output.columns = 0
  output.rows = 0
  output.emit('resize')
  await settle()

  t.is(model.sizes.length, 1, 'the 0x0 report never reached the model')

  output.columns = 100
  output.rows = 30
  output.emit('resize')
  await settle()
  t.alike(model.sizes.at(-1), [100, 30], 'a real size still gets through')

  input.write(Buffer.from('q'))
  await done
})

test('repaint: a blur still paints, and focus-in resyncs the screen', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const model = new HeaderBody()
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24,
    fps: 0,
    focus: true
  })
  const done = program.run()
  await settle()
  output.reset()

  input.write(Buffer.from('\x1b[O')) // focus out
  await settle()
  t.alike(model.focus, [false], 'the blur report was decoded')

  // Blurred, but rendering carries on exactly as before.
  program.send({ type: 'bump' })
  await settle()
  t.ok(output.text().includes('header 1'), 'frames are still painted while blurred')

  output.reset()
  input.write(Buffer.from('\x1b[I')) // focus in
  await settle()

  t.alike(model.focus, [false, true], 'the focus report was decoded')
  const s = output.text()
  t.ok(s.includes(ansi.home), 'focus-in repaints in full')
  for (const line of BODY) t.ok(s.includes(line), 'the static body is resynced: ' + line)

  input.write(Buffer.from('q'))
  await done
})

test('repaint: the repaint Cmd resyncs the screen from update()', async (t) => {
  const input = new PassThrough()
  const output = captureStream()

  class Model extends HeaderBody {
    update(msg) {
      // Stands in for an app that just spawned something which writes to the
      // same terminal, and wants the screen back afterwards.
      if (msg.type === 'clobbered') return [this, repaint]
      return super.update(msg)
    }
  }

  const program = new Program(new Model(), {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24,
    fps: 0
  })
  const done = program.run()
  await settle()
  output.reset()

  program.send({ type: 'clobbered' })
  await settle()

  const s = output.text()
  t.ok(s.includes(ansi.home), 'the repaint Cmd forced a full repaint')
  for (const line of BODY) t.ok(s.includes(line), 'body line resynced: ' + line)

  input.write(Buffer.from('q'))
  await done
})

test('repaint: program.repaint() resyncs from outside the loop', async (t) => {
  const input = new PassThrough()
  const output = captureStream()
  const program = new Program(new HeaderBody(), {
    input,
    output,
    isTTY: true,
    width: 80,
    height: 24,
    fps: 0
  })
  const done = program.run()
  await settle()
  output.reset()

  program.repaint()
  await settle()

  const s = output.text()
  t.ok(s.includes(ansi.home), 'program.repaint() forced a full repaint')
  for (const line of BODY) t.ok(s.includes(line), 'body line resynced: ' + line)

  input.write(Buffer.from('q'))
  await done
})

test('repaint: a resize that happened during a suspend is picked up on resume', async (t) => {
  // While a child process owned the terminal we were not listening for
  // SIGWINCH, and none is coming to tell us afterwards — so the geometry has to
  // be re-read on the way back in, or the repaint is drawn to the wrong shape.
  const input = new PassThrough()
  const output = captureStream({ columns: 80, rows: 24 })

  class Model extends HeaderBody {
    update(msg) {
      if (msg.type === 'edit') {
        return [
          this,
          {
            __suspend: () => {
              output.columns = 100 // the user resized while the editor was up
              output.rows = 30
              return Promise.resolve({ type: 'edited' })
            }
          }
        ]
      }
      return super.update(msg)
    }
  }

  const m = new Model()
  const program = new Program(m, { input, output, isTTY: true, fps: 0 })
  const done = program.run()
  await settle()
  t.alike(m.sizes.at(-1), [80, 24], 'started at the real size')

  program.send({ type: 'edit' })
  await settle()

  t.alike(m.sizes.at(-1), [100, 30], 'the model was told about the resize it missed')
  t.is(program.renderer.height, 30, 'and the renderer fits frames to the new screen')

  input.write(Buffer.from('q'))
  await done
})
