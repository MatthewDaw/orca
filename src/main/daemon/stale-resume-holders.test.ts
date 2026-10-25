import { describe, expect, it } from 'vitest'
import {
  findStaleResumeHolders,
  parseProcessTable,
  resumeSessionIdFromCommand
} from './stale-resume-holders'

const ID = '01a171e3-754e-7b82-855e-084e79561724'

describe('resumeSessionIdFromCommand', () => {
  it('reads codex and claude resume ids', () => {
    expect(resumeSessionIdFromCommand(`codex --flag resume ${ID}`)).toBe(ID)
    expect(resumeSessionIdFromCommand(`claude --resume ${ID.toUpperCase()}`)).toBe(ID)
    expect(resumeSessionIdFromCommand(`claude --resume=${ID}`)).toBe(ID)
  })

  it('ignores commands that do not resume a conversation', () => {
    expect(resumeSessionIdFromCommand('codex --no-daemon')).toBeNull()
    expect(resumeSessionIdFromCommand(undefined)).toBeNull()
  })
})

describe('findStaleResumeHolders', () => {
  const table = parseProcessTable(
    [
      ` 10     1 orca-terminal-host`,
      ` 11    10 login zsh`,
      ` 12    11 node codex resume ${ID}`,
      ` 13    12 codex-bin resume ${ID}`,
      ` 20     1 node codex resume ${ID}`,
      ` 14    11 node codex resume 01a171d1-a5e7-7422-a250-972e462d1d04`
    ].join('\n')
  )

  it('returns only the daemon descendants holding that conversation', () => {
    expect(findStaleResumeHolders(table, 10, ID)).toEqual([12, 13])
  })

  it('never selects processes outside the daemon tree', () => {
    expect(findStaleResumeHolders(table, 99, ID)).toEqual([])
  })
})
