// Characterisation tests for the diff renderer.
//
// These pin the renderer's contract rather than assert a fix. They exist because
// of a downstream report — "the main body cleared and stopped re-rendering, the
// header was fine, after the terminal had been in the background a while" — and
// they document exactly why that symptom is the *expected* outcome once anything
// disturbs the physical screen behind the renderer's back:
//
//   - `lastLines` is the renderer's only model of the screen
//   - rows are addressed absolutely, so a scrolled screen desyncs every write
//   - unchanged rows are never rewritten, so damage to them is never repaired
//   - only `clear()` re-syncs
//
// A header carrying a clock/spinner changes every frame and so heals itself; a
// static body does not. That asymmetry is the whole bug report.
//
// Hence the two safeguards these also cover: the renderer fits every frame to
// the screen so it can't cause a scroll itself, and clear() is reachable for
// the damage it can't prevent.
const { test } = require('brittle')
const Renderer = require('../renderer')
const ansi = require('../ansi')
const { style } = require('../style')

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

test('renderer: with no known geometry, a frame is emitted verbatim', (t) => {
  // Nothing has called resize(), so the renderer has no idea how big the screen
  // is and cannot fit anything to it. This is the headless/unsized case.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })

  const lines = []
  for (let i = 0; i < 25; i++) lines.push('row ' + i)
  r.render(lines.join('\n'))

  const s = out.text()
  t.is(s.split('\r\n').length - 1, 24, 'every row is written')
  t.ok(s.includes('row 24'), 'nothing is dropped when the size is unknown')
})

test('renderer: a frame taller than the screen is trimmed, not scrolled', (t) => {
  // The surplus rows would scroll the alt-screen buffer, and from then on every
  // cursorTo(i, 0) would address the wrong row — permanently, since nothing can
  // detect it. Losing the overflow is recoverable; losing the addressing isn't.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })
  r.resize(80, 24)

  const lines = []
  for (let i = 0; i < 30; i++) lines.push('row ' + i)
  r.render(lines.join('\n'))

  const s = out.text()
  t.is(s.split('\r\n').length - 1, 23, 'exactly one CRLF fewer than the screen has rows')
  t.ok(s.includes('row 23'), 'the last row that fits is drawn')
  t.absent(s.includes('row 24'), 'the first overflowing row is dropped')
  t.absent(s.includes('row 29'), 'and so is the rest')
})

test('renderer: a line wider than the screen is trimmed by visible cells', (t) => {
  // .length would count the escape bytes the terminal never draws, and would
  // count a wide glyph as one column. Both make a line that looks like it fits
  // wrap onto a second row, which shifts everything below it down by one.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })
  r.resize(10, 24)

  r.render('\x1b[31m' + 'abcdefghijklmnop' + '\x1b[0m')
  t.is(style.width(out.text().split(ansi.eraseLineEnd)[1]), 10, 'styled line cut to 10 cells')

  out.reset()
  r.clear()
  r.render('漢字漢字漢字漢字') // 8 glyphs, 16 cells
  t.is(style.width(out.text().split(ansi.eraseLineEnd)[1]), 10, 'wide glyphs counted as two')
})

test('renderer: resize() re-fits the frame and repaints', (t) => {
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })
  r.resize(80, 3)

  const lines = ['row 0', 'row 1', 'row 2', 'row 3', 'row 4']
  r.render(lines.join('\n'))
  t.absent(out.text().includes('row 3'), 'trimmed to three rows')

  out.reset()
  r.resize(80, 5)
  r.render(lines.join('\n'))

  const s = out.text()
  t.ok(s.startsWith(ansi.home), 'a resize repaints in full')
  t.ok(s.includes('row 4'), 'the rows that now fit are drawn')
})

test('renderer: damage it cannot see is only repaired by clear()', (t) => {
  // The reported bug, reduced, and the reason `repaint` has to exist. Something
  // writes to the terminal behind the renderer's back — a native library
  // logging to fd 1, a multiplexer redrawing a pane. Fitting the frame prevents
  // the renderer from causing a scroll itself, but it cannot know about damage
  // from elsewhere: every row whose *text* is unchanged stays broken, while the
  // header keeps healing itself because its text changes every frame.
  const out = captureStream()
  const r = new Renderer(out, { altScreen: false })
  r.resize(80, 24)

  r.render(frame('header 0', BODY))

  // Stand-in for the damage: bytes on the wire that the renderer didn't write.
  out.write('a native library logged this\n')
  out.reset()

  for (let i = 1; i <= 50; i++) r.render(frame('header ' + i, BODY))

  let s = out.text()
  t.ok(s.includes('header 50'), 'the header repaints on every frame')
  for (const line of BODY) {
    t.absent(s.includes(line), 'the body is never re-emitted, 50 frames later: ' + line)
  }

  // ...until something tells the renderer to stop trusting what it remembers.
  out.reset()
  r.clear()
  r.render(frame('header 50', BODY))

  s = out.text()
  t.ok(s.startsWith(ansi.home), 'clear() repaints in full')
  for (const line of BODY) t.ok(s.includes(line), 'the body comes back: ' + line)
})
