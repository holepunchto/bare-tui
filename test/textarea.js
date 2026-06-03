// Tests for the textarea: typing, newline split/merge, vertical (visual) cursor
// movement, soft-wrap rendering, and focus gating.
const { test } = require('brittle')
const { textarea, KeyMsg } = require('..')
const { stripAnsi } = require('../style')

const typed = (ch) => new KeyMsg({ name: ch, sequence: ch, ctrl: false, meta: false, shift: false })
const named = (name) =>
  new KeyMsg({
    name,
    sequence: '\x1b[' + name,
    ctrl: false,
    meta: false,
    shift: false
  })

test('textarea: ignores keys while blurred', (t) => {
  const ta = textarea.create()
  ta.update(typed('a'))
  t.is(ta.value, '', 'blurred textarea ignores input')
})

test('textarea: type, split on enter, value', (t) => {
  const ta = textarea.create().focus()
  for (const c of 'ab') ta.update(typed(c))
  t.is(ta.value, 'ab', 'characters inserted')

  ta.update(named('left')) // between a and b
  ta.update(named('enter'))
  t.is(ta.value, 'a\nb', 'enter splits the line at the cursor')
  t.is(ta.row, 1, 'cursor on the new line')
  t.is(ta.col, 0, 'at its start')
})

test('textarea: backspace at line start merges with previous', (t) => {
  const ta = textarea.create().focus()
  ta.setValue('ab\ncd')
  ta.update(named('home')) // col 0 of line "cd"
  ta.update(named('backspace'))
  t.is(ta.value, 'abcd', 'lines merged')
  t.is(ta.row, 0)
  t.is(ta.col, 2, 'cursor at the join')
})

test('textarea: vertical movement keeps column', (t) => {
  const ta = textarea.create().focus()
  ta.setValue('hello\nworld') // cursor at end of "world" (row1,col5)

  ta.update(named('up'))
  t.is(ta.row, 0, 'up moves to the previous line')
  t.is(ta.col, 5, 'column preserved (clamped to line length)')

  ta.update(named('home'))
  t.is(ta.col, 0, 'home goes to line start')
  ta.update(named('down'))
  t.is(ta.row, 1, 'down returns to the next line')
})

test('textarea: soft-wraps long lines to width', (t) => {
  const ta = textarea.create({ width: 4, height: 4 }).focus()
  ta.setValue('abcdefgh') // one logical line, wraps to abcd / efgh

  const lines = stripAnsi(ta.view()).split('\n')
  t.is(lines.length, 4, 'renders height rows')
  t.is(lines[0].slice(0, 4), 'abcd', 'first wrapped segment')
  t.is(lines[1].slice(0, 4), 'efgh', 'second wrapped segment')
})

test('textarea: up/down navigate wrapped segments of one line', (t) => {
  const ta = textarea.create({ width: 4, height: 6 }).focus()
  ta.setValue('abcdefgh') // visual rows: "abcd", "efgh", "" (cursor at very end)

  ta.update(named('up')) // from trailing row up onto "efgh"
  t.is(ta.row, 0, 'still the same logical line')
  ta.update(named('up')) // up onto "abcd"
  t.is(ta.col, 0, 'moved to the first wrapped segment')
})
