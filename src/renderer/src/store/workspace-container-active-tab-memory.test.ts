import { describe, expect, it } from 'vitest'
import { resolveRememberedTab, tabIdsOfSpace } from './workspace-container-active-tab-memory'
import type { Tab } from '../../../shared/tab-types'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'

const container = (id: string, tabIds: string[]): WorkspaceContainer => ({
  id,
  worktreeId: 'wt',
  name: id,
  parentContainerId: null,
  tabIds,
  focus: '',
  connections: [],
  position: { x: 0, y: 0 },
  createdAt: 0,
  updatedAt: 0
})
const tab = (id: string): Tab => ({
  id,
  entityId: id,
  groupId: 'g',
  worktreeId: 'wt',
  contentType: 'terminal',
  label: id,
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
})

describe('container active tab memory', () => {
  it('scopes a container to its tabs and the bare worktree to unclaimed ones', () => {
    const containers = [container('a', ['t1']), container('b', ['t2'])]
    const tabs = [tab('t1'), tab('t2'), tab('t3')]
    expect([...tabIdsOfSpace(containers, tabs, 'a')]).toEqual(['t1'])
    expect([...tabIdsOfSpace(containers, tabs, null)]).toEqual(['t3'])
  })

  it('restores only a remembered tab that is still open and still in the space', () => {
    const space = new Set(['t1', 't2'])
    expect(resolveRememberedTab('t2', space, new Set(['t1', 't2']))).toBe('t2')
    expect(resolveRememberedTab('t2', space, new Set(['t1']))).toBeNull()
    expect(resolveRememberedTab('t9', space, new Set(['t9']))).toBeNull()
    expect(resolveRememberedTab(undefined, space, new Set(['t1']))).toBeNull()
  })
})
