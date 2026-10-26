import { describe, expect, it } from 'vitest'
import { containerHasUnreadCompletion, containerOfPane } from './workspace-container-unread'
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
