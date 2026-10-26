import type { Tab } from '../../../shared/tab-types'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { useAppStore } from '.'

// A worktree with no container selected is itself a space; it remembers its tab under this key.
export const containerSpaceKey = (worktreeId: string, containerId: string | null): string =>
  containerId ?? `space:${worktreeId}`

// The tabs a space owns: a container's own, or for the bare worktree the ones no container claimed.
export function tabIdsOfSpace(
  containers: readonly WorkspaceContainer[],
  tabs: readonly Tab[],
  containerId: string | null
): Set<string> {
  const active = containers.find((c) => c.id === containerId)
  if (active) {
    return new Set(active.tabIds)
  }
  const claimed = new Set(containers.flatMap((c) => c.tabIds))
  return new Set(tabs.filter((tab) => !claimed.has(tab.id)).map((tab) => tab.id))
}

export function resolveRememberedTab(
  remembered: string | undefined,
  spaceTabIds: ReadonlySet<string>,
  liveTabIds: ReadonlySet<string>
): string | null {
  return remembered && spaceTabIds.has(remembered) && liveTabIds.has(remembered) ? remembered : null
}

// Why: the tab strip shows only the selected container's tabs, so reselecting one should land on
// the agent that was open when the person left it, not whichever tab the worktree last focused.
export function installContainerActiveTabMemory(): () => void {
  const lastTabBySpace = new Map<string, string>()
  let previousActive = useAppStore.getState().activeContainerIdByWorktree

  return useAppStore.subscribe((state) => {
    // Why first: activating a tab below re-enters this listener, which must already see the
    // switch as handled or it restores again, forever.
    const handledActive = previousActive
    previousActive = state.activeContainerIdByWorktree
    const containers = state.workspaceContainers
    const activeByWorktree = state.activeContainerIdByWorktree
    for (const [worktreeId, containerId] of Object.entries(activeByWorktree)) {
      const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
      const spaceTabIds = tabIdsOfSpace(
        containers.filter((c) => c.worktreeId === worktreeId),
        tabs,
        containerId
      )
      const key = containerSpaceKey(worktreeId, containerId)
      if ((handledActive[worktreeId] ?? null) !== (containerId ?? null)) {
        const target = resolveRememberedTab(
          lastTabBySpace.get(key),
          spaceTabIds,
          new Set(tabs.map((tab) => tab.id))
        )
        if (target) {
          state.activateTab(target, { worktreeId })
        }
        continue
      }
      const groupId = state.activeGroupIdByWorktree[worktreeId]
      const activeTabId = state.groupsByWorktree[worktreeId]?.find(
        (g) => g.id === groupId
      )?.activeTabId
      if (activeTabId && spaceTabIds.has(activeTabId)) {
        lastTabBySpace.set(key, activeTabId)
      }
    }
  })
}
