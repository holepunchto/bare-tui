// progress — a percentage bar.
//
// Static like the help component: it holds the look (width, fill chars, color)
// and view(percent) renders a bar at the given fraction (0..1). Drive the
// percent from your model (a tick Cmd, a download callback, the OTA updater).
//
//   const bar = progress.create({ width: 40, gradient: ['#5A56E0', '#EE6FF8'] })
//   bar.view(0.42)   // -> "████████░░░░…  42%"
const { style } = require('../style')

const dim = (s) => style().faint(true).render(s)

class Progress {
  constructor(opts = {}) {
    this.width = opts.width || 40
    this.full = opts.full || '█'
    this.empty = opts.empty || '░'
    this.showPercentage = opts.showPercentage !== false
    this.color = opts.color || null // solid fill color (any style color spec)
    this.gradient = opts.gradient || null // [fromHex, toHex] across the fill
  }

  setWidth(n) {
    this.width = n
    return this
  }

  view(percent) {
    percent = Math.max(0, Math.min(1, percent || 0))

    // A fixed 5 cells (" 100%") are reserved for the label so the bar width is
    // stable as the number changes.
    const reserve = this.showPercentage ? 5 : 0
    const w = Math.max(1, this.width - reserve)
    const filled = Math.round(w * percent)
    const gap = w - filled

    let bar
    if (this.gradient) {
      let head = ''
      for (let i = 0; i < filled; i++) {
        const t = filled <= 1 ? 0 : i / (filled - 1)
        const color = lerpHex(this.gradient[0], this.gradient[1], t)
        head += style().foreground(color).render(this.full)
      }
      bar = head + dim(this.empty.repeat(gap))
    } else {
      const head = this.color
        ? style().foreground(this.color).render(this.full.repeat(filled))
        : this.full.repeat(filled)
      bar = head + dim(this.empty.repeat(gap))
    }

    if (!this.showPercentage) return bar
    const pct = Math.round(percent * 100)
    return bar + ' ' + (pct + '%').padStart(4)
  }
}

function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpHex(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const mix = A.map((v, i) => Math.round(v + (B[i] - v) * t))
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function create(opts) {
  return new Progress(opts)
}

module.exports = { create, Progress }
