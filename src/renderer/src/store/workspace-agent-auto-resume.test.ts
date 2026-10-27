import { describe, expect, it } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { planAgentAutoResume, planRemainingTabs } from './workspace-agent-auto-resume'

const record = (
  tabId: string,
  overrides: Partial<SleepingAgentSessionRecord> = {}
): SleepingAgentSessionRecord => ({
  paneKey: `${tabId}:leaf`,
  tabId,
  worktreeId: 'wt',
  agent: 'codex',
  providerSession: { key: 'session_id', id: `session-${tabId}` },
  prompt: '',
  state: 'working',
  capturedAt: 1,
  updatedAt: 1,
  origin: 'quit',
  ...overrides
})

describe('planAgentAutoResume', () => {
  it('wakes each agent once, in order', () => {
    expect(planAgentAutoResume([record('a'), record('b'), record('a')])).toMatchObject([
      { tabId: 'a' },
      { tabId: 'b' }
    ])
  })

  it('tells only agents cut off mid-task to continue', () => {
    expect(
      planAgentAutoResume([
        record('working', { state: 'working' }),
        record('idle', { origin: 'live', state: 'done' }),
        record('asking', { state: 'waiting' })
      ])
    ).toEqual([
      { worktreeId: 'wt', tabId: 'working', continueWork: true },
      { worktreeId: 'wt', tabId: 'idle', continueWork: false },
      { worktreeId: 'wt', tabId: 'asking', continueWork: false }
    ])
  })

  it('leaves agents the person put to sleep on purpose', () => {
    expect(
      planAgentAutoResume([
        record('a', { origin: 'worktree-sleep' }),
        record('b', { origin: undefined })
      ])
    ).toEqual([])
  })
})

describe('planRemainingTabs', () => {
  it('mounts every tab not already woken, except ones put to sleep on purpose', () => {
    expect(
      planRemainingTabs(
        { wt: [{ id: 'woken' }, { id: 'shell' }, { id: 'slept' }], other: [{ id: 'agent' }] },
        [record('slept', { origin: 'worktree-sleep' })],
        new Set(['woken'])
      )
    ).toEqual([
      { worktreeId: 'wt', tabIds: ['shell'] },
      { worktreeId: 'other', tabIds: ['agent'] }
    ])
  })
})
