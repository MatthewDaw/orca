import { describe, expect, it } from 'vitest'
import {
  assignTabsToContainer,
  createContainer,
  removeContainer,
  removeTabFromContainers,
  removeWorktreeContainers,
  renderContainerContextPage,
  updateContainer
} from './workspace-container-catalog'
import {
  EMPTY_WORKSPACE_CONTAINER_CATALOG,
  type WorkspaceContainerCatalog
} from './workspace-container-types'

function seed(): WorkspaceContainerCatalog {
  let catalog = createContainer(
    EMPTY_WORKSPACE_CONTAINER_CATALOG,
    { worktreeId: 'wt-1', name: 'API' },
    'a',
    1
  )
  catalog = createContainer(
    catalog,
    { worktreeId: 'wt-1', name: 'Tests', parentContainerId: 'a' },
    'b',
    2
  )
  return createContainer(catalog, { worktreeId: 'wt-2', name: 'Web' }, 'c', 3)
}

describe('workspace container catalog', () => {
  it('allows several containers on one worktree', () => {
    expect(seed().containers.filter((c) => c.worktreeId === 'wt-1')).toHaveLength(2)
  })

  it('rejects a parent from another worktree', () => {
    expect(() =>
      createContainer(seed(), { worktreeId: 'wt-1', name: 'x', parentContainerId: 'c' }, 'd', 4)
    ).toThrow(/same worktree/)
  })

  it('moves a tab out of its previous container when another claims it', () => {
    let catalog = updateContainer(seed(), 'a', { tabIds: ['t1', 't2'] }, 5)
    catalog = updateContainer(catalog, 'b', { tabIds: ['t2'] }, 6)
    const byId = Object.fromEntries(catalog.containers.map((c) => [c.id, c.tabIds]))
    expect(byId.a).toEqual(['t1'])
    expect(byId.b).toEqual(['t2'])
  })

  it('appends tabs without dropping existing ones and steals from other containers', () => {
    let catalog = assignTabsToContainer(seed(), 'a', ['t1'], 5)
    catalog = assignTabsToContainer(catalog, 'a', ['t2'], 6)
    catalog = assignTabsToContainer(catalog, 'b', ['t2'], 7)
    const byId = Object.fromEntries(catalog.containers.map((c) => [c.id, c.tabIds]))
    expect(byId.a).toEqual(['t1'])
    expect(byId.b).toEqual(['t2'])
  })

  it('dedupes tab ids within one container', () => {
    const catalog = updateContainer(seed(), 'a', { tabIds: ['t1', 't1'] }, 5)
    expect(catalog.containers.find((c) => c.id === 'a')!.tabIds).toEqual(['t1'])
  })

  it('rejects nesting a container inside its own descendant', () => {
    expect(() => updateContainer(seed(), 'a', { parentContainerId: 'b' }, 5)).toThrow(/itself/)
  })

  it('re-parents children and drops inbound connections on removal', () => {
    let catalog = updateContainer(
      seed(),
      'b',
      { connections: [{ targetContainerId: 'a', description: 'asks' }] },
      5
    )
    catalog = removeContainer(catalog, 'a')
    const b = catalog.containers.find((c) => c.id === 'b')!
    expect(b.parentContainerId).toBeNull()
    expect(b.connections).toEqual([])
  })

  it('releases a closed tab from whichever container holds it', () => {
    const catalog = removeTabFromContainers(
      updateContainer(seed(), 'a', { tabIds: ['t1'] }, 5),
      't1'
    )
    expect(catalog.containers.find((c) => c.id === 'a')!.tabIds).toEqual([])
  })

  it('removes every container of a deleted worktree', () => {
    const catalog = removeWorktreeContainers(seed(), 'wt-1')
    expect(catalog.containers.map((c) => c.id)).toEqual(['c'])
  })

  it('renders focus and connections for agents', () => {
    const catalog = updateContainer(
      seed(),
      'a',
      {
        focus: 'Own the REST API',
        connections: [{ targetContainerId: 'b', description: 'Ask for test runs' }]
      },
      5
    )
    const page = renderContainerContextPage(catalog.containers[0]!, catalog)
    expect(page).toContain('## Main focus')
    expect(page).toContain('Own the REST API')
    expect(page).toContain('- **Tests**: Ask for test runs')
  })
})
