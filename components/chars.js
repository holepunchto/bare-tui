// Characters, not code units. A JS string index can land inside a surrogate
// pair — every emoji is one — so the text fields step their cursor with these
// and insert whatever printable string the decoder handed them.

// A key that should be inserted as text: no modifier, and a sequence with no
// control bytes in it. Named keys always arrive as escape sequences, so they
// fail the second test; a single grapheme such as '❤️' passes whole.
function printable(msg) {
  const s = msg.sequence
  // eslint-disable-next-line no-control-regex
  return (
    !msg.ctrl && !msg.meta && typeof s === 'string' && s.length > 0 && !/[\x00-\x1f\x7f]/.test(s)
  )
}

// Index of the start of the character before `i`.
function before(s, i) {
  if (i <= 0) return 0
  const j = i - 1
  return j > 0 && isLow(s.charCodeAt(j)) && isHigh(s.charCodeAt(j - 1)) ? j - 1 : j
}

// Index just past the character at `i`.
function after(s, i) {
  if (i >= s.length) return s.length
  return i + (isHigh(s.charCodeAt(i)) && isLow(s.charCodeAt(i + 1)) ? 2 : 1)
}

function count(s) {
  let n = 0
  for (let i = 0; i < s.length; i = after(s, i)) n++
  return n
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff

module.exports = { printable, before, after, count }
