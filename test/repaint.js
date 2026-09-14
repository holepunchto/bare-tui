// Characterisation tests for how (and whether) a Program can be made to repaint.
//
// Companion to test/renderer.js. Those pin the renderer's diff contract; these
// pin what the runtime does with it — which paths reset `lastLines`, which
// don't, and what a model is told when the terminal reports a degenerate size.
//
// Written against a downstream report of a body that cleared and never came
// back. The findings these lock in:
//
//   - a `resize` Msg is the ONLY thing an app can use to force a full repaint,
//     even when the geometry hasn't actually changed. There is no repaint API,
//     so apps forge a resize instead.
//   - no other Msg — key, focus, custom — resyncs the screen.
//   - focus reporting does not gate rendering in either direction: a blur
//     causes an extra render, and a focus-in causes no repaint.
//   - a 0-sized window report reaches the model verbatim; `??` does not guard
//     against 0.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, quit } = require('..')
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

test('repaint: a zero-sized window report reaches the model verbatim', async (t) => {
  // Terminals and multiplexers report 0x0 transiently — minimised, occluded,
  // a detached pty. program.js forwards output.columns/rows straight through,
  // and the `?? opts.width ?? 80` fallback at setup does not catch 0 either,
  // because `0 ?? x` is 0. A layout formula like `height - chrome` then goes
  // negative and the body collapses.
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

  t.alike(model.sizes.at(-1), [0, 0], 'a 0x0 report is forwarded unguarded')

  input.write(Buffer.from('q'))
  await done
})

test('repaint: focus reporting does not gate rendering', async (t) => {
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
  t.is(output.text(), '', 'focus-in does NOT resync the screen — the gap to close')

  input.write(Buffer.from('q'))
  await done
})
