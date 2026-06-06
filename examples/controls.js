// A form-controls demo: textinput + radio + select + checkbox, all driven by a
// single focus ring.
//
//   bare examples/controls.js
//
// It shows the pieces a form is built from — tab/shift+tab move between fields
// (the ring), each control handles its own keys when focused, and enter
// "submits". The one subtlety worth copying: while the select's dropdown is
// open, enter belongs to the menu, not to submit — so the parent only treats
// enter as submit when no menu is open.
const { Program, quit, key, focus, textinput, radio, select, checkbox } = require('..')

class Settings {
  constructor() {
    this.ring = focus.create({
      items: [
        textinput.create({ placeholder: 'your name', prompt: '' }),
        radio.create({ options: ['small', 'medium', 'large'], selected: 1 }),
        select.create({ options: ['red', 'green', 'blue'], placeholder: 'pick a color' }),
        checkbox.create({ label: 'email me updates' })
      ]
    })
    this.submitted = false
  }

  get fields() {
    const [name, size, color, notify] = this.ring.items
    return { name, size, color, notify }
  }

  update(msg) {
    if (msg.type !== 'key') return [this, null]

    // Global keys first, so a focused child can't swallow the escape hatch.
    if (key.matches(msg, 'ctrl+c')) return [this, quit]

    // enter submits — unless the select's menu is open, where enter commits it.
    const cur = this.ring.focused()
    const menuOpen = cur && typeof cur.open === 'boolean' && cur.open
    if (key.matches(msg, 'enter') && !menuOpen) {
      this.submitted = true
      return [this, null]
    }

    // Any edit clears the last "submitted" banner.
    this.submitted = false
    const [ring, cmd] = this.ring.update(msg)
    this.ring = ring
    return [this, cmd]
  }

  view() {
    const { name, size, color, notify } = this.fields
    const lines = ['', '  bare-tui controls demo', '']

    lines.push('  name    ' + name.view())
    lines.push('')
    lines.push(...indent(size.view(), 2))
    lines.push('')
    lines.push('  color   ' + color.view())
    // Overlay the dropdown under the select line while it's open.
    const menu = color.menuView()
    if (menu) lines.push(...indent(menu, 10))
    lines.push('')
    lines.push(...indent(notify.view(), 2))
    lines.push('')

    lines.push(
      this.submitted
        ? `  ✓ ${name.value || '(no name)'} · ${size.value()} · ${color.value() || '(no color)'} · notify=${notify.checked}`
        : '  tab/shift+tab move · space toggle/open · enter submit · ctrl+c quit'
    )
    lines.push('')
    return lines.join('\n')
  }
}

// Prefix every line of a block with `n` spaces.
function indent(block, n) {
  const pad = ' '.repeat(n)
  return block.split('\n').map((l) => pad + l)
}

module.exports = { Settings }
if (require.main === module) new Program(new Settings()).run()
