import { describe, expect, it } from 'vitest'
import {
  DRAFT_ABANDONED_AFTER_MS,
  TYPING_PAUSE_MS,
  ctrlCClearsDraftInstead,
  forgetTerminalDraft,
  isComposerNonEmpty,
  isUserComposing,
  recordHumanTerminalInput,
  resolveCtrlCForDraft
} from './terminal-human-draft'

const FULL_CLEAR = Array.from({ length: 50 }, () => '\x05\x15').join('\x7f')

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
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).toBe(FULL_CLEAR)
      expect(ctrlCClearsDraftInstead(id, '\x1b[99;5u', 1100)).toBe(FULL_CLEAR)
    })

    it('clears every line of a multi-line draft', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'one\ntwo\nthree', 1000)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).toBe(FULL_CLEAR)
    })

    it('keeps a pasted multi-line draft, even with carriage returns, clearable', () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, '\x1b[200~one\r\ntwo\rthree', 1000)
      recordHumanTerminalInput(id, '\x1b[201~', 1010)
      expect(ctrlCClearsDraftInstead(id, '\x03', 1100)).toBe(FULL_CLEAR)
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

  describe('the screen decides', () => {
    const screen = (text: string | null) => async () => text

    it('treats an empty box as clear however many keys the tally counted', async () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'phantom text', Date.now())
      expect(await isComposerNonEmpty(id, screen(''))).toBe(false)
      expect(await isComposerNonEmpty(id, screen('  \n '))).toBe(false)
    })

    it('sees text the tally never counted', async () => {
      forgetTerminalDraft(id)
      expect(await isComposerNonEmpty(id, screen('typed elsewhere'))).toBe(true)
    })

    it('falls back to the tally only when no screen can be read', async () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'abc', Date.now())
      expect(await isComposerNonEmpty(id, screen(null))).toBe(true)
      forgetTerminalDraft(id)
      expect(await isComposerNonEmpty(id, screen(null))).toBe(false)
    })

    it('Ctrl+C on an empty box goes straight through even if the tally says text', async () => {
      forgetTerminalDraft(id)
      recordHumanTerminalInput(id, 'phantom', Date.now())
      expect(await resolveCtrlCForDraft(id, '\x03', screen(''))).toBeNull()
      expect(await resolveCtrlCForDraft(id, '\x03', screen(' '))).toBeNull()
    })

    it('Ctrl+C clears a box that has text even if the tally missed it', async () => {
      forgetTerminalDraft(id)
      expect(await resolveCtrlCForDraft(id, '\x03', screen('hello'))).toBe('\x05\x15\x7f\x05\x15')
    })

    it('leaves other keys alone', async () => {
      expect(await resolveCtrlCForDraft(id, 'a', screen('hello'))).toBeNull()
    })
  })

  it('does not count terminal reply strings as typing', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(
      id,
      '\x1b]11;rgb:0000/0000/0000\x07\x1b]10;rgb:ffff/ffff/ffff\x1b\\',
      1000
    )
    expect(isUserComposing(id, 1100)).toBe(false)
  })
})
