// Program is the runtime — the event loop that drives one model.
//
// The Elm Architecture in three methods on a model:
//   init()        -> Cmd | null            run once at startup
//   update(msg)   -> [model, Cmd] | model  fold a Msg into new state
//   view()        -> string                render current state to text
//
// Program wires those to the terminal: it puts the input into raw mode, decodes
// keystrokes into KeyMsgs, claims the terminal's non-key reports (mouse, and
// focus when `focus: true`), turns SIGWINCH into resize Msgs, runs the
// update/render loop, executes Cmds off the update path, and — crucially —
// always restores the terminal on the way out.
//
// IO is injectable. By default it grabs the real TTY (fd 0/1); tests pass their
// own streams plus `isTTY: true` to exercise the full escape-sequence path
// without a terminal.
const tty = require('bare-tty')
const KeyDecoder = require('bare-ansi-escapes/key-decoder')
const Renderer = require('./renderer')
const ansi = require('./ansi')
const mouse = require('./mouse')
const { InputParser } = require('./input')
const { KeyMsg, windowSize, repaintMsg } = require('./messages')

// A terminal that is minimised, occluded, or backed by a detached pty reports
// a size of 0 — that means "unknown", not "zero rows". Forwarding it collapses
// any `height - chrome` layout to nothing, and the app has no way back until the
// next real resize, so we treat it as no report at all.
const known = (n) => (typeof n === 'number' && n > 0 ? n : null)

module.exports = class Program {
  constructor(model, opts = {}) {
    this.model = model
    this.opts = opts
    this.altScreen = opts.altScreen !== false

    // Frame coalescing: many Msgs arriving within one frame produce a single
    // render. fps <= 0 renders synchronously per update (handy in tests).
    this.fps = opts.fps ?? 60
    this._frameMs = this.fps > 0 ? Math.max(1, Math.round(1000 / this.fps)) : 0
    this._frameTimer = null
    this._needsRender = false

    // Mouse tracking: true → press/release, 'drag' → + held-button motion,
    // 'all' → + hover motion. Off by default.
    const m = opts.mouse
    this._mouseMode = m === true ? 'basic' : m === 'motion' ? 'drag' : m in mouse.MODES ? m : null

    // Focus reporting (DEC mode 1004): the terminal reports when its window
    // gains or loses focus as { type: 'focus', focused }. Off by default — not
    // every terminal implements it (Terminal.app and screen don't; tmux needs
    // `focus-events on`), and an app that doesn't care shouldn't pay for it.
    this._focus = opts.focus === true

    // Claims mouse / focus reports before the key decoder. Null when neither is
    // enabled, so the common case writes bytes straight through.
    this._parser = null

    // Only TTY fds can be put in raw mode / sized, and constructing a
    // tty.WriteStream on a non-TTY fd throws — so fall back to a no-op-ish
    // stream when there's no real terminal and nothing was injected.
    this._ownsInput = !opts.input
    this._ownsOutput = !opts.output
    this.input = opts.input || (tty.isTTY(0) ? new tty.ReadStream(0) : null)
    this.output = opts.output || (tty.isTTY(1) ? new tty.WriteStream(1) : null)

    // `isTTY` override lets headless tests drive the real rendering path.
    const detected = (s) => !!(s && s.isTTY)
    this.inputIsTTY = opts.isTTY ?? detected(this.input)
    this.outputIsTTY = opts.isTTY ?? detected(this.output)

    if (!this.output) {
      throw new Error('tea: no output stream (not a TTY); pass opts.output')
    }

    this.renderer = new Renderer(this.output, { altScreen: this.altScreen })

    // Single-consumer async message queue. send() wakes the loop.
    this._queue = []
    this._wake = null
    this._running = false
    this._tornDown = false
    this._suspended = false // true while the terminal is handed to a child process

    this._decoder = null
    this._onInput = null
    this._onKey = null
    this._onResize = null
    this._signals = []
  }

  // Enqueue a Msg from anywhere — key decoder, resize handler, Cmd result, or
  // external code (e.g. a worker IPC bridge calling program.send(...)).
  send(msg) {
    if (!msg) return
    this._queue.push(msg)
    if (this._wake) {
      const wake = this._wake
      this._wake = null
      wake()
    }
  }

  quit() {
    this.send({ type: 'quit' })
  }

  // Force a full repaint on the next frame. The renderer only rewrites rows
  // whose text changed, so it cannot know when something else has drawn over
  // the screen — a native library logging to the same fd, say. Call this from
  // outside the loop after such a write; from inside update(), return the
  // `repaint` Cmd instead.
  repaint() {
    this.send(repaintMsg())
  }

  async run() {
    this._running = true
    // try/finally guarantees the terminal is restored even if init/update/view
    // throws — otherwise a single bad model would leave the user in raw mode and
    // the alt-screen. The error still propagates after cleanup.
    try {
      this._setup()

      if (typeof this.model.init === 'function') this._exec(this.model.init())
      this.renderer.render(this._view()) // first frame before any input

      while (this._running) {
        const msg = await this._next()
        if (!msg) continue
        if (msg.type === 'quit') break
        // Three ways the screen stops matching what the renderer believes:
        // the geometry moved, the app told us it was disturbed, or the window
        // came back after something else may have drawn over it.
        if (msg.type === 'resize') this.renderer.resize(msg.width, msg.height)
        else if (msg.type === 'repaint') this.renderer.clear()
        else if (msg.type === 'focus' && msg.focused) this.renderer.clear()

        const [model, cmd] = this._update(msg)
        this.model = model
        this._invalidate() // coalesced render
        this._exec(cmd)
      }
    } finally {
      this._running = false
      this._cancelFrame()
      // Flush any pending coalesced frame so the final state is the last thing
      // drawn (matters for inline mode; harmless under the alt-screen).
      if (this._needsRender) {
        this._needsRender = false
        this.renderer.render(this._view())
      }
      this._teardown()
    }
    return this.model
  }

  // Mark the view dirty and schedule a render at most once per frame. Updates
  // that land in the same frame collapse into one write.
  _invalidate() {
    // While suspended the terminal belongs to a child process; a render here
    // would paint over it. We repaint in full on resume instead.
    if (this._suspended) return
    if (this._frameMs === 0) {
      this.renderer.render(this._view())
      return
    }
    this._needsRender = true
    if (this._frameTimer) return
    this._frameTimer = setTimeout(() => {
      this._frameTimer = null
      if (this._needsRender) {
        this._needsRender = false
        this.renderer.render(this._view())
      }
    }, this._frameMs)
  }

  _cancelFrame() {
    if (this._frameTimer) {
      clearTimeout(this._frameTimer)
      this._frameTimer = null
    }
  }

  // The pre-parser only exists when there's something to claim; otherwise input
  // bytes go straight to the key decoder.
  _newParser() {
    if (!this._mouseMode && !this._focus) return null
    return new InputParser({ mouse: this._mouseMode, focus: this._focus })
  }

  // The input reporting modes go on together after the screen is entered and
  // come off together before it's restored, so they never outlive the program
  // (_teardown) or leak into a child process (_suspendTerminal).
  _enableModes() {
    if (this._mouseMode) this.output.write(mouse.enable(this._mouseMode))
    if (this._focus) this.output.write(ansi.enableFocus)
  }

  _disableModes() {
    try {
      if (this._mouseMode) this.output.write(mouse.disable(this._mouseMode))
      if (this._focus) this.output.write(ansi.disableFocus)
    } catch {}
  }

  _setup() {
    if (this.input) {
      if (this.inputIsTTY && this.input.setRawMode) this.input.setRawMode(true)
      this._decoder = new KeyDecoder()
      // Forward bytes manually instead of input.pipe(decoder): streamx has no
      // unpipe, and a piped source destroyed mid-stream (which is exactly what
      // teardown does) destroys the destination with a synthetic "closed before
      // ending" error. Manual forwarding has no Pipeline, so teardown is clean.
      this._parser = this._newParser()
      this._onKey = (key) => this.send(new KeyMsg(key))
      this._onInput = (data) => {
        if (this._parser) {
          // Peel mouse / focus reports off the stream; the rest is keys.
          const { keys, events } = this._parser.feed(data)
          for (const event of events) this.send(event)
          if (keys.length) this._decoder.write(keys)
        } else {
          this._decoder.write(data)
        }
      }
      this._decoder.on('data', this._onKey)
      this.input.on('data', this._onInput)
    }

    if (this.outputIsTTY && typeof this.output.on === 'function') {
      this._onResize = () => {
        const width = known(this.output.columns)
        const height = known(this.output.rows)
        if (width === null || height === null) return // not a real geometry
        this.send(windowSize(width, height))
      }
      this.output.on('resize', this._onResize)
    }

    this.renderer.start()
    this._enableModes()

    // Seed the model with the initial geometry. Real TTYs report columns/rows;
    // injected streams won't, so fall back to opts then a sane default.
    const width = known(this.output.columns) ?? known(this.opts.width) ?? 80
    const height = known(this.output.rows) ?? known(this.opts.height) ?? 24
    this.renderer.resize(width, height) // fit frames to the screen from frame one
    this.send(windowSize(width, height))

    // In raw mode the kernel won't deliver Ctrl+C as SIGINT (the app sees it as
    // a key), but a kill/hangup from outside still must restore the terminal.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => this.send({ type: 'quit' })
      try {
        global.Bare.on(sig, handler)
        this._signals.push([sig, handler])
      } catch {}
    }
  }

  _teardown() {
    if (this._tornDown) return
    this._tornDown = true

    // No frame may fire after the screen is restored, or it writes onto the
    // user's normal buffer.
    this._cancelFrame()

    for (const [sig, handler] of this._signals) {
      try {
        global.Bare.removeListener(sig, handler)
      } catch {}
    }
    try {
      if (this._onResize) this.output.removeListener('resize', this._onResize)
    } catch {}
    // Detach the manual forwarders before tearing anything down so neither
    // stream sees data after it's gone.
    try {
      if (this.input && this._onInput) {
        this.input.removeListener('data', this._onInput)
      }
    } catch {}
    try {
      if (this._decoder && this._onKey) {
        this._decoder.removeListener('data', this._onKey)
      }
    } catch {}
    try {
      this._decoder?.destroy()
    } catch {}
    // Stop the reporting modes before leaving raw mode: in between the terminal
    // is line-buffered and echoing, so a report landing in that window would be
    // painted onto the screen we're about to hand back.
    this._disableModes()
    try {
      if (this.input && this.inputIsTTY && this.input.setRawMode) {
        this.input.setRawMode(false)
      }
    } catch {}

    this.renderer.stop() // show cursor, leave alt screen

    // We own the input fd, so close it; leave output open in case the host CLI
    // keeps writing after the TUI exits.
    if (this._ownsInput && this.input) {
      try {
        this.input.destroy()
      } catch {}
    }
  }

  // Hand the terminal back to the shell: stop decoding input, drop raw mode,
  // stop reading stdin, and leave the alt-screen. Mirrors the terminal parts of
  // _teardown, but keeps the model and loop alive.
  //
  // Crucially we must NOT close stdin's fd here: a child spawned with
  // `stdio: 'inherit'` inherits fd 0 directly, and a closed fd would hand it a
  // dead stdin (the editor exits instantly). So we detach + pause and leave the
  // fd open for the child.
  _suspendTerminal() {
    this._suspended = true
    this._cancelFrame()
    try {
      if (this.input && this._onInput) this.input.removeListener('data', this._onInput)
    } catch {}
    try {
      if (this._decoder && this._onKey) this._decoder.removeListener('data', this._onKey)
    } catch {}
    try {
      this._decoder?.destroy()
    } catch {}
    this._decoder = null
    // A half-claimed sequence must not survive into the resumed session.
    this._parser?.reset()
    // Off before the child runs: a program that doesn't understand these reports
    // would read them as garbage input.
    this._disableModes()
    try {
      if (this.input && this.inputIsTTY && this.input.setRawMode) this.input.setRawMode(false)
    } catch {}
    try {
      this.input?.pause?.()
    } catch {}
    this.renderer.stop()
  }

  // Reclaim the terminal after a suspend: re-enter the screen, restore raw mode,
  // re-attach the decoder, resume reading, and force a full repaint.
  _resumeTerminal() {
    this.renderer.start()
    if (this.input) {
      try {
        if (this.inputIsTTY && this.input.setRawMode) this.input.setRawMode(true)
      } catch {}
      this._decoder = new KeyDecoder()
      this._parser = this._newParser()
      this._decoder.on('data', this._onKey)
      this.input.on('data', this._onInput)
      try {
        this.input.resume?.()
      } catch {}
    }
    this._enableModes()
    this.renderer.clear() // next render repaints everything
    this._suspended = false

    // The window may well have been resized while the child owned the terminal,
    // and no SIGWINCH is coming to tell us about it — we were the ones not
    // looking. Re-read the geometry so the repaint below is drawn to the right
    // shape, and let the model re-lay-out if it actually moved.
    const width = known(this.output.columns)
    const height = known(this.output.rows)
    if (width !== null && height !== null) {
      const moved = width !== this.renderer.width || height !== this.renderer.height
      this.renderer.resize(width, height)
      if (moved) this.send(windowSize(width, height))
    }
  }

  // Normalise update()'s return into a [model, cmd] pair. Accepts a bare model
  // (no cmd) or null (no change), so update() can be terse.
  _update(msg) {
    const ret = this.model.update(msg)
    if (ret === undefined || ret === null) return [this.model, null]
    if (Array.isArray(ret)) return [ret[0] ?? this.model, ret[1] ?? null]
    return [ret, null]
  }

  _view() {
    try {
      return String(this.model.view())
    } catch (err) {
      return 'view error: ' + (err && err.message)
    }
  }

  // Kick off a Cmd off the update path. Fire-and-forget at the top level —
  // _runCmd dispatches each resulting Msg as it resolves.
  _exec(cmd) {
    this._runCmd(cmd)
  }

  // Recursively run a Cmd to completion. One function handles every shape so
  // they nest correctly:
  //   null/undefined  -> nothing
  //   array (batch)   -> run all concurrently, resolve when the last finishes
  //   { __seq } (seq) -> run in order, awaiting each (and its nested cmds)
  //   function (Cmd)  -> call it, send the Msg it returns
  // Bails if the program is quitting so a sequence can't outlive teardown.
  async _runCmd(cmd) {
    if (!cmd || !this._running) return

    if (Array.isArray(cmd)) {
      await Promise.all(cmd.map((c) => this._runCmd(c)))
      return
    }

    if (cmd.__seq) {
      for (const c of cmd.__seq) {
        if (!this._running) return
        await this._runCmd(c)
      }
      return
    }

    // suspend: hand the terminal to fn() (a child process), then resume.
    if (cmd.__suspend) {
      this._suspendTerminal()
      let msg = null
      try {
        msg = await cmd.__suspend()
      } catch (error) {
        msg = { type: 'error', error }
      }
      if (this._running) {
        this._resumeTerminal()
        this._invalidate() // repaint the restored screen
      }
      this.send(msg)
      return
    }

    try {
      this.send(await cmd())
    } catch (error) {
      this.send({ type: 'error', error })
    }
  }

  // Await the next Msg. The executor body runs synchronously, so _wake is set
  // before we suspend — no lost-wakeup race with send().
  async _next() {
    if (this._queue.length === 0) {
      await new Promise((resolve) => {
        this._wake = resolve
      })
    }
    return this._queue.shift()
  }
}
