// Tracks whether a person has an unsent draft in a terminal, from the keystrokes the app window
// writes to it, so programmatic messages can wait instead of landing inside what they are typing.

// A draft untouched this long is treated as abandoned, so a forgotten half-line cannot block
// delivery forever.
export const DRAFT_ABANDONED_AFTER_MS = 300_000
// Keystrokes this recent count as typing even when the draft count reads empty (an edit the count
// cannot follow), unless the last one sent or cleared the line.
export const TYPING_PAUSE_MS = 4_000
const MAX_DEFER_MS = 10 * 60_000
const POLL_MS = 100

type DraftState = {
  chars: number
  lines: number
  lastInputAt: number
  submitted: boolean
  inPaste: boolean
}

const drafts = new Map<string, DraftState>()

const ESC = String.fromCharCode(27)

// Enter and Backspace as the kitty keyboard protocol encodes them (TUIs that enable it); a modified
// Enter (Shift+Enter) adds a line to the draft rather than sending it.
const KITTY_ENTER = new RegExp(`${ESC}\\[13(?:;(\\d+))?u`, 'g')
const KITTY_BACKSPACE = new RegExp(`${ESC}\\[127(?:;\\d+)?u`, 'g')

function decodeKittyKeys(data: string): string {
  return data
    .replace(KITTY_ENTER, (_match, modifier?: string) =>
      !modifier || modifier === '1' ? '\r' : '\n'
    )
    .replace(KITTY_BACKSPACE, '\x7f')
}

// Escape sequences (arrows, focus reports, bracketed-paste markers) are not draft content.
function stripEscapeSequences(data: string): string {
  let out = ''
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] !== ESC) {
      out += data[i]
    } else if (data[i + 1] === '[') {
      i += 2
      while (i < data.length && !(data[i]! >= '@' && data[i]! <= '~')) {
        i += 1
      }
    } else {
      i += 2
    }
  }
  return out
}

const PASTE_MARKER = new RegExp(`${ESC}\\[20([01])~`)

export function recordHumanTerminalInput(ptyId: string, data: string, now = Date.now()): void {
  const state = drafts.get(ptyId) ?? {
    chars: 0,
    lines: 1,
    lastInputAt: now,
    submitted: true,
    inPaste: false
  }
  let { chars, lines, submitted, inPaste } = state
  let touched = false
  // Odd indexes of the split are the paste-marker digits (1 = start, 0 = end).
  const parts = data.split(new RegExp(PASTE_MARKER.source, 'g'))
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 1) {
      inPaste = parts[index] === '1'
      continue
    }
    // Why: inside a paste Enter is a line break of the draft, never a send, and CRLF is one break.
    const text = inPaste ? parts[index]!.replace(/\r\n?/g, '\n') : parts[index]!
    for (const char of stripEscapeSequences(decodeKittyKeys(text))) {
      touched = true
      if (char === '\r' || char === CTRL_C || char === '\x15') {
        chars = 0
        lines = 1
        submitted = true
      } else if (char === '\n') {
        // Why: a newline inside a multi-line draft (Shift+Enter, Ctrl+J) is still part of it.
        chars += 1
        lines += 1
        submitted = false
      } else if (char === '\x7f' || char === '\b') {
        chars = Math.max(0, chars - 1)
        submitted = false
      } else if (char >= ' ') {
        chars += 1
        submitted = false
      }
    }
  }
  if (touched || inPaste !== state.inPaste) {
    drafts.set(ptyId, { chars, lines, lastInputAt: now, submitted, inPaste })
  }
}

const CTRL_C = '\x03'
const KITTY_CTRL_C = `${ESC}[99;5u`
const MAX_CLEARED_LINES = 50

// What to write in place of a Ctrl+C the person pressed to clear their half-written message: it
// must empty the input box and nothing else, because the same key interrupts a running task or
// subagent. Null when the key should go through untouched (nothing typed, or not a lone Ctrl+C).
// Each line is cleared with end-of-line then kill-to-line-start, and Backspace joins it to the one
// above; a surplus Backspace on an empty box does nothing.
export function ctrlCClearsDraftInstead(
  ptyId: string,
  data: string,
  now = Date.now()
): string | null {
  const state = drafts.get(ptyId)
  if ((data !== CTRL_C && data !== KITTY_CTRL_C) || !state) {
    return null
  }
  if (state.chars === 0 || state.submitted || now - state.lastInputAt >= DRAFT_ABANDONED_AFTER_MS) {
    return null
  }
  // Why the full budget: the tracked line count misses edits it cannot follow (history recall,
  // cursor moves), and a surplus Backspace on an empty box is a no-op, so over-clearing is safe.
  return Array.from({ length: MAX_CLEARED_LINES }, () => '\x05\x15').join('\x7f')
}

export function isUserComposing(ptyId: string, now = Date.now()): boolean {
  const state = drafts.get(ptyId)
  if (!state) {
    return false
  }
  const idleFor = now - state.lastInputAt
  return (
    (state.chars > 0 && idleFor < DRAFT_ABANDONED_AFTER_MS) ||
    (!state.submitted && idleFor < TYPING_PAUSE_MS)
  )
}

export function forgetTerminalDraft(ptyId: string): void {
  drafts.delete(ptyId)
}

// Resolves once the person has sent or cleared their draft (or abandoned it). Polls only while a
// message is actually waiting, never at idle.
export async function waitUntilUserStopsComposing(
  ptyId: string,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + MAX_DEFER_MS
  while (isUserComposing(ptyId) && Date.now() < deadline && !signal?.aborted) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
