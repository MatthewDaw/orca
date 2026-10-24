import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

const NO_CONTAINERS: readonly WorkspaceContainer[] = []

// Null means no container is selected, so the strip shows every tab as it always did.
export function useContainerTabFilter(worktreeId: string): ReadonlySet<string> | null {
  const containers = useAppStore((s) => s.workspaceContainers ?? NO_CONTAINERS)
  const activeContainerId = useAppStore((s) => s.activeContainerIdByWorktree?.[worktreeId] ?? null)
  return useMemo(() => {
    const active = activeContainerId
      ? containers.find((c) => c.id === activeContainerId)
      : undefined
    return active ? new Set(active.tabIds) : null
  }, [containers, activeContainerId])
}
