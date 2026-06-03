// paginator — page state plus an indicator, for paging through a long list.
//
// Holds the current page and page size, handles the paging keys, and offers
// sliceBounds() so a parent can carve the visible page out of its items:
//
//   const p = paginator.create({ perPage: 10, total: items.length, type: 'dots' })
//   const [start, end] = p.sliceBounds()
//   render(items.slice(start, end))
//   p.view()   // "●○○○○"  (dots)  or  "1/5"  (arabic)
const key = require('../key')
const { style } = require('../style')

const dim = (s) => style().faint(true).render(s)

const keys = {
  prev: key.binding({
    keys: ['left', 'h', 'pageup'],
    help: { key: '←/h', desc: 'prev page' }
  }),
  next: key.binding({
    keys: ['right', 'l', 'pagedown'],
    help: { key: '→/l', desc: 'next page' }
  })
}

class Paginator {
  constructor(opts = {}) {
    this.perPage = opts.perPage || 10
    this.total = opts.total || 0 // number of items
    this.page = opts.page || 0 // zero-indexed
    this.type = opts.type || 'arabic' // 'arabic' | 'dots'
    this.activeDot = opts.activeDot || '●'
    this.inactiveDot = opts.inactiveDot || '○'
    this._clamp()
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.perPage))
  }

  onFirstPage() {
    return this.page <= 0
  }

  onLastPage() {
    return this.page >= this.totalPages - 1
  }

  setTotal(n) {
    this.total = n
    this._clamp()
    return this
  }

  setPage(n) {
    this.page = n
    this._clamp()
    return this
  }

  nextPage() {
    if (!this.onLastPage()) this.page++
    return this
  }

  prevPage() {
    if (!this.onFirstPage()) this.page--
    return this
  }

  _clamp() {
    this.page = Math.max(0, Math.min(this.page, this.totalPages - 1))
  }

  // Items on the current page (last page may be short).
  itemsOnPage(length = this.total) {
    const [start, end] = this.sliceBounds(length)
    return Math.max(0, end - start)
  }

  // [start, end) into a collection of `length` items for the current page.
  sliceBounds(length = this.total) {
    const start = Math.min(this.page * this.perPage, length)
    const end = Math.min(start + this.perPage, length)
    return [start, end]
  }

  update(msg) {
    if (!msg || msg.type !== 'key') return [this, null]
    if (key.matches(msg, keys.next)) this.nextPage()
    else if (key.matches(msg, keys.prev)) this.prevPage()
    return [this, null]
  }

  view() {
    if (this.type === 'dots') {
      let out = ''
      for (let i = 0; i < this.totalPages; i++) {
        out += i === this.page ? this.activeDot : dim(this.inactiveDot)
      }
      return out
    }
    return `${this.page + 1}/${this.totalPages}`
  }
}

function create(opts) {
  return new Paginator(opts)
}

module.exports = { create, Paginator, keys }
