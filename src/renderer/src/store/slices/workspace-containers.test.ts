import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import { createTestStore } from './store-test-helpers'

const dispatchWorkspaceTabCommand = vi.fn()
vi.mock('@/lib/workspace-tab-commands', () => ({ dispatchWorkspaceTabCommand }))

const remove = vi.fn(async () => ({ version: 1, containers: [] }))

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

function seedStore() {
  const store = createTestStore()
  store.setState({
    workspaceContainers: [container('a', ['t1', 't2']), container('b', ['t3'])],
    unifiedTabsByWorktree: {
      wt: ['t1', 't2', 't3'].map((id) => ({ id, contentType: 'terminal', entityId: `e-${id}` }))
    } as never
  })
  return store
}

describe('removeWorkspaceContainer', () => {
  beforeEach(() => {
    dispatchWorkspaceTabCommand.mockClear()
    remove.mockClear()
    vi.stubGlobal('window', {
      api: { workspaceContainers: { remove } },
      confirm: vi.fn(() => true)
    })
  })

  it('closes only the deleted container tabs, then removes it', async () => {
    await seedStore().getState().removeWorkspaceContainer('a')
    expect(dispatchWorkspaceTabCommand.mock.calls.map(([c]) => c.target.tabId)).toEqual([
      't1',
      't2'
    ])
    expect(remove).toHaveBeenCalledWith('a')
  })

  it('leaves everything alone when the user declines the confirmation', async () => {
    vi.stubGlobal('window', {
      api: { workspaceContainers: { remove } },
      confirm: vi.fn(() => false)
    })
    await seedStore().getState().removeWorkspaceContainer('a')
    expect(dispatchWorkspaceTabCommand).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('skips the confirmation for a container with no open tabs', async () => {
    const store = seedStore()
    store.setState({ workspaceContainers: [container('empty', [])] })
    await store.getState().removeWorkspaceContainer('empty')
    expect(remove).toHaveBeenCalledWith('empty')
    expect(dispatchWorkspaceTabCommand).not.toHaveBeenCalled()
  })
})
