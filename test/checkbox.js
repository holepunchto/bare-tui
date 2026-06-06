// Tests for the checkbox component: focus-gated input, space toggles, and the
// contract that enter is never consumed (so a parent can use it for submit).
const { test } = require('brittle')
const { checkbox, KeyMsg } = require('..')
const { stripAnsi } = require('../style')

const k = (name, opts = {}) =>
  new KeyMsg({
    name,
    sequence: opts.sequence ?? name,
    ctrl: !!opts.ctrl,
    meta: !!opts.meta,
    shift: !!opts.shift
  })

test('checkbox: space toggles only while focused', (t) => {
  const c = checkbox.create({ label: 'agree' })

  t.absent(c.checked, 'starts unchecked')
  c.update(k('space', { sequence: ' ' }))
  t.absent(c.checked, 'ignores keys while blurred')

  c.focus()
  c.update(k('space', { sequence: ' ' }))
  t.ok(c.checked, 'space toggles on when focused')
  c.update(k('space', { sequence: ' ' }))
  t.absent(c.checked, 'space toggles back off')
})

test('checkbox: enter is not consumed', (t) => {
  const c = checkbox.create({ label: 'agree' }).focus()
  c.update(k('enter'))
  t.absent(c.checked, 'enter leaves the value untouched (left for the parent)')
})

test('checkbox: imperative helpers', (t) => {
  const c = checkbox.create({ checked: true })
  t.ok(c.checked, 'honours initial checked')
  c.toggle()
  t.absent(c.checked, 'toggle() flips')
  c.setChecked(true)
  t.ok(c.checked, 'setChecked(true)')
})

test('checkbox: view reflects state and focus', (t) => {
  const c = checkbox.create({ label: 'agree' })
  t.is(stripAnsi(c.view()), '  [ ] agree', 'blurred + unchecked')
  c.focus().setChecked(true)
  t.is(stripAnsi(c.view()), '› [x] agree', 'focused pointer + checked glyph')
})
