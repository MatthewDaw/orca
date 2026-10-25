import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { Tab } from '../../../../shared/tab-types'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

const NO_CONTAINERS: readonly WorkspaceContainer[] = []
const NO_TABS: readonly Tab[] = []

// The tabs a worktree's strip may show. A selected container shows its own tabs; with none
// selected, the worktree is itself a space and shows the tabs that no container has claimed.
// Null means the worktree has no containers, so the strip shows every tab as it always did.
export function useContainerTabFilter(worktreeId: string): ReadonlySet<string> | null {
  const containers = useAppStore((s) => s.workspaceContainers ?? NO_CONTAINERS)
  const activeContainerId = useAppStore((s) => s.activeContainerIdByWorktree?.[worktreeId] ?? null)
  const tabs = useAppStore((s) => s.unifiedTabsByWorktree?.[worktreeId] ?? NO_TABS)
  return useMemo(() => {
    const ofWorktree = containers.filter((c) => c.worktreeId === worktreeId)
    if (ofWorktree.length === 0) {
      return null
    }
    const active = ofWorktree.find((c) => c.id === activeContainerId)
    if (active) {
      return new Set(active.tabIds)
    }
    const claimed = new Set(ofWorktree.flatMap((c) => c.tabIds))
    return new Set(tabs.filter((tab) => !claimed.has(tab.id)).map((tab) => tab.id))
  }, [containers, activeContainerId, tabs, worktreeId])
}
