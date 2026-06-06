# radio

Single choice from a fixed set of options. A tiny vertical list where the cursor
_is_ the value — the arrows move the selection directly, so there is no separate
highlight-then-commit step.

[← all components](../README.md#components)

## Usage

```js
const { radio } = require('bare-tui')

const size = radio
  .create({
    options: ['small', 'medium', 'large'],
    selected: 1
  })
  .focus()

// in update: const [r] = size.update(msg); this.size = r
// in view:   size.view()
size.value() // 'medium'
```

Options may be strings or `{ label, value }` objects; `value()` returns the
underlying value (the label when none is given).

## Options

| Option               | Default       | Description                  |
| -------------------- | ------------- | ---------------------------- |
| `options`            | `[]`          | Strings or `{ label, value}` |
| `selected`           | `0`           | Initial index                |
| `focused`            | `false`       | Start focused                |
| `onGlyph`/`offGlyph` | `(•)` / `( )` | Bullet characters            |

## API

- `value()` — the chosen value, or `null` when there are no options.
- `selectedOption()` — the chosen `{ label, value }`.
- `setValue(v)` — select by value (no-op if absent). `setOptions(opts)`.

## Keys

`↑`/`↓` (`k`/`j`) move the selection. **`enter` is not consumed**, so a parent
keeps it for "submit". The chosen option always shows a filled bullet (even when
blurred); a leading `›` marks the focused row. Bindings are exported as
`radio.keys` for the [help](help.md) component.
