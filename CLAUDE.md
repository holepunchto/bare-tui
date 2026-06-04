# Building apps with bare-tui

Guidance for an AI (or human) building a terminal app **on top of** bare-tui.
This is not API reference — the [README](README.md) and [`docs/`](docs) cover
that, and each shipped component's source is short and meant to be read. This
file captures the patterns and traps that show up once an app grows past a
single screen. The [`examples/claude-code.js`](examples/claude-code.js) demo
exercises most of them in one place; reach for it as a worked reference.

## The shape of every app

bare-tui is [The Elm Architecture](https://guide.elm-lang.org/architecture/):

- **model** — a class holding all state. Mutating `this` is idiomatic.
- **`init() -> Cmd | null`** — the first command to run (timers, IO, a spinner).
- **`update(msg) -> [model, Cmd]`** — fold one message into new state. Return
  `[this, cmd]`; a bare `this` means "no command".
- **`view() -> string`** — render state to a string. **Keep it pure.** Do not
  mutate state, start work, or rebuild caches in `view()` — it can be called
  more than once per logical change, and side effects there cause flicker and
  heisenbugs. Compute in `update()`, render in `view()`.

Everything that happens is a message. Keystrokes, resizes, timer fires, async
results — all arrive through `update`. If you find yourself reaching for a
callback or an `await` inside `update`, you want a **Cmd** instead (below).

## Composing components (the thing you'll do constantly)

A component is just a model. To embed one: hold it as a field, route messages
into it, and thread its returned Cmd back up.

```js
update(msg) {
  if (msg.type === 'spinner.tick') {
    const [s, cmd] = this.spinner.update(msg)
    this.spinner = s
    return [this, cmd]          // thread the child's Cmd up to the Program
  }
  ...
}
```

In a larger app you'll have many components. Two rules keep this sane:

- **Gate input on focus.** Only the focused component should consume keys. The
  built-ins already no-op when unfocused (`textinput`, `autocomplete`, …), so
  you can broadcast a key to several and only the focused one reacts — but for
  your own components, follow the same contract.
- **Route by message type first, then broadcast the rest.** Handle the messages
  _you_ own (keys you bind, your own tagged msgs), then forward everything else
  to the active child. Don't try to demultiplex every key at the top level.

When you build your own component, copy the closest built-in and keep its
conventions: a `create()` factory, `update -> [model, cmd]` / `view -> string`,
ignore unrelated messages, gate on a `focused` flag, define keymaps with
`key.binding`, stay style-agnostic, and do animation/IO through Cmds.

## Commands, async, and the stale-result trap

A `Cmd` is `() => Msg | Promise<Msg> | null`. The runtime runs it _off_ the
update path and feeds the result back as a message. This is how you do timers,
network, disk, or worker IPC without blocking the UI. `init`/`update` return
Cmds; results come back as messages.

The trap that bites every non-trivial app: **an async result can arrive after
the state it was for is gone** — the user cancelled, navigated away, restarted
the operation, or a newer request superseded it. If you blindly apply it, you
get flicker, double-application, or a "ghost" of cancelled work.

The fix is a **generation/run id**. Stamp each operation with an id, capture
that id _when you issue the Cmd_, and ignore results whose id is stale:

```js
// issuing — capture the CURRENT id in the closure, do NOT read this.runId at fire time
_tick(ms) {
  const id = this.runId
  return tick(ms, () => ({ type: 'agent.advance', id }))
}

// handling — drop anything from a superseded run
if (msg.type === 'agent.advance') {
  if (msg.id !== this.runId) return [this, null]   // stale: cancelled or restarted
  ...
}

// cancelling/restarting — just bump the id; in-flight Cmds become stale
_interrupt() { this.runId++; this.busy = false; ... }
```

Capturing `id` at _issue_ time is the whole point — if your closure reads
`this.runId` at _fire_ time, a cancel that bumped the id will make the stale
result look current. The shipped `spinner` uses exactly this pattern
(`id` + monotonic `tag`) so a second spinner's ticks or a late/duplicate tick
can't double-drive its loop. Mirror it for your own loops.

Other Cmd notes:

- `batch(a, b)` runs Cmds concurrently; `sequence(a, b)` runs them in order.
- `tick(ms, fn)` is a relative delay; `every(ms, fn)` aligns to the wall clock
  so repeated timers don't drift. Re-issue from `update` to repeat.
- Errors thrown in a Cmd arrive as `{ type: 'error', error }` — handle them in
  `update` rather than letting the loop crash.

## Layout that survives the diff renderer

The renderer only repaints lines that changed, and components like `viewport`
emit a **fixed number of lines** every frame. This is fast, but it means
**layout stability matters**: if the number or position of lines shifts when it
doesn't need to, you get visible reflow and flicker.

Concrete consequences for a larger app:

- **Compute fixed regions from the window size.** On `resize`, derive your
  layout: e.g. `bodyHeight = totalHeight - headerHeight - footerHeight`, and
  size the scrolling component to `bodyHeight`. Everything flows from the
  `{ type: 'resize', width, height }` message.
- **Don't let transient UI resize the layout.** A dropdown, toast, or hint that
  appears on a keystroke should not push the rest of the screen around. Prefer
  to **overlay** it onto a region you already reserved rather than inserting
  lines. (The demo floats its command menu over the bottom rows of the
  transcript instead of inserting it above the input — so opening the menu never
  shifts anything.)
- **Pin widths with `.width(n)`.** A bordered box sized to its content jitters
  as content changes; a box pinned to the pane width keeps its right border on
  the screen edge. Short/blank lines pad out to the width.

## Text, width, and ANSI (measure visible cells, never `.length`)

Once you add color and borders, naive string math breaks. bare-tui's `style`
measures **visible width** — it ignores ANSI escapes and counts wide glyphs
(CJK, most emoji) as two cells.

- **Use `style.width(s)` / `style.truncate(s, n)` for any layout math**, not
  `s.length` or `s.slice`. A string with color codes has a `.length` far larger
  than what the user sees.
- **`viewport` truncates with a naive slice.** Its `view()` does
  `line.slice(0, width)`, which will cut an ANSI escape in half if your content
  is styled. If your viewport content contains color, **leave `width = 0`** and
  pre-wrap/pre-truncate the content yourself (ANSI-aware) before `setContent`.
- **Order of wrapping vs. styling is a real bug source.** If you word-wrap text
  and _then_ apply inline styling per line, a styled span that straddles a line
  break leaks its markers (`**bold**` → a stray `**`) or bleeds its SGR onto the
  rest of the line. Options, cheapest first: (a) keep styled spans unbreakable
  during wrap — the demo pins the spaces inside `**…**`/`` `…` `` to a
  non-breaking space so `wrap` won't split them, then styles and restores; or
  (b) wrap on plain text and re-open/close the active SGR at each line boundary.
  Either way, decide deliberately — don't wrap styled text and hope.

## Scrolling, focus, and "busy" state

For any app with a scrolling transcript/log plus a live input:

- **Follow-the-bottom.** Track a `follow` flag = "is the viewport at the
  bottom". On new content, `gotoBottom()` only while following; when the user
  scrolls up, stop following so you don't yank them back down. Re-enable follow
  when they scroll back to the bottom (or on a new submit).
- **Disable input while working.** When a long operation is running, route only
  scroll and interrupt keys; ignore text input. Show a distinct "busy" footer so
  it's obvious the field is inert. Re-focus the input when the operation ends or
  is interrupted.
- **Handle the global keys first.** Match `ctrl+c` (and your interrupt key)
  before routing to children, so a stuck child can't swallow the escape hatch. A
  common idiom: `ctrl+c` interrupts when busy, quits when idle. Use
  `key.matches(msg, …)` — it's null- and type-safe, so you don't have to guard
  `msg.type === 'key'` first.

## Testing headlessly (do this — it's a first-class path)

bare-tui runs with no real terminal. Drive a `Program` with injected streams and
assert on what it renders:

```js
const { PassThrough, Writable } = require('bare-stream')
const program = new Program(model, { input, output, isTTY: true, width: 80, height: 24, fps: 0 })
```

- **`fps: 0` renders synchronously per update** — deterministic frames, no
  waiting on the 60fps coalescer.
- **Assert on `stripAnsi(output)`** for visible text; unit-test components by
  calling `update(msg)` and checking state or `view()` directly.
- **The output is a diff stream, not a screen buffer.** A capture accumulates
  only the lines that _changed_. So "string appeared at some point" is reliable;
  "string is absent now" is not — re-rendering identical content emits nothing,
  so you can't prove a line is gone by its absence from the capture. For
  current-screen assertions, snapshot `stripAnsi(model.view())` instead of the
  stream.
- **Mock IO by injection.** Components that touch the outside world take their
  deps as parameters (e.g. `filepicker.mock(tree)` gives an in-memory fs). Build
  your own components the same way so they're testable with zero real IO.
- A lone `esc` byte may not decode to a key without a follow-up byte; prefer a
  concrete chord (or `ctrl+c`) when scripting interrupts in tests.

## Make modules both runnable and testable

An example/app file that ends in `new Program(new App()).run()` can't be
imported (it runs and grabs the TTY on require). Guard it:

```js
module.exports = { App }
if (require.main === module) new Program(new App(), { mouse: true }).run()
```

Now a test can `require` it, construct `App`, and drive it with injected streams.

## Quick gotcha checklist

- Side effects in `view()` → flicker. Compute in `update`.
- Async result applied after cancel → ghost state. Use a run id, captured at
  issue time.
- `.length`/`.slice` on styled strings → broken layout. Use `style.width` /
  `style.truncate`.
- Styled viewport content with `width > 0` → cut escape sequences. Set
  `width = 0` and pre-wrap.
- Wrap-then-style → leaked markers / bleeding color. Keep spans unbreakable or
  re-balance SGR per line.
- Transient UI inserting lines → whole-screen reflow. Overlay onto a reserved
  region instead.
- Child component swallowing `ctrl+c` → no escape hatch. Match global keys
  first.
- Forgetting to thread a child's Cmd up → its animation/IO silently never runs.
