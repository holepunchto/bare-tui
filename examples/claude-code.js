// A fake "agentic coding" TUI — a playful, backend-free homage to Claude Code,
// built to exercise most of bare-tui at once.
//
//   bare examples/claude-code.js
//
// What it shows off:
//   • autocomplete — a slash-command palette ('/' opens the menu; tab accepts)
//   • spinner      — drives the "thinking" shimmer and each running tool
//   • viewport     — the scrollable transcript (pgup/pgdn or the mouse wheel)
//   • style        — gradient banner, rounded boxes, a little markdown renderer
//   • commands     — tick() Cmds run the whole (entirely fake) agent loop
//
// The fun part: when you send a prompt the "agent" runs a scripted sequence of
// tool calls. Each tool EXPANDS while it runs (spinner + streaming detail) then
// COLLAPSES to a one-line summary when it finishes — and the final answer is
// revealed line by line, like a real stream. No AI, no network, no disk: every
// result is canned. Type a message, or '/' for commands. Ctrl+C interrupts a
// run, and quits when idle.
const { Program, quit, tick, key, style, spinner, autocomplete, viewport } = require('..')

// ── little helpers ───────────────────────────────────────────────────────

// Word-wrap plain text to a column width (ANSI-free input expected).
function wrap(text, w) {
  const out = []
  for (const para of String(text).split('\n')) {
    if (para === '') {
      out.push('')
      continue
    }
    let line = ''
    for (const word of para.split(' ')) {
      if (line && style.width(line) + 1 + style.width(word) > w) {
        out.push(line)
        line = word
      } else {
        line = line ? line + ' ' + word : word
      }
    }
    out.push(line)
  }
  return out
}

// Per-character gradient across a string (the banner's party trick).
function gradient(str, from, to) {
  const a = hex(from)
  const b = hex(to)
  const chars = [...str]
  return chars
    .map((ch, i) => {
      const t = chars.length <= 1 ? 0 : i / (chars.length - 1)
      const c = '#' + a.map((v, k) => byte(Math.round(v + (b[k] - v) * t))).join('')
      return style().bold(true).foreground(c).render(ch)
    })
    .join('')
}
function hex(s) {
  let h = s.replace('#', '')
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function byte(n) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
}

// ── themes ─────────────────────────────────────────────────────────────────

const THEMES = [
  { name: 'sunset', accent: '#EE6FF8', accent2: '#FF8C42', from: '#F857A6', to: '#FF8C42' },
  { name: 'ocean', accent: '#5BC8FF', accent2: '#7AA2F7', from: '#43E97B', to: '#38B6FF' },
  { name: 'matrix', accent: '#39FF14', accent2: '#9DFF8C', from: '#39FF14', to: '#0FB80F' }
]

// ── slash commands ───────────────────────────────────────────────────────

const COMMANDS = [
  { name: 'help', desc: 'show what this demo can do' },
  { name: 'clear', desc: 'clear the conversation' },
  { name: 'model', desc: 'cycle the (pretend) model' },
  { name: 'theme', desc: 'cycle the color theme' },
  { name: 'cost', desc: 'show token usage so far' },
  { name: 'compact', desc: 'summarize & shrink the transcript' },
  { name: 'quit', desc: 'exit the demo' }
]

const MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5']

// ── scripted "agent" scenarios ─────────────────────────────────────────────
//
// Each step EXPANDS while running (its `detail` lines stream under it) then
// COLLAPSES to "✓ <tool> <arg> · <extra>". `answer` is light markdown.

function pickScenario(prompt) {
  const p = prompt.toLowerCase()
  if (/\btest|spec|jest|brittle\b/.test(p)) return testScenario(prompt)
  if (/\bbug|fix|error|crash|fail|broken\b/.test(p)) return fixScenario(prompt)
  if (/\badd|build|create|feature|implement|new\b/.test(p)) return featureScenario(prompt)
  return exploreScenario(prompt)
}

function testScenario() {
  return {
    steps: [
      step(
        'Grep',
        'describe\\(',
        ['test/index.js', 'test/auth.js', 'test/api.js'],
        '3 files',
        ['test/index.js:1   describe("auth", …)', 'test/api.js:1     describe("api", …)'],
        700
      ),
      step(
        'Bash',
        'npm test',
        '42 passed',
        [
          '> brittle test/index.js',
          'ok 1 — login rejects bad password',
          'ok 2 — token refresh rotates secret',
          '…',
          '# tests 42  # pass 42  # fail 0'
        ],
        1300
      ),
      step(
        'Read',
        'test/auth.js',
        '96 lines',
        ['test("token refresh", async (t) => {', '  t.is(refresh(stale).exp > now, true)'],
        600
      )
    ],
    answer: [
      'All **42 tests pass** ✅ — the suite is green.',
      '',
      'Coverage is solid across the auth and api modules. A couple of ideas if you',
      'want to push it further:',
      '',
      '- add a property test around `refresh()` for clock skew',
      '- assert the `401` path in `api.js`, which is currently untested',
      '',
      '```sh',
      'npm test -- --grep auth   # focus just the auth specs',
      '```'
    ].join('\n')
  }
}

function fixScenario() {
  return {
    steps: [
      step(
        'Grep',
        'TypeError',
        ['src/session.js'],
        '1 hit',
        ['src/session.js:88  return user.profile.name'],
        650
      ),
      step(
        'Read',
        'src/session.js',
        '142 lines',
        [
          ' 86  function greet (user) {',
          ' 87    // user may be a guest →  no profile',
          ' 88    return user.profile.name'
        ],
        800
      ),
      step(
        'Edit',
        'src/session.js',
        '+3 −1',
        ['- return user.profile.name', '+ return user.profile?.name ?? "there"'],
        750
      ),
      step(
        'Bash',
        'npm test',
        '18 passed',
        ['ok — greet() handles guests', '# pass 18  # fail 0'],
        1100
      )
    ],
    answer: [
      'Found it. `greet()` assumed every user has a `profile`, but **guest users**',
      "don't — so `user.profile.name` threw a `TypeError`.",
      '',
      '## The fix',
      'Optional chaining plus a friendly fallback:',
      '',
      '```js',
      'return user.profile?.name ?? "there"',
      '```',
      '',
      'Tests pass and the crash is gone. Guests now see *"Hi there"* instead of a',
      'stack trace.'
    ].join('\n')
  }
}

function featureScenario() {
  return {
    steps: [
      step(
        'Read',
        'README.md',
        '210 lines',
        ['# bare-tui', 'A little TUI framework for Bare…'],
        600
      ),
      step(
        'Grep',
        'module.exports',
        ['index.js', 'components/*.js'],
        '13 files',
        ['index.js:40  module.exports = { Program, … }'],
        700
      ),
      step(
        'Write',
        'components/badge.js',
        '38 lines',
        ['class Badge {', '  view () { return style().padding(0,1)…  }', '}'],
        900
      ),
      step('Edit', 'index.js', '+2 −0', ['+ const badge = require("./components/badge")'], 600),
      step('Bash', 'npm test', '51 passed', ['ok — badge renders a pill', '# pass 51'], 1200)
    ],
    answer: [
      'Done — added a little **`badge`** component and wired it into the public API.',
      '',
      '## What changed',
      '- `components/badge.js` — a rounded pill with a label and color',
      '- `index.js` — exported `badge` alongside the other components',
      '- a passing test covering the default render',
      '',
      'Use it like the rest:',
      '',
      '```js',
      "const { badge } = require('bare-tui')",
      "badge.create({ label: 'NEW', color: 'magenta' }).view()",
      '```'
    ].join('\n')
  }
}

function exploreScenario(prompt) {
  return {
    steps: [
      step(
        'Grep',
        kw(prompt),
        ['index.js', 'program.js', 'style.js'],
        '7 hits',
        ['program.js:24  class Program {', 'style.js:212   class Style {'],
        700
      ),
      step(
        'Read',
        'program.js',
        '320 lines',
        ['// Program is the runtime — the event loop.', 'init() / update(msg) / view()'],
        750
      ),
      step('Read', 'index.js', '61 lines', ['module.exports = { Program, …components }'], 550)
    ],
    answer: [
      `Here's the lay of the land for **"${prompt.trim() || 'the codebase'}"**.`,
      '',
      'bare-tui is The Elm Architecture on Bare: a model exposes `init`/`update`/',
      '`view`, and the `Program` turns keystrokes and timers into messages.',
      '',
      '- **`program.js`** — the runtime / event loop',
      '- **`style.js`** — ANSI-aware layout & styling (this banner uses it)',
      '- **`components/`** — composable models like the one drawing this menu',
      '',
      'Ask me to *add*, *fix*, or *test* something to watch the tool loop run.'
    ].join('\n')
  }
}

function step(tool, arg, a, b, c, d) {
  // Grep passes a file list as its 3rd arg → step(tool, arg, [files], extra, detail, ms).
  // Everyone else omits it → step(tool, arg, extra, detail, ms).
  if (Array.isArray(a)) return { tool, arg, files: a, extra: b, detail: c, ms: d }
  return { tool, arg, extra: a, detail: b, ms: c }
}
function kw(prompt) {
  const w = prompt
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 3)
  return w[0] || 'export'
}

// Tool → accent color for its ● badge.
const TOOL_COLOR = {
  Read: 'blue',
  Edit: 'yellow',
  Write: 'green',
  Bash: 'magenta',
  Grep: 'cyan',
  Web: '#7aa2f7'
}

// ── markdown-ish renderer for the final answer ──────────────────────────────

function renderAnswer(text, w, theme) {
  const out = []
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      // Collect a fenced code block and draw it in a dim rounded box.
      const code = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      const box = style()
        .width(Math.max(8, w - 4))
        .padding(0, 1)
        .border(style.borders.rounded)
        .borderForeground('gray')
        .foreground('cyan')
        .render(code.join('\n'))
      out.push(...box.split('\n'))
      continue
    }
    if (/^#{1,3}\s/.test(line)) {
      out.push(
        ...wrap(line.replace(/^#{1,3}\s/, ''), w).map((l) =>
          style().bold(true).foreground(theme.accent).render(l)
        )
      )
      continue
    }
    if (/^[-*]\s/.test(line)) {
      const bullet = style().foreground(theme.accent2).render('•')
      const body = wrap(protect(line.replace(/^[-*]\s/, '')), w - 2)
      out.push(`${bullet} ${inline(body[0], theme)}`)
      for (const rest of body.slice(1)) out.push(`  ${inline(rest, theme)}`)
      continue
    }
    if (line === '') {
      out.push('')
      continue
    }
    for (const l of wrap(protect(line), w)) out.push(inline(l, theme))
  }
  return out.join('\n')
}

// Inline styling happens *after* wrapping, so an emphasized phrase must not be
// split across lines or its markers would leak. protect() pins the spaces
// inside **bold**, *italic* and `code` spans to a non-breaking space (which
// wrap() won't break on); inline() styles the span and restores the spaces.
const NB = '\u00A0' // non-breaking space — wrap() never splits on it
const unprotect = (s) => s.replace(/\u00A0/g, ' ')
function protect(text) {
  const nb = (s) => s.replace(/ /g, NB)
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_, t) => '**' + nb(t) + '**')
    .replace(/(^|[^*])\*([^*]+)\*/g, (_, p, t) => p + '*' + nb(t) + '*')
    .replace(/`([^`]+)`/g, (_, t) => '`' + nb(t) + '`')
}

// Inline markup: **bold**, *italic*, `code`. Restores protected spaces.
function inline(line) {
  return unprotect(
    line
      .replace(/\*\*([^*]+)\*\*/g, (_, t) => style().bold(true).render(unprotect(t)))
      .replace(/(^|[^*])\*([^*]+)\*/g, (_, p, t) => p + style().italic(true).render(unprotect(t)))
      .replace(/`([^`]+)`/g, (_, t) => style().foreground('cyan').render(unprotect(t)))
  )
}

// ── the app ──────────────────────────────────────────────────────────────

const THINK_MS = 650 // how long the "Thinking…" shimmer lasts
const STREAM_MS = 70 // per-line reveal cadence for the answer

class App {
  constructor() {
    this.width = 80
    this.height = 24
    this.themeIndex = 0
    this.modelIndex = 0
    this.tokens = { in: 0, out: 0 }

    this.spinner = spinner.create({ frames: spinner.dots, fps: 12 })
    this.body = viewport.create({ width: 0, height: 10 })
    this.input = autocomplete
      .create({
        prompt: gradient('❯ ', this.theme.from, this.theme.to),
        placeholder: 'ask me to add / fix / test something — or press / for commands',
        suggestions: COMMANDS
      })
      .focus()

    this.entries = []
    this.busy = false
    this.runId = 0
    this.activeIndex = -1
    this.follow = true
    this.headerH = 4

    this._welcome()
  }

  get theme() {
    return THEMES[this.themeIndex]
  }
  get model() {
    return MODELS[this.modelIndex]
  }

  init() {
    return this.spinner.init()
  }

  // ── messages ─────────────────────────────────────────────────────────────

  update(msg) {
    if (msg.type === 'resize') {
      this.width = msg.width
      this.height = msg.height
      this._layout()
      this._sync()
      return [this, null]
    }

    if (msg.type === 'spinner.tick') {
      const [s, cmd] = this.spinner.update(msg)
      this.spinner = s
      if (this.busy) this._sync() // animate the running tool / shimmer
      return [this, cmd]
    }

    if (msg.type === 'agent.advance') {
      if (msg.id !== this.runId) return [this, null] // stale (interrupted/cleared)
      const cmd = this._advance()
      this._sync()
      return [this, cmd]
    }

    if (msg.type === 'mouse') {
      if (msg.action === 'wheel') {
        if (msg.button === 'wheelup') this.body.scrollUp(3)
        else this.body.scrollDown(3)
        this.follow = this.body.atBottom
      }
      return [this, null]
    }

    if (msg.type === 'key') return this._key(msg)
    return [this, null]
  }

  _key(msg) {
    // Ctrl+C: interrupt a run, otherwise quit. Esc interrupts too.
    if (key.matches(msg, 'ctrl+c')) {
      if (this.busy) return [this._interrupt(), null]
      return [this, quit]
    }
    if (this.busy) {
      if (key.matches(msg, 'esc')) return [this._interrupt(), null]
      if (key.matches(msg, 'pageup', 'pagedown', 'ctrl+u', 'ctrl+d')) {
        this.body.update(msg)
        this.follow = this.body.atBottom
      }
      return [this, null] // input is disabled while the agent "works"
    }

    // Idle: scrolling keys drive the transcript, enter submits.
    if (key.matches(msg, 'pageup', 'pagedown', 'ctrl+u', 'ctrl+d')) {
      this.body.update(msg)
      this.follow = this.body.atBottom
      return [this, null]
    }
    if (key.matches(msg, 'enter')) {
      // Enter runs the highlighted command when the menu is open (complete +
      // run in one stroke), otherwise it sends whatever's typed.
      const s = this.input.open && this.input.selectedSuggestion()
      return this._submit(s ? '/' + s.name : this.input.value)
    }

    const [input, cmd] = this.input.update(msg)
    this.input = input
    return [this, cmd]
  }

  // ── actions ────────────────────────────────────────────────────────────

  _submit(raw) {
    const text = String(raw ?? this.input.value).trim()
    if (!text) return [this, null]
    this.input.reset()

    if (text.startsWith('/')) return this._command(text)

    // Kick off a (fake) agent run.
    this.entries.push({ role: 'user', text })
    const sc = pickScenario(text)
    this.entries.push({
      role: 'assistant',
      steps: sc.steps,
      answer: sc.answer,
      phase: 'thinking',
      stepIndex: -1,
      shownLines: 0,
      interrupted: false
    })
    this.activeIndex = this.entries.length - 1
    this.busy = true
    this.runId++
    this.tokens.in += Math.round(text.length / 4) + 12
    this.input.blur()
    this.follow = true
    this._sync()
    return [this, this._tick(THINK_MS)]
  }

  // Advance the active run's little state machine by one beat.
  _advance() {
    const e = this.entries[this.activeIndex]
    if (!e) return null

    if (e.phase === 'thinking') {
      e.phase = 'working'
      e.stepIndex = 0
      return this._tick(e.steps[0].ms)
    }

    if (e.phase === 'working') {
      this.tokens.out += 40 + (e.steps[e.stepIndex]?.detail.length || 0) * 8
      e.stepIndex++
      if (e.stepIndex >= e.steps.length) {
        e.phase = 'streaming'
        e.shownLines = 0
        return this._tick(STREAM_MS)
      }
      return this._tick(e.steps[e.stepIndex].ms)
    }

    if (e.phase === 'streaming') {
      e.shownLines++
      const total = renderAnswer(e.answer, this._answerWidth(), this.theme).split('\n').length
      this.tokens.out += 6
      if (e.shownLines >= total) {
        e.phase = 'done'
        this.busy = false
        this.input.focus()
        return null
      }
      return this._tick(STREAM_MS)
    }
    return null
  }

  _interrupt() {
    const e = this.entries[this.activeIndex]
    if (e) e.interrupted = true // freeze the turn where it is (phase unchanged)
    this.runId++ // any in-flight tick is now stale
    this.busy = false
    this.input.focus()
    this._sync()
    return this
  }

  _tick(ms) {
    const id = this.runId
    return tick(ms, () => ({ type: 'agent.advance', id }))
  }

  _command(text) {
    const name = text.slice(1).split(/\s+/)[0]
    switch (name) {
      case 'quit':
      case 'exit':
        return [this, quit]
      case 'clear':
        this.entries = []
        this.runId++
        this._welcome()
        break
      case 'help':
        this._sys(this._helpLines())
        break
      case 'model':
        this.modelIndex = (this.modelIndex + 1) % MODELS.length
        this._sys([
          `switched model → ${style().bold(true).foreground(this.theme.accent).render(this.model)}`
        ])
        break
      case 'theme':
        this.themeIndex = (this.themeIndex + 1) % THEMES.length
        this.input.input.prompt = gradient('❯ ', this.theme.from, this.theme.to)
        this._sys([
          `theme → ${style().bold(true).foreground(this.theme.accent).render(this.theme.name)}`
        ])
        break
      case 'cost': {
        const t = this.tokens
        const cost = ((t.in + t.out) / 1000) * 0.015
        this._sys([
          `tokens   ${style().foreground('cyan').render(String(t.in))} in · ${style().foreground('cyan').render(String(t.out))} out`,
          `cost     ${style()
            .foreground('green')
            .render(
              '$' + cost.toFixed(4)
            )}  ${style().faint(true).render('(make-believe pricing)')}`
        ])
        break
      }
      case 'compact': {
        const n = this.entries.length
        this.entries = []
        this._sys([
          `compacted ${n} message(s) → ${style().foreground('green').render('1 summary')}  ${style().faint(true).render('(context freed)')}`
        ])
        break
      }
      default:
        this._sys([
          `${style().foreground('red').render('unknown command:')} /${name}   try ${style().foreground(this.theme.accent).render('/help')}`
        ])
    }
    this.follow = true
    this._sync()
    return [this, null]
  }

  // ── content ──────────────────────────────────────────────────────────────

  _welcome() {
    this._sys([
      style()
        .bold(true)
        .foreground(this.theme.accent)
        .render('Welcome to the bare-tui agent demo.'),
      '',
      'This is a toy — no AI, no network, no disk. It just shows the framework off:',
      `${style().foreground(this.theme.accent2).render('•')} type a request (try "add a logout button" or "fix the crash")`,
      `${style().foreground(this.theme.accent2).render('•')} press ${style().foreground(this.theme.accent).render('/')} for slash commands, ${style().foreground(this.theme.accent).render('tab')} to accept one`,
      `${style().foreground(this.theme.accent2).render('•')} watch each tool expand, then collapse into a summary`
    ])
  }

  _helpLines() {
    const rows = COMMANDS.map(
      (c) =>
        `  ${style()
          .foreground(this.theme.accent)
          .render('/' + c.name.padEnd(8))} ${style().faint(true).render(c.desc)}`
    )
    return [
      style().bold(true).render('commands'),
      ...rows,
      '',
      style().bold(true).render('keys'),
      `  ${style().foreground(this.theme.accent).render('enter   ')} ${style().faint(true).render('send / accept a suggestion')}`,
      `  ${style().foreground(this.theme.accent).render('pgup/dn ')} ${style().faint(true).render('scroll the transcript (or mouse wheel)')}`,
      `  ${style().foreground(this.theme.accent).render('esc     ')} ${style().faint(true).render('interrupt a running task')}`,
      `  ${style().foreground(this.theme.accent).render('ctrl+c  ')} ${style().faint(true).render('interrupt, or quit when idle')}`
    ]
  }

  _sys(lines) {
    this.entries.push({ role: 'system', lines })
  }

  _answerWidth() {
    return Math.max(20, this.width - 6)
  }

  _layout() {
    this.body.height = Math.max(3, this.height - this.headerH - 4)
    this.input.maxVisible = Math.min(6, Math.max(2, this.body.height - 2))
  }

  // Rebuild the transcript and (when following) pin it to the bottom.
  _sync() {
    this.body.setContent(this._transcript())
    if (this.follow) this.body.gotoBottom()
  }

  _transcript() {
    const w = this.width - 4
    const out = []
    const push = (s) => out.push(' ' + s) // 1-col left margin for the body
    for (const e of this.entries) {
      if (out.length) push('')
      if (e.role === 'user') {
        const lines = wrap(e.text, w - 2)
        push(
          `${style().bold(true).foreground(this.theme.accent).render('❯')} ${style().bold(true).render(lines[0])}`
        )
        for (const l of lines.slice(1)) push('  ' + l)
      } else if (e.role === 'system') {
        for (const l of e.lines) push(l)
      } else {
        this._renderAssistant(e, push, w)
      }
    }
    return out.join('\n')
  }

  // Renders the assistant turn from its *current* phase — interrupting doesn't
  // fast-forward to "done"; it just freezes whatever is on screen and appends
  // the interrupted marker.
  _renderAssistant(e, push, w) {
    const reveal = e.phase === 'streaming' || e.phase === 'done'

    if (e.phase === 'thinking') {
      push(
        style().foreground(this.theme.accent).render(this.spinner.view()) +
          ' ' +
          style().italic(true).faint(true).render('Thinking…')
      )
    } else {
      const collapsedCount = reveal ? e.steps.length : e.stepIndex
      for (let i = 0; i < e.steps.length; i++) {
        const s = e.steps[i]
        const collapsed = i < collapsedCount
        const running = e.phase === 'working' && i === e.stepIndex && !e.interrupted
        if (!collapsed && !running) continue

        const dot = style()
          .foreground(TOOL_COLOR[s.tool] || 'white')
          .render('●')
        const head = `${dot} ${style().bold(true).render(s.tool)} ${style().foreground('gray').render(s.arg)}`

        if (collapsed) {
          push(
            `${style().foreground('green').render('✓')} ${head} ${style()
              .faint(true)
              .render('· ' + s.extra)}`
          )
        } else {
          push(`${style().foreground(this.theme.accent).render(this.spinner.view())} ${head}`)
          for (const d of s.detail) push('    ' + style().faint(true).render(d))
        }
      }

      if (reveal) {
        const full = renderAnswer(e.answer, this._answerWidth(), this.theme).split('\n')
        const n = e.phase === 'done' ? full.length : Math.min(e.shownLines, full.length)
        if (n > 0) push('')
        for (const l of full.slice(0, n)) push('  ' + l)
        if (e.phase === 'streaming' && !e.interrupted) {
          push('  ' + style().foreground(this.theme.accent).render(this.spinner.view()))
        }
      }
    }

    if (e.interrupted) {
      push(style().foreground('red').render('  ⎚ Interrupted by user'))
    }
  }

  // ── view ───────────────────────────────────────────────────────────────

  view() {
    return [this._header(), this._bodyWithMenu(), this._footer()].join('\n')
  }

  _header() {
    const logo = gradient('✻ claude-code', this.theme.from, this.theme.to)
    const tag = style().faint(true).render('· bare-tui edition')
    const meta =
      style().faint(true).render('model ') +
      style().foreground(this.theme.accent).render(this.model) +
      style().faint(true).render('   theme ') +
      style().foreground(this.theme.accent2).render(this.theme.name) +
      style().faint(true).render('   ~/holepunch/bare-tui')
    const inner = style.joinVertical(style.position.left, `${logo}  ${tag}`, meta)
    const box = style()
      .width(this.width - 4)
      .padding(0, 1)
      .border(style.borders.rounded)
      .borderForeground(this.theme.accent)
      .render(inner)
    this.headerH = style.height(box)
    return box
  }

  // The transcript, with the autocomplete menu floated over its bottom rows so
  // opening the menu never shifts the layout.
  _bodyWithMenu() {
    const lines = this.body.view().split('\n')
    const menu = this.input.menuView()
    if (menu) {
      const mrows = menu.split('\n')
      const start = Math.max(0, lines.length - mrows.length)
      for (let i = 0; i < mrows.length && start + i < lines.length; i++) {
        lines[start + i] = ' ' + mrows[i]
      }
    }
    return lines.join('\n')
  }

  _footer() {
    const w = this.width - 4
    let box
    if (this.busy) {
      const status =
        style().foreground(this.theme.accent).render(this.spinner.view()) +
        ' ' +
        style().italic(true).render('working…') +
        style().faint(true).render('   esc to interrupt')
      box = style()
        .width(w)
        .padding(0, 1)
        .border(style.borders.rounded)
        .borderForeground('gray')
        .render(status)
    } else {
      box = style()
        .width(w)
        .padding(0, 1)
        .border(style.borders.rounded)
        .borderForeground(this.theme.accent)
        .render(this.input.view())
    }
    const hint = this.busy
      ? style().faint(true).render('  the agent is on it — esc interrupts')
      : style().faint(true).render('  ↵ send · / commands · pgup/pgdn scroll · ctrl+c quit')
    return style.joinVertical(style.position.left, box, hint)
  }
}

// Exported so it can be driven headlessly in a test; runs when invoked direct.
module.exports = { App }
if (require.main === module) new Program(new App(), { mouse: true }).run()
