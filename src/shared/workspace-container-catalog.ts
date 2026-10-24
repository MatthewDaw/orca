import type {
  WorkspaceContainer,
  WorkspaceContainerCatalog,
  WorkspaceContainerCreateInput,
  WorkspaceContainerPatch
} from './workspace-container-types'

export function createContainer(
  catalog: WorkspaceContainerCatalog,
  input: WorkspaceContainerCreateInput,
  id: string,
  now: number
): WorkspaceContainerCatalog {
  const parentId = input.parentContainerId ?? null
  const parent = parentId ? catalog.containers.find((c) => c.id === parentId) : undefined
  if (parentId && parent?.worktreeId !== input.worktreeId) {
    throw new Error('Parent container must belong to the same worktree')
  }
  const container: WorkspaceContainer = {
    id,
    worktreeId: input.worktreeId,
    name: input.name,
    parentContainerId: parentId,
    tabIds: [],
    focus: '',
    connections: [],
    position: input.position ?? { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now
  }
  return { ...catalog, containers: [...catalog.containers, container] }
}

export function updateContainer(
  catalog: WorkspaceContainerCatalog,
  id: string,
  patch: WorkspaceContainerPatch,
  now: number
): WorkspaceContainerCatalog {
  const target = catalog.containers.find((c) => c.id === id)
  if (!target) {
    return catalog
  }
  if (patch.parentContainerId !== undefined && patch.parentContainerId !== null) {
    assertValidParent(catalog, target, patch.parentContainerId)
  }
  const claimed = new Set(patch.tabIds ?? [])
  const containers = catalog.containers.map((c) => {
    if (c.id === id) {
      return {
        ...c,
        ...patch,
        tabIds: patch.tabIds ? [...new Set(patch.tabIds)] : c.tabIds,
        updatedAt: now
      }
    }
    // A tab belongs to exactly one container, so claiming it elsewhere releases it here.
    if (claimed.size > 0 && c.tabIds.some((t) => claimed.has(t))) {
      return { ...c, tabIds: c.tabIds.filter((t) => !claimed.has(t)), updatedAt: now }
    }
    return c
  })
  return { ...catalog, containers }
}

export function assignTabsToContainer(
  catalog: WorkspaceContainerCatalog,
  id: string,
  tabIds: readonly string[],
  now: number
): WorkspaceContainerCatalog {
  const target = catalog.containers.find((c) => c.id === id)
  if (!target) {
    return catalog
  }
  return updateContainer(catalog, id, { tabIds: [...target.tabIds, ...tabIds] }, now)
}

export function removeContainer(
  catalog: WorkspaceContainerCatalog,
  id: string
): WorkspaceContainerCatalog {
  const target = catalog.containers.find((c) => c.id === id)
  if (!target) {
    return catalog
  }
  // Children re-parent to the removed container's parent so nesting never dangles.
  const containers = catalog.containers
    .filter((c) => c.id !== id)
    .map((c) => ({
      ...c,
      parentContainerId:
        c.parentContainerId === id ? target.parentContainerId : c.parentContainerId,
      connections: c.connections.filter((conn) => conn.targetContainerId !== id)
    }))
  return { ...catalog, containers }
}

export function removeTabFromContainers(
  catalog: WorkspaceContainerCatalog,
  tabId: string
): WorkspaceContainerCatalog {
  if (!catalog.containers.some((c) => c.tabIds.includes(tabId))) {
    return catalog
  }
  return {
    ...catalog,
    containers: catalog.containers.map((c) =>
      c.tabIds.includes(tabId) ? { ...c, tabIds: c.tabIds.filter((t) => t !== tabId) } : c
    )
  }
}

export function removeWorktreeContainers(
  catalog: WorkspaceContainerCatalog,
  worktreeId: string
): WorkspaceContainerCatalog {
  const gone = new Set(
    catalog.containers.filter((c) => c.worktreeId === worktreeId).map((c) => c.id)
  )
  if (gone.size === 0) {
    return catalog
  }
  return {
    ...catalog,
    containers: catalog.containers
      .filter((c) => !gone.has(c.id))
      .map((c) => ({
        ...c,
        connections: c.connections.filter((conn) => !gone.has(conn.targetContainerId))
      }))
  }
}

function assertValidParent(
  catalog: WorkspaceContainerCatalog,
  target: WorkspaceContainer,
  parentId: string
): void {
  const parent = catalog.containers.find((c) => c.id === parentId)
  if (!parent || parent.worktreeId !== target.worktreeId) {
    throw new Error('Parent container must belong to the same worktree')
  }
  for (let cursor: WorkspaceContainer | undefined = parent; cursor;) {
    if (cursor.id === target.id) {
      throw new Error('A container cannot be nested inside itself')
    }
    const next: string | null = cursor.parentContainerId
    cursor = next ? catalog.containers.find((c) => c.id === next) : undefined
  }
}

export function renderContainerContextPage(
  container: WorkspaceContainer,
  catalog: WorkspaceContainerCatalog
): string {
  const byId = new Map(catalog.containers.map((c) => [c.id, c]))
  const parent = container.parentContainerId ? byId.get(container.parentContainerId) : undefined
  const lines = [`# ${container.name}`, '']
  if (parent) {
    lines.push(`Nested inside: ${parent.name}`, '')
  }
  lines.push('## Main focus', '', container.focus.trim() || '_Not set._', '')
  lines.push('## Connections', '')
  if (container.connections.length === 0) {
    lines.push('_No connections._')
  }
  for (const connection of container.connections) {
    const target = byId.get(connection.targetContainerId)
    if (target) {
      lines.push(`- **${target.name}**: ${connection.description.trim() || '_No details._'}`)
    }
  }
  return `${lines.join('\n')}\n`
}
