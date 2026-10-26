import { describe, expect, it } from 'vitest'
import {
  DRAFT_ABANDONED_AFTER_MS,
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
    expect(isUserComposing(id, 1100)).toBe(false)
    recordHumanTerminalInput(id, 'abc\x15', 1200)
    expect(isUserComposing(id, 1300)).toBe(false)
  })

  it('treats a long-untouched draft as abandoned', () => {
    forgetTerminalDraft(id)
    recordHumanTerminalInput(id, 'half a thought', 1000)
    expect(isUserComposing(id, 1000 + DRAFT_ABANDONED_AFTER_MS + 1)).toBe(false)
  })
})
