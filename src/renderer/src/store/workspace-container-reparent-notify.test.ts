import { describe, expect, it } from 'vitest'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { planReparentNotices } from './workspace-container-reparent-notify'

function container(id: string, parent: string | null, brief?: string): WorkspaceContainer {
  return {
    id,
    worktreeId: 'wt',
    name: id,
    parentContainerId: parent,
    tabIds: [],
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    createdAt: 0,
    updatedAt: 0,
    ...(brief ? { brief } : {})
  }
}

describe('planReparentNotices', () => {
  it('notifies a container (and its children) moved under a parent that shares context', () => {
    const before = [container('p', null, 'Use X'), container('a', null), container('b', 'a')]
    const after = [container('p', null, 'Use X'), container('a', 'p'), container('b', 'a')]
    expect(planReparentNotices(before, after).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('stays quiet when the new parent shares nothing', () => {
    const before = [container('p', null), container('a', null)]
    const after = [container('p', null), container('a', 'p')]
    expect(planReparentNotices(before, after)).toEqual([])
  })

  it('stays quiet when nothing moved or a container is brand new', () => {
    const same = [container('p', null, 'Use X'), container('a', 'p')]
    expect(planReparentNotices(same, same)).toEqual([])
    expect(planReparentNotices([container('p', null, 'Use X')], same)).toEqual([])
  })
})
