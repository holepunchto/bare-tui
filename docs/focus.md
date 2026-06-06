# focus

An ordered focus ring across a set of child components. This is connective
tissue, not a widget — it has **no `view()`**. It owns the one job every
multi-field screen reimplements: moving focus between children with
`tab`/`shift+tab`, blurring the old and focusing the new.

It relies only on the component contract the built-ins already follow
(`focus()` / `blur()` and `update(msg) → [model, cmd]`).

[← all components](../README.md#components)

## Usage

```js
const { focus, textinput, radio, checkbox } = require('bare-tui')

this.ring = focus.create({
  items: [
    textinput.create({ prompt: '> ' }),
    radio.create({ options: ['a', 'b'] }),
    checkbox.create({ label: 'ok' })
  ]
})

update(msg) {
  // Handle global / submit keys FIRST so a focused child can't swallow them.
  if (key.matches(msg, 'ctrl+c')) return [this, quit]
  if (key.matches(msg, 'enter')) return [this, this._submit()]
  // Then let the ring move focus and route the rest to the focused child,
  // threading its Cmd back up.
  const [ring, cmd] = this.ring.update(msg)
  this.ring = ring
  return [this, cmd]
}

view() {
  return this.ring.items.map((it) => it.view()).join('\n')
}
```

## Options

| Option  | Default             | Description                            |
| ------- | ------------------- | -------------------------------------- |
| `items` | `[]`                | Ordered focusable children             |
| `index` | `0`                 | Which child starts focused             |
| `keys`  | `tab` / `shift+tab` | Navigation bindings (`{ next, prev }`) |

On construction the ring syncs the children so exactly the indexed one is
focused.

## API

- `focused()` — the active child, or `null`. `.index` / `.items` are readable.
- `next()` / `prev()` / `focus(i)` — move focus imperatively (wraps).
- `setItems(items)` — replace the children and re-sync focus.
- `update(msg)` — handles navigation, then delegates everything else to the
  focused child and threads its Cmd up.

## Keys

Navigation defaults to `tab`/`shift+tab` **only** — deliberately not the arrows,
because the focusable children ([radio](radio.md), [select](select.md),
[list](list.md), [textarea](textarea.md)) use the arrows internally. Pass `keys`
to override if your children don't. Always handle global and submit keys in the
parent _before_ calling `ring.update`, so a focused child can't swallow the
escape hatch.
