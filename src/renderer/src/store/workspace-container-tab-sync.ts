import type { Tab } from '../../../shared/tab-types'
import { planWorkspaceContainerTabSync } from './workspace-container-tab-sync-plan'
import { useAppStore } from '.'

function collectTabIds(tabsByWorktree: Readonly<Record<string, Tab[]>>): Map<string, Set<string>> {
  return new Map(
    Object.entries(tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      new Set(tabs.map((tab) => tab.id))
    ])
  )
}

export function installWorkspaceContainerTabSync(): () => void {
  let previousTabsRecord = useAppStore.getState().unifiedTabsByWorktree
  let previousIds = collectTabIds(previousTabsRecord)

  return useAppStore.subscribe((state) => {
    if (state.unifiedTabsByWorktree === previousTabsRecord) {
      return
    }
    const currentIds = collectTabIds(state.unifiedTabsByWorktree)
    const plan = planWorkspaceContainerTabSync(
      previousIds,
      currentIds,
      state.workspaceContainers,
      state.activeContainerIdByWorktree
    )
    previousTabsRecord = state.unifiedTabsByWorktree
    previousIds = currentIds

    const api = window.api?.workspaceContainers
    if (!api) {
      return
    }
    for (const [containerId, tabIds] of plan.assignments) {
      void api.assignTabs(containerId, tabIds)
    }
    for (const tabId of plan.releasedTabIds) {
      void api.releaseTab(tabId)
    }
  })
}
