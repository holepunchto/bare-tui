// Tests for the progress component: fill ratio, clamping, label, total width.
const { test } = require('brittle')
const { progress } = require('..')
const { stripAnsi, width } = require('../style')

test('progress: fill reflects the percent', (t) => {
  const p = progress.create({
    width: 10,
    showPercentage: false,
    full: '#',
    empty: '-'
  })
  t.is(stripAnsi(p.view(0)), '----------', 'empty at 0')
  t.is(stripAnsi(p.view(0.5)), '#####-----', 'half filled')
  t.is(stripAnsi(p.view(1)), '##########', 'full at 1')
})

test('progress: clamps out-of-range percent', (t) => {
  const p = progress.create({
    width: 6,
    showPercentage: false,
    full: '#',
    empty: '-'
  })
  t.is(stripAnsi(p.view(5)), '######', 'above 1 clamps to full')
  t.is(stripAnsi(p.view(-2)), '------', 'below 0 clamps to empty')
})

test('progress: label is shown and total width stays fixed', (t) => {
  const p = progress.create({ width: 20, full: '#', empty: '-' })
  const out = p.view(0.5)
  t.is(width(out), 20, 'bar + reserved label fill the width')
  t.ok(stripAnsi(out).endsWith('50%'), 'rounded percentage shown')

  // Width is stable as the number grows/shrinks.
  t.is(width(p.view(0)), 20)
  t.is(width(p.view(1)), 20)
})
