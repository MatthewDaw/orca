import { describe, expect, it } from 'vitest'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import { canRetargetContainer } from './workspace-container-drag'

const box = (
  id: string,
  tabIds: string[],
  parentContainerId: string | null
): WorkspaceContainer => ({
  id,
  worktreeId: 'wt-a',
  name: id,
  parentContainerId,
  tabIds,
  focus: '',
  connections: [],
  position: { x: 0, y: 0 },
  createdAt: 0,
  updatedAt: 0
})

describe('canRetargetContainer', () => {
  it('always allows staying on the same worktree', () => {
    expect(canRetargetContainer([box('a', ['t1'], null)], 'a', 'wt-a')).toBe(true)
  })

  it('refuses another worktree while the container or anything nested in it owns tabs', () => {
    const containers = [box('a', [], null), box('b', ['t1'], 'a')]
    expect(canRetargetContainer(containers, 'a', 'wt-b')).toBe(false)
  })

  it('allows another worktree for a subtree with no tabs', () => {
    const containers = [box('a', [], null), box('b', [], 'a'), box('c', ['t1'], null)]
    expect(canRetargetContainer(containers, 'a', 'wt-b')).toBe(true)
  })
})
