// Tests for the table: selection + clamping, scroll window, cell truncation,
// rectangular rendering, and header/rule.
const { test } = require('brittle')
const { table, KeyMsg } = require('..')
const { stripAnsi, width } = require('../style')

const named = (name) =>
  new KeyMsg({
    name,
    sequence: '\x1b[' + name,
    ctrl: false,
    meta: false,
    shift: false
  })

const columns = [
  { title: 'Name', width: 6 },
  { title: 'Kind', width: 4 }
]
const rows = [
  ['alpha', 'a'],
  ['bravo', 'b'],
  ['charlie', 'c'], // longer than column width → truncated
  ['delta', 'd'],
  ['echo', 'e']
]

test('table: selection moves and clamps', (t) => {
  const tbl = table.create({ columns, rows, height: 5 })
  t.alike(tbl.selectedRow(), ['alpha', 'a'], 'starts on first row')

  tbl.update(named('down'))
  t.alike(tbl.selectedRow(), ['bravo', 'b'], 'down advances')

  tbl.update(named('end'))
  t.alike(tbl.selectedRow(), ['echo', 'e'], 'end jumps to last')
  tbl.update(named('down'))
  t.alike(tbl.selectedRow(), ['echo', 'e'], 'clamps at the bottom')

  tbl.update(named('home'))
  t.alike(tbl.selectedRow(), ['alpha', 'a'], 'home jumps to first')
})

test('table: scroll window follows the cursor', (t) => {
  const tbl = table.create({ columns, rows, height: 2 })
  t.is(tbl.offset, 0, 'starts at top')
  tbl.update(named('down'))
  t.is(tbl.offset, 0, 'no scroll while visible')
  tbl.update(named('down')) // select row 2, must scroll
  t.is(tbl.offset, 1, 'window advanced')
  t.alike(tbl.selectedRow(), ['charlie', 'c'])
})

test('table: renders header, rule, and a fixed-width block', (t) => {
  const tbl = table.create({ columns, rows, height: 3 })
  const lines = stripAnsi(tbl.view()).split('\n')

  t.is(lines.length, 5, 'header + rule + height body rows')
  t.ok(lines[0].startsWith('Name'), 'header titles')
  t.ok(/^─+$/.test(lines[1]), 'rule under the header')

  const totalWidth = 6 + 4 + 1 // columns + one gutter
  t.ok(
    lines.every((l) => width(l) === totalWidth),
    'every line is the same width (rectangular)'
  )
})

test('table: truncates cells wider than their column', (t) => {
  const tbl = table.create({ columns, rows, height: 5 })
  tbl.gotoBottom()
  tbl.update(named('up')) // select 'delta'
  // 'charlie' (row index 2) is 7 chars but the column is 6 wide
  const body = stripAnsi(tbl.view()).split('\n')
  const charlieLine = body.find((l) => l.includes('charl'))
  t.ok(charlieLine && !charlieLine.includes('charlie'), 'cell truncated to column width')
})
