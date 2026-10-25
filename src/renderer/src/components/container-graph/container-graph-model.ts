import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

export const CONTAINER_NODE_SIZE = { width: 220, height: 96 }
export const CONTAINER_GROUP_HEADER_HEIGHT = 44
export const CONTAINER_GROUP_PADDING = 24

export type ContainerNodeData = {
  container: WorkspaceContainer
  worktreeName: string
  isGroup: boolean
}

type Size = { width: number; height: number }

function childrenOf(containers: readonly WorkspaceContainer[], id: string): WorkspaceContainer[] {
  return containers.filter((c) => c.parentContainerId === id)
}

// A container holding others grows to wrap them, so nesting reads as containment on the canvas.
export function measureContainer(
  containers: readonly WorkspaceContainer[],
  container: WorkspaceContainer,
  visiting: ReadonlySet<string> = new Set()
): Size {
  // A corrupt catalog can hold a parent cycle; stop at the first revisit instead of recursing forever.
  const children = visiting.has(container.id) ? [] : childrenOf(containers, container.id)
  if (children.length === 0) {
    return CONTAINER_NODE_SIZE
  }
  const path = new Set(visiting).add(container.id)
  const extent = children.reduce(
    (acc, child) => {
      const size = measureContainer(containers, child, path)
      return {
        width: Math.max(acc.width, child.position.x + size.width),
        height: Math.max(acc.height, child.position.y + size.height)
      }
    },
    { width: 0, height: 0 }
  )
  return {
    width: Math.max(CONTAINER_NODE_SIZE.width, extent.width + CONTAINER_GROUP_PADDING),
    height: Math.max(CONTAINER_NODE_SIZE.height, extent.height + CONTAINER_GROUP_PADDING)
  }
}

export function absoluteContainerPosition(
  containers: readonly WorkspaceContainer[],
  id: string
): { x: number; y: number } {
  const byId = new Map(containers.map((c) => [c.id, c]))
  let x = 0
  let y = 0
  const seen = new Set<string>()
  for (let cursor = byId.get(id); cursor && !seen.has(cursor.id);) {
    seen.add(cursor.id)
    x += cursor.position.x
    y += cursor.position.y
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  }
  return { x, y }
}

function depthOf(
  byId: ReadonlyMap<string, WorkspaceContainer>,
  container: WorkspaceContainer
): number {
  let depth = 0
  const seen = new Set<string>()
  for (
    let cursor = container.parentContainerId ? byId.get(container.parentContainerId) : undefined;
    cursor && !seen.has(cursor.id);
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  ) {
    seen.add(cursor.id)
    depth += 1
  }
  return depth
}

export function buildContainerGraph(
  containers: readonly WorkspaceContainer[],
  worktreeNames: ReadonlyMap<string, string>
): { nodes: Node<ContainerNodeData>[]; edges: Edge[] } {
  const byId = new Map(containers.map((c) => [c.id, c]))
  // Parents must precede children in the node list for React Flow to resolve parentId.
  const ordered = [...containers].sort((a, b) => depthOf(byId, a) - depthOf(byId, b))
  const nodes = ordered.map((container): Node<ContainerNodeData> => {
    const size = measureContainer(containers, container)
    const parentId =
      container.parentContainerId && byId.has(container.parentContainerId)
        ? container.parentContainerId
        : undefined
    return {
      id: container.id,
      type: 'container',
      position: container.position,
      ...(parentId ? { parentId } : {}),
      style: { width: size.width, height: size.height },
      data: {
        container,
        worktreeName: worktreeNames.get(container.worktreeId) ?? container.worktreeId,
        isGroup: childrenOf(containers, container.id).length > 0
      }
    }
  })
  const edges = containers.flatMap((container) =>
    container.connections
      .filter((connection) => byId.has(connection.targetContainerId))
      .map((connection): Edge => ({
        id: `${container.id}>${connection.targetContainerId}`,
        source: container.id,
        target: connection.targetContainerId,
        label: connection.description.trim() || undefined,
        markerEnd: { type: MarkerType.ArrowClosed }
      }))
  )
  return { nodes, edges }
}
