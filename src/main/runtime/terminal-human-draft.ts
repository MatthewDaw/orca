// Tracks whether a person has an unsent draft in a terminal, from the keystrokes the app window
// writes to it, so programmatic messages can wait instead of landing inside what they are typing.

// A draft untouched this long is treated as abandoned, so a forgotten half-line cannot block
// delivery forever.
export const DRAFT_ABANDONED_AFTER_MS = 120_000
const MAX_DEFER_MS = 10 * 60_000
const POLL_MS = 250

type DraftState = { chars: number; lastInputAt: number }

const drafts = new Map<string, DraftState>()

const ESC = String.fromCharCode(27)

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

export function recordHumanTerminalInput(ptyId: string, data: string, now = Date.now()): void {
  const state = drafts.get(ptyId) ?? { chars: 0, lastInputAt: now }
  let chars = state.chars
  let touched = false
  for (const char of stripEscapeSequences(data)) {
    touched = true
    if (char === '\r' || char === '\n' || char === '\x03' || char === '\x15') {
      chars = 0
    } else if (char === '\x7f' || char === '\b') {
      chars = Math.max(0, chars - 1)
    } else if (char >= ' ') {
      chars += 1
    }
  }
  if (touched) {
    drafts.set(ptyId, { chars, lastInputAt: now })
  }
}

export function isUserComposing(ptyId: string, now = Date.now()): boolean {
  const state = drafts.get(ptyId)
  return Boolean(state && state.chars > 0 && now - state.lastInputAt < DRAFT_ABANDONED_AFTER_MS)
}

export function forgetTerminalDraft(ptyId: string): void {
  drafts.delete(ptyId)
}

// Resolves once the person has sent or cleared their draft (or abandoned it). Polls only while a
// message is actually waiting, never at idle.
export async function waitUntilUserStopsComposing(ptyId: string): Promise<void> {
  const deadline = Date.now() + MAX_DEFER_MS
  while (isUserComposing(ptyId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
