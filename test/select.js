// Tests for the select component: closed/open state machine, the closed-state
// key contract (space opens, enter is not consumed), and menu commit/cancel.
const { test } = require('brittle')
const { select, KeyMsg } = require('..')

const k = (name, opts = {}) =>
  new KeyMsg({
    name,
    sequence: opts.sequence ?? name,
    ctrl: !!opts.ctrl,
    meta: !!opts.meta,
    shift: !!opts.shift
  })

const space = () => k('space', { sequence: ' ' })

test('select: closed-state key contract', (t) => {
  const s = select.create({ options: ['a', 'b', 'c'] })

  s.update(space())
  t.absent(s.open, 'ignores keys while blurred')

  s.focus()
  t.is(s.value(), null, 'nothing chosen initially')
  s.update(k('enter'))
  t.absent(s.open, 'enter does not open (left for the parent)')
  s.update(space())
  t.ok(s.open, 'space opens the menu')
})

test('select: menu navigation, commit and cancel', (t) => {
  const s = select.create({ options: ['a', 'b', 'c'] }).focus()

  s.update(space()) // open; highlight starts at 0
  s.update(k('down'))
  s.update(k('down'))
  s.update(k('enter'))
  t.absent(s.open, 'enter commits and closes')
  t.is(s.value(), 'c', 'committed the highlighted option')

  s.update(space()) // reopen
  s.update(k('up'))
  s.update(k('escape'))
  t.absent(s.open, 'esc closes')
  t.is(s.value(), 'c', 'esc leaves the previous choice intact')
})

test('select: menuView only renders while open', (t) => {
  const s = select.create({ options: ['a', 'b'] }).focus()
  t.is(s.menuView(), '', 'closed → no menu')
  s.update(space())
  t.ok(s.menuView().includes('a'), 'open → menu lists options')
})

test('select: blur closes the menu', (t) => {
  const s = select.create({ options: ['a', 'b'] }).focus()
  s.update(space())
  t.ok(s.open, 'opened')
  s.blur()
  t.absent(s.open, 'blur closes the menu')
})

test('select: setValue by value', (t) => {
  const s = select.create({
    options: [
      { label: 'One', value: 1 },
      { label: 'Two', value: 2 }
    ]
  })
  s.setValue(2)
  t.is(s.value(), 2, 'setValue selects by value')
  t.is(s.selectedOption().label, 'Two', 'selectedOption exposes the label')
})
