import { describe, expect, it } from 'vitest'
import {
  checkCodeScopeUpdate,
  CODE_SCOPE_MAX_CHARS,
  BRIEF_AGENT_COOLDOWN_MS,
  BRIEF_MAX_CHARS,
  checkAgentBriefUpdate
} from './workspace-container-brief-policy'

describe('checkAgentBriefUpdate', () => {
  it('accepts a small change outside the cooldown', () => {
    expect(checkAgentBriefUpdate({ brief: 'a' }, 'b', 1_000_000_000).ok).toBe(true)
  })

  it('rejects a brief over the size cap and asks to condense', () => {
    const result = checkAgentBriefUpdate({}, 'x'.repeat(BRIEF_MAX_CHARS + 1), 0)
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.reason).toContain('Condense')
  })

  it('rejects edits inside the cooldown and no-op edits', () => {
    const now = 10 * BRIEF_AGENT_COOLDOWN_MS
    expect(checkAgentBriefUpdate({ briefAgentUpdatedAt: now - 1000 }, 'new', now).ok).toBe(false)
    expect(checkAgentBriefUpdate({ brief: 'same' }, 'same', now).ok).toBe(false)
  })
})

describe('checkCodeScopeUpdate', () => {
  it('accepts a new scope with no cooldown, and rejects oversized or unchanged ones', () => {
    expect(checkCodeScopeUpdate({}, 'src/cv/').ok).toBe(true)
    expect(checkCodeScopeUpdate({ codeScope: 'src/cv/' }, 'src/cv/').ok).toBe(false)
    expect(checkCodeScopeUpdate({}, 'x'.repeat(CODE_SCOPE_MAX_CHARS + 1)).ok).toBe(false)
  })
})
