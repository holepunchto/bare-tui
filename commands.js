// Commands (Cmd) are how a model asks the runtime to perform a side effect
// without doing it inline. A Cmd is just `() => Msg | Promise<Msg> | null`: the
// runtime calls it off the update path and feeds whatever Msg it returns back
// into update(). This keeps update() pure and makes async work (timers, IO,
// worker IPC) testable.
//
// update() returns `[model, cmd]`. `cmd` may be a single Cmd, an array of Cmds
// (run concurrently — see batch), a sequence marker (run in order — see
// sequence), or null for "do nothing".
const { quitMsg } = require('./messages')

// `quit` is itself a Cmd: return it from update() to tear down and exit, e.g.
//   return [model, quit]
function quit() {
  return quitMsg()
}

// Run several Cmds concurrently. The runtime expands arrays, so batch is just a
// null-filtering spread — but naming it documents intent at the call site.
function batch(...cmds) {
  return cmds.flat().filter(Boolean)
}

// Run several Cmds one after another, waiting for each to resolve before
// starting the next. The runtime recognises the `__seq` marker.
function sequence(...cmds) {
  return { __seq: cmds.flat().filter(Boolean) }
}

// Resolve to a Msg after `ms`, measured from when the Cmd runs. `fn(date)` maps
// the fire time to a Msg; pass no fn for a plain timer. Re-issue it from
// update() to repeat. Use this for relative delays / debounces.
function tick(ms, fn) {
  return () =>
    new Promise((resolve) => {
      setTimeout(() => resolve(fn ? fn(new Date()) : null), ms)
    })
}

// Suspend the TUI, run an async function with the terminal handed back to the
// shell, then resume and repaint. Use it to drop into an external program that
// needs the real terminal — an editor ($EDITOR), a pager, a sub-shell:
//
//   return [model, suspend(async () => {
//     await runEditor(file)              // owns the TTY while it runs
//     return { type: 'edited', file }    // delivered to update() after resume
//   })]
//
// The runtime detaches the terminal (drops raw mode, leaves the alt-screen,
// releases stdin) before calling fn and re-attaches + repaints after it
// settles. Whatever Msg fn resolves to is dispatched once the TUI is back.
function suspend(fn) {
  return { __suspend: fn }
}

// Like tick, but aligned to wall-clock boundaries: every(1000, ...) fires on
// each whole second rather than one second after it happened to start. Keeps
// repeated timers from drifting. Re-issue from update() to keep it going.
function every(ms, fn) {
  return () =>
    new Promise((resolve) => {
      const delay = ms - (Date.now() % ms)
      setTimeout(() => resolve(fn ? fn(new Date()) : null), delay)
    })
}

module.exports = { quit, batch, sequence, tick, every, suspend }
