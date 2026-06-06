// Tests for the help component: short line, full columns, width truncation,
// and that help-less bindings are skipped.
const { test } = require('brittle')
const { help, key, list } = require('..')
const { stripAnsi, width } = require('../style')

const up = key.binding({ keys: ['up', 'k'], help: { key: '↑/k', desc: 'up' } })
const down = key.binding({ keys: ['down', 'j'], help: { key: '↓/j', desc: 'down' } })
const noHelp = key.binding({ keys: ['pageup'] }) // intentionally no help
const quitB = key.binding({ keys: ['q'], help: { key: 'q', desc: 'quit' } })

test('help: short renders one line and skips help-less bindings', (t) => {
  const h = help.create()
  const out = stripAnsi(h.view([up, down, noHelp, quitB]))
  t.is(out, '↑/k up • ↓/j down • q quit', 'joined by separator; pageup omitted')
})

test('help: width truncates the short line', (t) => {
  const h = help.create({ width: 12 })
  const out = h.view([up, down, quitB])
  t.ok(width(out) <= 12, `truncated to width (${width(out)} <= 12)`)
})

test('help: empty keymap renders nothing', (t) => {
  const h = help.create()
  t.is(h.view([noHelp]), '', 'all bindings skipped → empty string')
})

test('help: full renders aligned columns joined horizontally', (t) => {
  const h = help.create({ showAll: true })
  const out = h.view([[up, down], [quitB]])
  const lines = stripAnsi(out).split('\n')

  t.is(lines.length, 2, 'rows = tallest column')
  t.ok(lines[0].includes('↑/k') && lines[0].includes('up'), 'column 1, row 1')
  t.ok(lines[1].includes('↓/j') && lines[1].includes('down'), 'column 1, row 2')
  t.ok(lines[0].includes('q') && lines[0].includes('quit'), 'column 2 joined alongside')
})

test('help: accepts an object keymap (uses its binding values)', (t) => {
  const out = stripAnsi(help.create().view({ up, down }))
  t.is(out, '↑/k up • ↓/j down', 'object values become the binding list')
})

test('help: renders a real component keymap (list.keys)', (t) => {
  const out = stripAnsi(help.create().view(list.keys))
  t.ok(out.includes('filter'), 'documented list bindings appear')
  t.absent(out.includes('pageup'), 'undocumented bindings stay hidden')
})
