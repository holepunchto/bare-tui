// Tests for the focus ring: construction syncs focus to one child, tab/shift+tab
// cycle (and wrap), arrows are NOT stolen (so arrow-driven children still work),
// and non-nav keys are delegated to the focused child with its Cmd threaded up.
const { test } = require('brittle')
const { focus, textinput, radio, KeyMsg } = require('..')

const k = (name, opts = {}) =>
  new KeyMsg({
    name,
    sequence: opts.sequence ?? name,
    ctrl: !!opts.ctrl,
    meta: !!opts.meta,
    shift: !!opts.shift
  })

test('focus: construction focuses exactly the indexed child', (t) => {
  const a = textinput.create()
  const b = textinput.create()
  const ring = focus.create({ items: [a, b], index: 1 })

  t.absent(a.focused, 'non-indexed child blurred')
  t.ok(b.focused, 'indexed child focused')
  t.is(ring.focused(), b, 'focused() returns the active child')
})

test('focus: tab/shift+tab cycle and wrap', (t) => {
  const a = textinput.create()
  const b = textinput.create()
  const c = textinput.create()
  const ring = focus.create({ items: [a, b, c] })

  ring.update(k('tab'))
  t.is(ring.index, 1, 'tab advances')
  t.ok(b.focused && !a.focused, 'focus moved to b')

  ring.update(k('tab', { shift: true }))
  t.is(ring.index, 0, 'shift+tab goes back')

  ring.update(k('tab', { shift: true }))
  t.is(ring.index, 2, 'shift+tab from first wraps to last')
})

test('focus: arrows are not stolen by the ring', (t) => {
  const r = radio.create({ options: ['a', 'b', 'c'] })
  const ring = focus.create({ items: [r] })

  ring.update(k('down'))
  t.is(r.value(), 'b', 'down reached the focused radio, not the ring')
})

test('focus: delegates other keys to the focused child', (t) => {
  const a = textinput.create()
  const b = textinput.create()
  const ring = focus.create({ items: [a, b] })

  ring.update(k('h', { sequence: 'h' }))
  ring.update(k('i', { sequence: 'i' }))
  t.is(a.value, 'hi', 'typing routed to the focused field')
  t.is(b.value, '', 'the blurred field is untouched')

  ring.update(k('tab'))
  ring.update(k('x', { sequence: 'x' }))
  t.is(b.value, 'x', 'after tab, typing routes to the next field')
})

test('focus: focus(i) and next/prev helpers', (t) => {
  const a = textinput.create()
  const b = textinput.create()
  const ring = focus.create({ items: [a, b] })

  ring.focus(1)
  t.ok(b.focused && !a.focused, 'focus(i) jumps to an index')
  ring.prev()
  t.ok(a.focused && !b.focused, 'prev() moves back')
})
