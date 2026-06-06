# select

A compact dropdown over a fixed list of options. Where
[autocomplete](autocomplete.md) is for _open_ typing with a filtered menu,
select is for a _closed_ set you pick from: it shows one line (the current
choice) until you open it, then a menu to choose from.

[← all components](../README.md#components)

## Usage

Like autocomplete, rendering is split in two so the dropdown never reflows the
layout — `view()` is the one-line control, `menuView()` is the overlay:

```js
const { select } = require('bare-tui')

const fruit = select
  .create({
    options: ['apple', 'banana', 'cherry'],
    placeholder: 'pick one'
  })
  .focus()

// in view: draw the control, then overlay the menu where it fits
const line = fruit.view() // always one line, stable width
const menu = fruit.menuView() // '' when closed; rows when open
fruit.value() // 'apple', or null while nothing is chosen
```

## Options

| Option        | Default     | Description                       |
| ------------- | ----------- | --------------------------------- |
| `options`     | `[]`        | Strings or `{ label, value }`     |
| `selected`    | `-1`        | Initial index (`-1` = none)       |
| `placeholder` | `'select…'` | Shown when nothing is chosen      |
| `maxVisible`  | `6`         | Rows before the menu scrolls      |
| `openGlyph`   | `'▾'`       | Trailing indicator on the control |

## API

- `value()` — the committed value, or `null`. `selectedOption()` → `{label,value}`.
- `setValue(v)` / `setOptions(opts)`.
- `view()` — the closed control line. `menuView()` — the dropdown, or `''`.
- `.open` — whether the menu is showing. `blur()` also closes it.

## Keys

The contract mirrors the other field controls. While **closed** it consumes only
`space` (to open) and never `enter`, so a parent form keeps `enter` for "submit".
While **open** it owns the menu — `↑`/`↓` move, `enter`/`space` commit, `esc`
cancels — which is fine because a form won't submit with a menu open. Bindings
are exported as `select.keys` for the [help](help.md) component.
