import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

export function containerSortKey(container: WorkspaceContainer): number {
  return container.sortOrder ?? container.createdAt
}

export type WorkspaceContainerNode = {
  container: WorkspaceContainer
  children: WorkspaceContainerNode[]
}

export function buildWorkspaceContainerTree(
  containers: readonly WorkspaceContainer[],
  worktreeId: string
): WorkspaceContainerNode[] {
  const ofWorktree = containers
    .filter((c) => c.worktreeId === worktreeId)
    .sort((a, b) => containerSortKey(a) - containerSortKey(b))
  const nodes = new Map(ofWorktree.map((c) => [c.id, { container: c, children: [] }]))
  const roots: WorkspaceContainerNode[] = []
  for (const node of nodes.values()) {
    const parent = node.container.parentContainerId
      ? nodes.get(node.container.parentContainerId)
      : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  return roots
}

export function nextWorkspaceContainerName(
  containers: readonly WorkspaceContainer[],
  worktreeId: string
): string {
  const count = containers.filter((c) => c.worktreeId === worktreeId).length
  return `Container ${count + 1}`
}
