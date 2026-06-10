// Tests for the filepicker — driven entirely against the in-memory mock fs, so
// no real I/O. Also exercises the mock itself (the thing consumers test with).
const { test } = require('brittle')
const { filepicker, KeyMsg } = require('..')

const named = (name) =>
  new KeyMsg({
    name,
    sequence: '\x1b[' + name,
    ctrl: false,
    meta: false,
    shift: false
  })

// Build a picker over a mock tree, rooted at '/'.
function picker(tree, opts = {}) {
  const m = filepicker.mock(tree)
  return filepicker.create({ fs: m.fs, path: m.path, cwd: m.root, ...opts })
}

test('filepicker: lists a directory, directories first then files', async (t) => {
  const fp = picker({
    'b.txt': null,
    'a.txt': null,
    docs: { 'x.md': null },
    src: {}
  })
  fp.update(await fp.init()()) // init() -> Cmd -> Promise<Msg>

  t.alike(
    fp.entries.map((e) => e.name),
    ['docs', 'src', 'a.txt', 'b.txt'],
    'dirs (alpha) before files (alpha)'
  )
  t.ok(fp.entries[0].directory, 'directory flagged')
  t.absent(fp.entries[2].directory, 'file not flagged')
})

test('filepicker: enter opens a directory', async (t) => {
  const fp = picker({ docs: { 'readme.md': null, 'guide.md': null } })
  fp.update(await fp.init()())

  const [, cmd] = fp.update(named('enter')) // cursor on "docs"
  t.is(fp.cwd, '/docs', 'descended into the directory')
  fp.update(await cmd())
  t.alike(
    fp.entries.map((e) => e.name),
    ['guide.md', 'readme.md'],
    'shows the subdirectory contents'
  )
})

test('filepicker: enter on a file selects it', async (t) => {
  const fp = picker({ 'note.txt': null })
  fp.update(await fp.init()())

  const [, cmd] = fp.update(named('enter'))
  t.is(fp.selectedPath(), '/note.txt', 'selected path set')
  t.alike(await cmd(), { type: 'filepicker.select', path: '/note.txt' }, 'emits a select Msg')
})

test('filepicker: backspace navigates to the parent', async (t) => {
  const m = filepicker.mock({ docs: { 'x.md': null } })
  const fp = filepicker.create({ fs: m.fs, path: m.path, cwd: '/docs' })
  fp.update(await fp.init()())

  const [, cmd] = fp.update(named('backspace'))
  t.is(fp.cwd, '/', 'went up to the parent')
  fp.update(await cmd())
  t.alike(
    fp.entries.map((e) => e.name),
    ['docs'],
    'parent listing'
  )
})

test('filepicker: hides dotfiles unless showHidden', async (t) => {
  const tree = { '.git': {}, 'a.txt': null }

  const hidden = picker(tree)
  hidden.update(await hidden.init()())
  t.alike(
    hidden.entries.map((e) => e.name),
    ['a.txt'],
    'dotfiles hidden by default'
  )

  const shown = picker(tree, { showHidden: true })
  shown.update(await shown.init()())
  t.alike(
    shown.entries.map((e) => e.name),
    ['.git', 'a.txt'],
    'dotfiles shown when enabled'
  )
})

test('filepicker: surfaces read errors', async (t) => {
  const m = filepicker.mock({ a: {} })
  const fp = filepicker.create({ fs: m.fs, path: m.path, cwd: '/missing' })
  fp.update(await fp.init()())

  t.ok(fp.error, 'error captured')
  t.is(fp.entries.length, 0, 'no entries on error')
})

test('filepicker (dir mode): enter selects the highlighted directory', async (t) => {
  const fp = picker({ src: { 'a.js': null }, 'note.txt': null }, { pick: 'dir' })
  fp.update(await fp.init()()) // cursor on "src" (dirs sort first)

  const [, cmd] = fp.update(named('enter'))
  t.is(fp.cwd, '/', 'enter does NOT descend in dir mode')
  t.is(fp.selectedPath(), '/src', 'selected the directory')
  t.alike(await cmd(), { type: 'filepicker.select', path: '/src' }, 'emits a select Msg')
})

test('filepicker (dir mode): →/l descends, files are not selectable', async (t) => {
  const fp = picker({ src: { nested: {}, 'a.js': null }, 'note.txt': null }, { pick: 'dir' })
  fp.update(await fp.init()())

  const [, cmd] = fp.update(named('right')) // descend into "src"
  t.is(fp.cwd, '/src', 'descended with →')
  fp.update(await cmd())

  // entries are: nested (dir), a.js (file). Move cursor onto the file.
  fp.update(named('down'))
  const [, fileCmd] = fp.update(named('enter'))
  t.is(fileCmd, null, 'enter on a file is a no-op in dir mode')
  t.is(fp.selectedPath(), null, 'nothing selected')
})

test('filepicker.mock: readdir reports entry types', (t) => {
  const m = filepicker.mock({ dir: { nested: {} }, 'file.txt': null })
  m.fs.readdir('/', { withFileTypes: true }, (err, ents) => {
    t.absent(err, 'no error reading root')
    const byName = Object.fromEntries(ents.map((e) => [e.name, e.isDirectory()]))
    t.alike(byName, { dir: true, 'file.txt': false }, 'directories vs files')
  })
})
