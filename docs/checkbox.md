# checkbox

A single boolean toggle. A focus-gated leaf input: it only reacts when focused,
so a parent can broadcast keys to several controls and only the focused one
moves.

[← all components](../README.md#components)

## Usage

```js
const { checkbox } = require('bare-tui')

const agree = checkbox.create({ label: 'I agree', checked: false }).focus()

// in update: const [c] = agree.update(msg); this.agree = c
// in view:   agree.view()   // "› [x] I agree"
agree.checked // boolean
```

## Options

| Option                            | Default       | Description              |
| --------------------------------- | ------------- | ------------------------ |
| `label`                           | `''`          | Text shown after the box |
| `checked`                         | `false`       | Initial state            |
| `focused`                         | `false`       | Start focused            |
| `checkedGlyph` / `uncheckedGlyph` | `[x]` / `[ ]` | Box characters           |

## API

- `toggle()` / `setChecked(v)` — change state imperatively.
- `focus()` / `blur()` — gate input. `.checked` / `.focused` are readable.

## Keys

`space` toggles. **`enter` is deliberately not consumed**, so a parent form can
keep `enter` for "submit" while a checkbox has focus. Bindings are exported as
`checkbox.keys` for the [help](help.md) component.

A leading `›` marks focus (a blank when blurred), the same idiom
[radio](radio.md) and [select](select.md) use, so the pointer never shifts the
line width.
