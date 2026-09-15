const { test } = require('brittle')
const { dialog, style } = require('..')

const plain = (s) => style.stripAnsi(s).split('\n')

test('dialog: boxes the content with the title and hint in the border', (t) => {
  const box = dialog.create({ title: 'Members', hint: 'esc close', width: 30 })
  const rows = plain(box.view('one\ntwo'))
  t.is(rows.length, 4, 'content plus the two border rows')
  t.is(rows[0], '╭─ Members ──────────────────╮')
  t.is(rows[1], '│ one                        │')
  t.is(rows[2], '│ two                        │')
  t.is(rows[3], '╰──────────────── esc close ─╯')
  t.ok(
    rows.every((r) => style.width(r) === 30),
    'every row is the given width'
  )
})

test('dialog: fits the content when no width is given, and truncates to a given one', (t) => {
  const fitted = plain(dialog.create().view('a wider line\nx'))
  t.is(fitted[1], '│ a wider line │')
  t.is(fitted[0], '╭──────────────╮', 'no title, no label')

  const narrow = plain(dialog.create({ width: 10 }).view('far too long a line'))
  t.is(narrow[1], '│ far to │', 'truncated inside the padding')
})

test('dialog: overlay paints the box over the middle of a screen', (t) => {
  const screen = Array(5).fill('.'.repeat(20)).join('\n')
  const box = dialog.create({ width: 10, borderForeground: 'cyan' })
  const rows = plain(box.overlay(screen, 'hi'))
  t.is(rows.length, 5, 'the screen keeps its height')
  t.is(rows[0], '.'.repeat(20), 'rows above are untouched')
  t.is(rows[1], '.....╭────────╮.....', 'centred')
  t.is(rows[2], '.....│ hi     │.....')
  t.is(rows[3], '.....╰────────╯.....')
  t.ok(box.overlay(screen, 'hi').includes('\x1b[36m'), 'the border is coloured')

  const placed = plain(box.overlay(screen, 'hi', 0, 0))
  t.is(placed[0], '╭────────╮..........', 'or at a given corner')
})
