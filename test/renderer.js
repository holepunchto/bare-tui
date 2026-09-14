// Characterisation tests for the diff renderer.
//
// These pin the renderer's contract rather than assert a fix. They exist because
// of a downstream report — "the main body cleared and stopped re-rendering, the
// header was fine, after the terminal had been in the background a while" — and
// they document exactly why that symptom is the *expected* outcome once anything
// disturbs the physical screen behind the renderer's back:
//
//   - `lastLines` is the renderer's only model of the screen (renderer.js:15)
//   - rows are addressed absolutely, so a scrolled screen desyncs every write
//   - unchanged rows are never rewritten, so damage to them is never repaired
//   - only `clear()` re-syncs, and nothing calls it except a resize
//
// A header carrying a clock/spinner changes every frame and so heals itself; a
// static body does not. That asymmetry is the whole bug report.
const { test } = require('brittle')
const Renderer = require('../renderer')
const ansi = require('../ansi')

// The renderer only ever calls out.write(string), so a synchronous sink keeps
// the assertions immediate — a real stream would queue the write past the
// end of the test.
function captureStream() {
  let text = ''
  return {
    write(data) {
      text += data
    },
    text: () => text,
    reset() {
      text = ''
    }
  }
}

const frame = (header, body) => [header, ...body].join('\n')
const BODY = ['body one', 'body two', 'body three']

test('renderer: the first render is a full repaint', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))
  const s = out.text()

  t.ok(s.startsWith(ansi.home), 'starts at home rather than an absolute row')
  for (const line of BODY) t.ok(s.includes(line), 'body line painted: ' + line)
  t.is(s.split('\r\n').length, 4, 'one CRLF between each of the four rows')
  t.ok(s.endsWith(ansi.eraseDisplayEnd), 'wipes anything below the frame')
  t.absent(s.includes(ansi.cursorTo(1, 0)), 'no absolute row moves on a full repaint')
})

test('renderer: the diff touches only the rows whose text changed', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))
  out.reset()
  r.render(frame('header 1', BODY))

  const s = out.text()
  t.ok(s.includes(ansi.cursorTo(0, 0)), 'addresses row 0')
  t.ok(s.includes('header 1'), 'the changed header is repainted')
  for (const line of BODY) {
    t.absent(s.includes(line), 'unchanged body line is NOT repainted: ' + line)
  }
})

test('renderer: an identical frame emits nothing at all', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))
  out.reset()
  r.render(frame('header 0', BODY))

  t.is(out.text(), '', 're-rendering the same view writes zero bytes')
})

test('renderer: clear() forces the next render to repaint everything', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))
  out.reset()
  r.clear()
  r.render(frame('header 0', BODY))

  const s = out.text()
  t.ok(s.startsWith(ansi.home), 'back to a full repaint')
  for (const line of BODY) t.ok(s.includes(line), 'body line repainted: ' + line)
})

test('renderer: a shrinking frame erases the rows below it', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))
  out.reset()
  r.render('header 0') // body gone entirely

  const s = out.text()
  t.is(s, ansi.cursorTo(1, 0) + ansi.eraseDisplayEnd, 'orphaned rows wiped, nothing else')
})

test('renderer: a frame taller than the terminal is emitted verbatim', (t) => {
  // The renderer is constructed with (output, { altScreen }) only — it never
  // learns how many rows the terminal has, so it cannot clamp an over-tall
  // frame. On a real terminal the surplus CRLFs scroll the alt-screen buffer,
  // and from then on every cursorTo(i, 0) addresses the wrong row. Nothing
  // detects this and nothing recovers from it.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  const rows = 24
  const lines = []
  for (let i = 0; i < rows + 1; i++) lines.push('row ' + i)
  r.render(lines.join('\n'))

  const s = out.text()
  t.is(s.split('\r\n').length - 1, rows, 'emits one more CRLF than the screen has rows')
  t.ok(s.includes('row ' + rows), 'the overflowing row is written, not dropped')
})

test('renderer: damage to the screen is never repaired', (t) => {
  // The reported bug, reduced. Something writes to the terminal behind the
  // renderer's back — a native library logging to fd 1, or a scroll caused by
  // an over-tall frame. The renderer has no way to know, so every row whose
  // *text* is unchanged stays damaged for the life of the process, while the
  // header keeps healing itself because its text changes every frame.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  r.render(frame('header 0', BODY))

  // Stand-in for the damage: bytes on the wire that the renderer didn't write.
  out.write('a native library logged this\n')
  out.reset()

  for (let i = 1; i <= 50; i++) r.render(frame('header ' + i, BODY))

  const s = out.text()
  t.ok(s.includes('header 50'), 'the header repaints on every frame')
  for (const line of BODY) {
    t.absent(s.includes(line), 'the body is never re-emitted, 50 frames later: ' + line)
  }
})
