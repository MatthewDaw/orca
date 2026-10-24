import type { WorkspaceContainer } from '../../../shared/workspace-container-types'

export type WorkspaceContainerTabSyncPlan = {
  assignments: Map<string, string[]>
  releasedTabIds: string[]
}

type TabIdsByWorktree = ReadonlyMap<string, ReadonlySet<string>>

// New tabs join the worktree's active container; tabs that vanished leave whichever container held them.
// A worktree absent from `previous` is being seen for the first time (hydration), so nothing there is "new".
export function planWorkspaceContainerTabSync(
  previous: TabIdsByWorktree,
  current: TabIdsByWorktree,
  containers: readonly WorkspaceContainer[],
  activeContainerIdByWorktree: Readonly<Record<string, string | null>>
): WorkspaceContainerTabSyncPlan {
  const assignedTabIds = new Set(containers.flatMap((c) => c.tabIds))
  const containerById = new Map(containers.map((c) => [c.id, c]))
  const assignments = new Map<string, string[]>()
  const releasedTabIds: string[] = []

  for (const [worktreeId, currentIds] of current) {
    const previousIds = previous.get(worktreeId)
    if (!previousIds) {
      continue
    }
    const activeId = activeContainerIdByWorktree[worktreeId]
    const active = activeId ? containerById.get(activeId) : undefined
    for (const tabId of currentIds) {
      if (!previousIds.has(tabId) && active && !assignedTabIds.has(tabId)) {
        assignments.set(active.id, [...(assignments.get(active.id) ?? []), tabId])
      }
    }
    for (const tabId of previousIds) {
      if (!currentIds.has(tabId) && assignedTabIds.has(tabId)) {
        releasedTabIds.push(tabId)
      }
    }
  }
  return { assignments, releasedTabIds }
}
