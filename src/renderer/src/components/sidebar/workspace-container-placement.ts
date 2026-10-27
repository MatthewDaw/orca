import React from 'react'
import { useAppStore } from '@/store'
import { canRetargetContainer } from './workspace-container-drag'
import { containerSortKey } from './workspace-container-tree'

export type DropZone = 'before' | 'after' | 'child'

// Why: wide bands (top/bottom quarter = reorder, middle half = nest) so a drop never needs
// pixel precision, and the same zone drives the live preview before release.
export function dropZoneFor(event: React.DragEvent<HTMLElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'child'
}

// A dropped container lands beside or inside the target; a different worktree retargets it
// first, and a rejected drop (cycle) is simply ignored.
export async function placeContainer(id: string, targetId: string, zone: DropZone): Promise<void> {
  const { workspaceContainers, updateWorkspaceContainer } = useAppStore.getState()
  const dragged = workspaceContainers.find((c) => c.id === id)
  const target = workspaceContainers.find((c) => c.id === targetId)
  if (!dragged || !target || id === targetId) {
    return
  }
  try {
    if (!canRetargetContainer(workspaceContainers, id, target.worktreeId)) {
      return
    }
    if (dragged.worktreeId !== target.worktreeId) {
      await updateWorkspaceContainer(id, { worktreeId: target.worktreeId })
    }
    if (zone === 'child') {
      await updateWorkspaceContainer(id, {
        parentContainerId: target.id,
        sortOrder: Date.now()
      })
      return
    }
    const siblings = workspaceContainers
      .filter(
        (c) =>
          c.id !== id &&
          c.worktreeId === target.worktreeId &&
          c.parentContainerId === target.parentContainerId
      )
      .sort((a, b) => containerSortKey(a) - containerSortKey(b))
    const at = siblings.findIndex((c) => c.id === target.id)
    const targetKey = containerSortKey(target)
    const neighbor = siblings[zone === 'before' ? at - 1 : at + 1]
    const neighborKey = neighbor
      ? containerSortKey(neighbor)
      : targetKey + (zone === 'before' ? -1000 : 1000)
    await updateWorkspaceContainer(id, {
      parentContainerId: target.parentContainerId,
      sortOrder: (targetKey + neighborKey) / 2
    })
  } catch {
    // Invalid placement (e.g. into its own descendant): leave the tree unchanged.
  }
}

export async function moveContainerToWorktree(id: string, worktreeId: string): Promise<void> {
  const { workspaceContainers, updateWorkspaceContainer } = useAppStore.getState()
  const dragged = workspaceContainers.find((c) => c.id === id)
  if (!dragged || !canRetargetContainer(workspaceContainers, id, worktreeId)) {
    return
  }
  // Same worktree: dropping on the box un-nests; another worktree: retarget (only while it owns no sessions).
  await updateWorkspaceContainer(
    id,
    dragged.worktreeId === worktreeId ? { parentContainerId: null } : { worktreeId }
  )
}
