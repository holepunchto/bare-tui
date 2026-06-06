// A paginator demo: page through a long list one screen at a time.
//
//   bare examples/paginator.js
//
// ←/→ (or h/l) to change pages; the paginator slices the items and renders the
// dots indicator. q quits.
const { Program, quit, key, paginator } = require('..')

const items = Array.from({ length: 43 }, (_, i) => `item ${String(i + 1).padStart(2)}`)

class Pages {
  constructor() {
    this.pager = paginator.create({
      perPage: 8,
      total: items.length,
      type: 'dots'
    })
  }

  update(msg) {
    if (msg.type === 'key' && key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
    const [pager] = this.pager.update(msg)
    this.pager = pager
    return [this, null]
  }

  view() {
    const [start, end] = this.pager.sliceBounds()
    const rows = items
      .slice(start, end)
      .map((item) => '  ' + item)
      .join('\n')

    return [
      '',
      `  page ${this.pager.page + 1} of ${this.pager.totalPages}`,
      '',
      rows,
      '',
      '  ' + this.pager.view(),
      '',
      '  ←/→ page · q quit',
      ''
    ].join('\n')
  }
}

new Program(new Pages()).run()
