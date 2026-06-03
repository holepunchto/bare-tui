// Tests for the paginator: page math, slice bounds, paging keys, and views.
const { test } = require('brittle')
const { paginator, KeyMsg } = require('..')
const { stripAnsi } = require('../style')

const named = (name) =>
  new KeyMsg({
    name,
    sequence: '\x1b[' + name,
    ctrl: false,
    meta: false,
    shift: false
  })

test('paginator: page math and slice bounds', (t) => {
  const p = paginator.create({ perPage: 10, total: 25 })

  t.is(p.totalPages, 3, 'ceil(25 / 10)')
  t.alike(p.sliceBounds(), [0, 10], 'first page bounds')
  t.ok(p.onFirstPage(), 'starts on first page')

  p.nextPage()
  t.alike(p.sliceBounds(), [10, 20], 'second page bounds')

  p.nextPage()
  t.alike(p.sliceBounds(), [20, 25], 'last page clamps to total')
  t.is(p.itemsOnPage(), 5, 'short last page')
  t.ok(p.onLastPage(), 'reached last page')
})

test('paginator: paging keys move and clamp', (t) => {
  const p = paginator.create({ perPage: 10, total: 25 })

  p.update(named('right'))
  t.is(p.page, 1, 'right advances')
  p.update(named('right'))
  p.update(named('right'))
  t.is(p.page, 2, 'clamps at the last page')
  p.update(named('left'))
  t.is(p.page, 1, 'left goes back')
})

test('paginator: arabic and dots views', (t) => {
  const arabic = paginator.create({ perPage: 10, total: 25, type: 'arabic' })
  t.is(arabic.view(), '1/3', 'arabic shows page/total')

  const dots = paginator.create({ perPage: 10, total: 25, type: 'dots' })
  t.is(stripAnsi(dots.view()), '●○○', 'first dot active')
  dots.nextPage()
  t.is(stripAnsi(dots.view()), '○●○', 'active dot follows the page')
})
