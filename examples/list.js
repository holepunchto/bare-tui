// A picker built on the list component.
//
//   bare examples/list.js
//
// ↑/↓ or j/k to move, / to filter (type to narrow, esc to clear), enter to
// choose, ? toggles full help, q to quit. While filtering, keys edit the query
// — so q/? act only when you're not filtering; ctrl+c always quits.
//
// The footer is rendered by the help component straight from the list's own
// keymap (list.keys), so the hints stay in sync with the bindings.
const { Program, quit, key, list, help } = require('..')

const fruits = [
  'apple',
  'apricot',
  'banana',
  'blueberry',
  'cherry',
  'date',
  'elderberry',
  'fig',
  'grape',
  'kiwi',
  'lemon',
  'mango',
  'nectarine',
  'orange',
  'peach',
  'pear',
  'plum',
  'raspberry',
  'strawberry',
  'watermelon'
]

class Picker {
  constructor() {
    this.list = list.create({
      items: fruits,
      height: 8,
      width: 30,
      title: ' pick a fruit'
    })
    this.chosen = null
    this.help = help.create()
  }

  update(msg) {
    if (msg.type === 'key' && !this.list.filtering) {
      if (key.matches(msg, 'ctrl+c', 'q')) return [this, quit]
      if (key.matches(msg, '?')) {
        this.help.showAll = !this.help.showAll
        return [this, null]
      }
      if (key.matches(msg, 'enter')) {
        this.chosen = this.list.selectedItem()
        return [this, null]
      }
    } else if (msg.type === 'key' && key.matches(msg, 'ctrl+c')) {
      return [this, quit]
    }

    const [l, cmd] = this.list.update(msg)
    this.list = l
    return [this, cmd]
  }

  view() {
    if (this.chosen) {
      return ['', this.list.view(), '', `  ✓ chosen: ${this.chosen}`, ''].join('\n')
    }

    // Indent every line — the help block is multi-line in full (?) mode.
    const hints = indent(this.help.view(list.keys), 2)
    return ['', this.list.view(), '', hints, '', '  ? toggle help', ''].join('\n')
  }
}

function indent(block, n) {
  const pad = ' '.repeat(n)
  return block
    .split('\n')
    .map((line) => pad + line)
    .join('\n')
}

new Program(new Picker()).run()
