# dialog

A bordered box painted over the screen, centred, with a title in its top edge
and a hint in its bottom one. Whatever was under it stays put and comes back
untouched when the dialog closes, because the screen is rendered as if nothing
were open and the box is overlaid afterwards.

[← all components](../README.md#components)

## Usage

```js
const { dialog } = require('bare-tui')

const box = dialog.create({ title: 'Commands', hint: 'esc close', width: 60 })

// in view: the finished screen, then the box over it while open
view() {
  const screen = [this.header(), this.body(), this.footer()].join('\n')
  return this.paletteOpen ? box.overlay(screen, this.palette.view()) : screen
}
```

The dialog holds no state: what it frames is the caller's, usually another
component. Make it modal in `update()` — while it is open, route keys to that
component and nowhere else.

## Options

| Option             | Default                 | Description                                   |
| ------------------ | ----------------------- | --------------------------------------------- |
| `title`            | `''`                    | Written into the top edge                     |
| `hint`             | `''`                    | Written into the bottom edge, right-aligned   |
| `width`            | `0`                     | Outer width; `0` fits the widest content line |
| `border`           | `style.borders.rounded` | Border characters                             |
| `borderForeground` | `null`                  | Border colour                                 |
| `titleStyle`       | `style().bold(true)`    | Style for the title                           |
| `hintStyle`        | `style().faint(true)`   | Style for the hint                            |

## API

- `view(content)` — the box around `content` (a string; lines are truncated
  to fit). Its height is the content's plus two.
- `overlay(screen, content, x?, y?)` — `screen` with that box painted over
  its middle, or with its top-left at column `x`, row `y`.

Under the hood this is `style.overlay(base, block, x?, y?)`, which paints any
block over any other cell by cell, keeping the styling on either side of the
cut and turning a wide glyph split by an edge into a space.
