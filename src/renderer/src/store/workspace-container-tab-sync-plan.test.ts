import { describe, expect, it } from 'vitest'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { planWorkspaceContainerTabSync } from './workspace-container-tab-sync-plan'

function container(id: string, worktreeId: string, tabIds: string[] = []): WorkspaceContainer {
  return {
    id,
    worktreeId,
    name: id,
    parentContainerId: null,
    tabIds,
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    createdAt: 0,
    updatedAt: 0
  }
}

const ids = (...values: string[]): Set<string> => new Set(values)

describe('planWorkspaceContainerTabSync', () => {
  it('assigns a new tab to the worktree active container', () => {
    const plan = planWorkspaceContainerTabSync(
      new Map([['wt', ids('t1')]]),
      new Map([['wt', ids('t1', 't2')]]),
      [container('a', 'wt')],
      { wt: 'a' }
    )
    expect(plan.assignments).toEqual(new Map([['a', ['t2']]]))
  })

  it('leaves new tabs unassigned when no container is active', () => {
    const plan = planWorkspaceContainerTabSync(
      new Map([['wt', ids('t1')]]),
      new Map([['wt', ids('t1', 't2')]]),
      [container('a', 'wt')],
      { wt: null }
    )
    expect(plan.assignments.size).toBe(0)
  })

  it('does not treat the first sighting of a worktree as new tabs', () => {
    const plan = planWorkspaceContainerTabSync(
      new Map(),
      new Map([['wt', ids('t1')]]),
      [container('a', 'wt')],
      { wt: 'a' }
    )
    expect(plan.assignments.size).toBe(0)
  })

  it('keeps a tab that already belongs to another container', () => {
    const plan = planWorkspaceContainerTabSync(
      new Map([['wt', ids('t1')]]),
      new Map([['wt', ids('t1', 't2')]]),
      [container('a', 'wt'), container('b', 'wt', ['t2'])],
      { wt: 'a' }
    )
    expect(plan.assignments.size).toBe(0)
  })

  it('releases only assigned tabs that disappeared', () => {
    const plan = planWorkspaceContainerTabSync(
      new Map([['wt', ids('t1', 't2')]]),
      new Map([['wt', ids('t2')]]),
      [container('a', 'wt', ['t1', 't2'])],
      { wt: 'a' }
    )
    expect(plan.releasedTabIds).toEqual(['t1'])
  })
})
