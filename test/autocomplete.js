// Tests for the autocomplete component: triggering, prefix filtering, menu
// navigation, accept/dismiss, the enter contract, and the dropdown view.
const { test } = require('brittle')
const { autocomplete, KeyMsg } = require('..')
const { stripAnsi } = require('../style')

const key = (o) =>
  new KeyMsg({
    name: o.name,
    sequence: o.sequence ?? o.name,
    ctrl: !!o.ctrl,
    meta: !!o.meta,
    shift: !!o.shift
  })

const SPECIAL = {
  tab: key({ name: 'tab', sequence: '\t' }),
  down: key({ name: 'down' }),
  up: key({ name: 'up' }),
  esc: key({ name: 'escape', sequence: '\x1b' }),
  enter: key({ name: 'return', sequence: '\r' }),
  back: key({ name: 'backspace', sequence: '\x7f' })
}

function type(ac, str) {
  for (const ch of str) ac.update(key({ name: ch, sequence: ch }))
  return ac
}
function press(ac, name) {
  ac.update(SPECIAL[name])
  return ac
}

const CMDS = [
  { name: 'help', desc: 'show help' },
  { name: 'clear', desc: 'clear screen' },
  { name: 'cost', desc: 'token usage' },
  { name: 'compact', desc: 'summarize' },
  { name: 'quit', desc: 'exit' }
]

const make = () => autocomplete.create({ prompt: '> ', suggestions: CMDS }).focus()

test('autocomplete: trigger opens the menu, prefix filters it', (t) => {
  const ac = make()
  t.is(ac.open, false, 'closed while empty')

  type(ac, '/')
  t.ok(ac.open, 'opens on the trigger char')
  t.is(ac.matches().length, CMDS.length, 'all suggestions match the bare trigger')

  type(ac, 'c')
  t.alike(
    ac.matches().map((s) => s.name),
    ['clear', 'cost', 'compact'],
    'prefix narrows to names starting with c'
  )
})

test('autocomplete: prose without the trigger never opens', (t) => {
  const ac = make()
  type(ac, 'hello world')
  t.is(ac.value, 'hello world', 'edits the field')
  t.is(ac.open, false, 'no menu for ordinary text')
  t.is(ac.matches().length, 0, 'no matches')
})

test('autocomplete: arrows navigate (wrapping) and tab accepts', (t) => {
  const ac = make()
  type(ac, '/c') // matches: clear, cost, compact — highlight 0

  t.is(ac.selectedSuggestion().name, 'clear', 'first match highlighted')
  press(ac, 'down')
  t.is(ac.selectedSuggestion().name, 'cost', 'down moves the highlight')
  press(ac, 'up')
  press(ac, 'up')
  t.is(ac.selectedSuggestion().name, 'compact', 'up wraps past the top')

  press(ac, 'tab')
  t.is(ac.value, '/compact ', 'tab completes to the highlight with a trailing space')
  t.is(ac.open, false, 'menu closes after accept')
})

test('autocomplete: esc dismisses until the text changes', (t) => {
  const ac = make()
  type(ac, '/c')
  t.ok(ac.open, 'open')

  press(ac, 'esc')
  t.is(ac.open, false, 'esc dismisses the menu')
  t.is(ac.value, '/c', 'esc leaves the text untouched')

  type(ac, 'o') // editing re-opens it
  t.ok(ac.open, 'typing re-opens the menu')
  t.alike(
    ac.matches().map((s) => s.name),
    ['cost', 'compact'],
    're-filtered'
  )
})

test('autocomplete: enter is left for the parent (never consumed)', (t) => {
  const ac = make()
  type(ac, '/help')
  const before = ac.value
  const [, cmd] = ac.update(SPECIAL.enter)
  t.is(ac.value, before, 'enter does not edit the field')
  t.is(cmd, null, 'enter produces no command')
  t.ok(ac.open, 'menu stays open — the parent decides what enter means')
})

test('autocomplete: menuView lists matches, empty when closed', (t) => {
  const ac = make()
  t.is(ac.menuView(), '', 'no menu when closed')

  type(ac, '/c')
  const mv = stripAnsi(ac.menuView())
  t.ok(mv.includes('/clear'), 'shows command names with the trigger')
  t.ok(mv.includes('token usage'), 'shows descriptions')
  t.absent(mv.includes('/help'), 'omits non-matching commands')
})

test('autocomplete: maxVisible scrolls and notes the remainder', (t) => {
  const ac = autocomplete.create({ suggestions: CMDS, maxVisible: 2 }).focus()
  type(ac, '/c') // 3 matches, only 2 visible
  const mv = stripAnsi(ac.menuView())
  t.ok(mv.includes('1 more') || mv.includes('…1 more'), 'notes the hidden match')
})

test('autocomplete: reset and bare-string suggestions', (t) => {
  const ac = autocomplete.create({ suggestions: ['alpha', 'beta'] }).focus()
  type(ac, '/a')
  t.alike(
    ac.matches().map((s) => s.name),
    ['alpha'],
    'bare strings normalize to names'
  )

  ac.reset()
  t.is(ac.value, '', 'reset clears the value')
  t.is(ac.open, false, 'reset closes the menu')

  ac.setSuggestions([{ name: 'gamma', desc: '' }])
  type(ac, '/g')
  t.alike(
    ac.matches().map((s) => s.name),
    ['gamma'],
    'setSuggestions replaces the set'
  )
})

test('autocomplete: focus gates input', (t) => {
  const ac = make().blur()
  type(ac, '/help')
  t.is(ac.value, '', 'a blurred field ignores keys')
  t.is(ac.open, false, 'and shows no menu')
})
