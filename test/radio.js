// Tests for the radio component: selection moves with the arrows and clamps,
// value() tracks the choice, and object options expose their value.
const { test } = require('brittle')
const { radio, KeyMsg } = require('..')
const { stripAnsi } = require('../style')

const k = (name, opts = {}) =>
  new KeyMsg({
    name,
    sequence: opts.sequence ?? name,
    ctrl: !!opts.ctrl,
    meta: !!opts.meta,
    shift: !!opts.shift
  })

test('radio: arrows move selection, clamp, and gate on focus', (t) => {
  const r = radio.create({ options: ['a', 'b', 'c'] })

  t.is(r.value(), 'a', 'defaults to the first option')
  r.update(k('down'))
  t.is(r.value(), 'a', 'blurred radio ignores keys')

  r.focus()
  r.update(k('down'))
  t.is(r.value(), 'b', 'down advances when focused')
  r.update(k('down'))
  r.update(k('down'))
  t.is(r.value(), 'c', 'clamps at the last option')
  r.update(k('up'))
  t.is(r.value(), 'b', 'up moves back')
})

test('radio: enter is not consumed', (t) => {
  const r = radio.create({ options: ['a', 'b'] }).focus()
  r.update(k('enter'))
  t.is(r.value(), 'a', 'enter leaves selection untouched (left for the parent)')
})

test('radio: object options and setValue', (t) => {
  const r = radio.create({
    options: [
      { label: 'Small', value: 's' },
      { label: 'Large', value: 'l' }
    ]
  })
  t.is(r.value(), 's', 'value() returns the underlying value')
  r.setValue('l')
  t.is(r.value(), 'l', 'setValue selects by value')
  t.is(r.selectedOption().label, 'Large', 'selectedOption exposes the label')
})

test('radio: view marks the chosen row', (t) => {
  const r = radio.create({ options: ['a', 'b'], selected: 1 }).focus()
  const lines = stripAnsi(r.view()).split('\n')
  t.is(lines[0], '  ( ) a', 'unchosen row')
  t.is(lines[1], '› (•) b', 'chosen + focused row gets the pointer and filled bullet')
})
