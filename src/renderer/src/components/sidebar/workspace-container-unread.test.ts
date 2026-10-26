import { describe, expect, it } from 'vitest'
import {
  BELL_SETTLE_MS,
  containerBell,
  containerHasUnreadCompletion,
  containerOfPane
} from './workspace-container-unread'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

const container: WorkspaceContainer = {
  id: 'c',
  worktreeId: 'wt',
  name: 'c',
  parentContainerId: null,
  tabIds: ['u1'],
  terminalTabIds: ['t1'],
  focus: '',
  connections: [],
  position: { x: 0, y: 0 },
  createdAt: 0,
  updatedAt: 0
}

describe('containerHasUnreadCompletion', () => {
  it('rings for a finished agent in any of its tabs', () => {
    expect(containerHasUnreadCompletion(container, ['t1:leaf-a'])).toBe(true)
    expect(containerHasUnreadCompletion(container, ['u1'])).toBe(true)
  })

  it('stays quiet for other containers and when nothing is unread', () => {
    expect(containerHasUnreadCompletion(container, ['t2:leaf-a'])).toBe(false)
    expect(containerHasUnreadCompletion(container, [])).toBe(false)
  })
})

describe('containerOfPane', () => {
  it('finds the container owning the pane tab', () => {
    expect(containerOfPane([container], 't1:leaf')).toBe(container)
    expect(containerOfPane([container], 'zz:leaf')).toBeUndefined()
  })
})

describe('containerBell', () => {
  const now = 100_000
  const quiet = (state: string, startedAgo: number) => ({
    state,
    stateStartedAt: now - startedAgo
  })

  it('stays silent while the agent is working, even with a finish marker', () => {
    expect(
      containerBell(container, ['t1:a'], { 't1:a': quiet('working', 60_000) }, now).ringing
    ).toBe(false)
  })

  it('rings once the agent has been stopped for a few seconds', () => {
    const stopped = { 't1:a': quiet('done', BELL_SETTLE_MS + 1) }
    expect(containerBell(container, ['t1:a'], stopped, now).ringing).toBe(true)
  })

  it('waits out a fresh stop and says when it will ring', () => {
    const bell = containerBell(container, ['t1:a'], { 't1:a': quiet('done', 500) }, now)
    expect(bell).toEqual({ ringing: false, settleAt: now - 500 + BELL_SETTLE_MS })
  })

  it('is silent with no finish marker', () => {
    expect(containerBell(container, [], { 't1:a': quiet('done', 60_000) }, now).ringing).toBe(false)
  })
})
