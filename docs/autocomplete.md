# autocomplete

A single-line input with a filtered suggestion menu — a slash-command palette.
Input-driven (no commands), built as a composition over
[textinput](textinput.md): keys fold into an embedded field, and a dropdown
offers the suggestions that match what's been typed. The menu opens only once
the line begins with a **trigger** character (default `/`), so ordinary prose in
the same field never pops a menu.

[← all components](../README.md#components)

## Usage

```js
const { autocomplete, key } = require('bare-tui')

class Prompt {
  constructor() {
    this.input = autocomplete
      .create({
        prompt: '> ',
        placeholder: 'message, or / for commands',
        suggestions: [
          { name: 'help', desc: 'show help' },
          { name: 'clear', desc: 'clear the screen' },
          { name: 'quit', desc: 'exit' }
        ]
      })
      .focus()
  }
  update(msg) {
    // Enter submits — the highlighted command when the menu is open (so it
    // both completes and runs), otherwise the typed line. Tab just completes.
    if (key.matches(msg, 'enter')) {
      const s = this.input.open && this.input.selectedSuggestion()
      this.submit(s ? '/' + s.name : this.input.value)
      this.input.reset()
      return [this, null]
    }
    const [f, cmd] = this.input.update(msg)
    this.input = f
    return [this, cmd]
  }
  view() {
    // Render the menu wherever it fits — above a bottom-anchored prompt here.
    return [this.input.menuView(), this.input.view()].filter(Boolean).join('\n')
  }
}
```

## Options

| Option        | Default | Description                                            |
| ------------- | ------- | ------------------------------------------------------ |
| `value`       | `''`    | Initial text                                           |
| `placeholder` | `''`    | Dim text shown when empty                              |
| `prompt`      | `''`    | Prefix drawn before the value (e.g. `'> '`)            |
| `suggestions` | `[]`    | `{ name, desc }` objects (or bare strings)             |
| `trigger`     | `'/'`   | The menu opens only when the line starts with this     |
| `maxVisible`  | `6`     | Rows shown before the menu scrolls and notes "…N more" |
| `focused`     | `false` | Start focused                                          |

## API

- `focus()` / `blur()` — toggle whether keys are consumed.
- `setValue(v)` / `reset()` — set or clear the text.
- `setSuggestions(list)` — replace the suggestion set.
- `accept()` — complete the line to the highlighted suggestion.
- `.value` — the current string.
- `.open` — whether the dropdown is currently showing.
- `selectedSuggestion()` — the highlighted `{ name, desc }`, or `null`.
- `matches()` — the suggestions matching the current text.
- `view()` — the input line. `menuView()` — the dropdown (or `''` when closed).

## Keys

While the menu is open: `↑`/`↓` (or `ctrl+p`/`ctrl+n`) move the highlight, `tab`
accepts it (completing the line), `esc` dismisses it until the text changes.
Every other key edits the field — see [textinput](textinput.md). The component
never consumes `enter`, leaving "submit" entirely to the parent (see above).
