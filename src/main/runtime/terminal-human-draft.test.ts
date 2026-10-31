import { describe, expect, it } from 'vitest'
import {
  DRAFT_ABANDONED_AFTER_MS,
  TYPING_PAUSE_MS,
  ctrlCClearsDraftInstead,
  forgetTerminalDraft,
  isUserComposing,
  recordHumanTerminalInput
} from './terminal-human-draft'

describe('terminal human draft', () => {
  const id = 'pty-1'

  it('is composing while text is typed and not yet submitted', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'hel', 1000)
    expect(isUserComposing(id, 1500)).toBe(true)
    recordHumanTerminalInput(id, 'lo\r', 1600)
    expect(isUserComposing(id, 1700)).toBe(false)
  })

  it('ignores escape sequences such as focus reports and arrows', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, '\x1b[I\x1b[A\x1b[O', 1000)
    expect(isUserComposing(id, 1100)).toBe(false)
  })

  it('counts backspace and clears on ctrl-c or ctrl-u', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'ab\x7f\x7f', 1000)
    expect(isUserComposing(id, 1000 + TYPING_PAUSE_MS + 1)).toBe(false)
    recordHumanTerminalInput(id, 'abc\x15', 1200)
    expect(isUserComposing(id, 1300)).toBe(false)
  })

  it('treats a long-untouched draft as abandoned', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'half a thought', 1000)
    expect(isUserComposing(id, 1000 + DRAFT_ABANDONED_AFTER_MS + 1)).toBe(false)
  })

  it('keeps an emptied line as typing until the person pauses', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'ab\x7f\x7f', 1000)
    expect(isUserComposing(id, 1100)).toBe(true)
    expect(isUserComposing(id, 1000 + TYPING_PAUSE_MS + 1)).toBe(false)
  })

  it('keeps a multi-line draft after a newline', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'first line\n', 1000)
    expect(isUserComposing(id, 1000 + TYPING_PAUSE_MS + 1)).toBe(true)
  })

  it('reads kitty-encoded Enter as sending and Shift+Enter as a new line', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'hi\x1b[13;2u', 1000)
    expect(isUserComposing(id, 1000 + TYPING_PAUSE_MS + 1)).toBe(true)
    recordHumanTerminalInput(id, 'there\x1b[13u', 1100)
    expect(isUserComposing(id, 1200)).toBe(false)
  })

  describe('Ctrl+C with text in the box', () => {
    it('becomes keys that only clear the box', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'half a thought', 1000)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).toBe('\x05\x15')
      expect(ctrlCClearsDraftInstead(id, '\x1b[99;5u', 1100)).toBe('\x05\x15')
    })

    it('clears every line of a multi-line draft', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'one\ntwo\nthree', 1000)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).toBe('\x05\x15\x7f\x05\x15\x7f\x05\x15')
    })

    it('passes through when nothing is typed, after sending, and for other keys', () => {
      forgetTerminalDraft(id)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1000)).toBeNull()
      recordHumanTerminalInput(id, 'hello', 1000)
      expect(ctrlCClearsDraftInstead(id, 'x', 1100)).toBeNull()
      expect(ctrlCClearsDraftInstead(id, '\x03\x03', 1100)).toBeNull()
      recordHumanTerminalInput(id, '\r', 1200)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1300)).toBeNull()
    })

    it('lets a second Ctrl+C interrupt once the first emptied the box', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'oops', 1000)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).not.toBeNull()
      recordHumanTerminalInput(id, '\x03', 1100)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1500)).toBeNull()
    })

    it('does not trust a draft left untouched for a long time', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'old', 1000)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1000 + DRAFT_ABANDONED_AFTER_MS + 1)).toBeNull()
    })
  })
})
