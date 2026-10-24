import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../shared/tab-types'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { findContainerForTerminal } from './workspace-container-spawn-env'

const terminalTab = { id: 'u1', entityId: 'term-1', contentType: 'terminal' } as Tab

function container(id: string, tabIds: string[]): WorkspaceContainer {
  return {
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
  }
}

describe('findContainerForTerminal', () => {
  it('finds the container that owns the terminal tab', () => {
    const owner = container('a', ['u1'])
    const found = findContainerForTerminal(
      {
        unifiedTabsByWorktree: { wt: [terminalTab] },
        workspaceContainers: [container('b', []), owner],
        activeContainerIdByWorktree: { wt: 'b' }
      },
      'wt',
      'term-1'
    )
    expect(found).toBe(owner)
  })

  it('falls back to the active container for a not-yet-assigned tab', () => {
    const active = container('b', [])
    const found = findContainerForTerminal(
      {
        unifiedTabsByWorktree: { wt: [terminalTab] },
        workspaceContainers: [active],
        activeContainerIdByWorktree: { wt: 'b' }
      },
      'wt',
      'term-1'
    )
    expect(found).toBe(active)
  })

  it('returns null with no owner and no active container', () => {
    expect(
      findContainerForTerminal(
        {
          unifiedTabsByWorktree: { wt: [terminalTab] },
          workspaceContainers: [container('a', [])],
          activeContainerIdByWorktree: { wt: null }
        },
        'wt',
        'term-1'
      )
    ).toBeNull()
  })

  it('returns null for an unknown terminal', () => {
    expect(
      findContainerForTerminal(
        {
          unifiedTabsByWorktree: { wt: [] },
          workspaceContainers: [container('a', ['u1'])],
          activeContainerIdByWorktree: {}
        },
        'wt',
        'term-1'
      )
    ).toBeNull()
  })
})
