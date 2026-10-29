import type { Tab } from '../../../shared/tab-types'
import {
  planWorkspaceContainerMetadataSync,
  planWorkspaceContainerTabSync
} from './workspace-container-tab-sync-plan'
import {
  conversationsByTerminalTab,
  planDefaultConversation
} from './workspace-container-default-conversation'
import { useAppStore } from '.'

function collectTabIds(tabsByWorktree: Readonly<Record<string, Tab[]>>): Map<string, Set<string>> {
  return new Map(
    Object.entries(tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      new Set(tabs.map((tab) => tab.id))
    ])
  )
}

function installWorkspaceContainerMetadataSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    timer = null
    const state = useAppStore.getState()
    const api = window.api?.workspaceContainers
    if (!api || !state.workspaceContainersLoaded) {
      return
    }
    const labels = new Map<string, string>()
    for (const worktrees of Object.values(state.worktreesByRepo ?? {})) {
      for (const worktree of worktrees) {
        labels.set(
          worktree.id,
          worktree.displayName ||
            worktree.branch.replace(/^refs\/heads\//, '') ||
            worktree.path.split('/').pop() ||
            worktree.id
        )
      }
    }
    for (const update of planWorkspaceContainerMetadataSync(
      state.workspaceContainers,
      state.unifiedTabsByWorktree,
      labels
    )) {
      void api.update(update.containerId, {
        terminalTabIds: update.terminalTabIds,
        worktreeLabel: update.worktreeLabel
      })
    }
    const conversations = conversationsByTerminalTab(
      state.agentStatusByPaneKey,
      state.sleepingAgentSessionsByPaneKey
    )
    for (const container of state.workspaceContainers) {
      const owned = new Set(container.tabIds)
      const terminalTabIds = (state.unifiedTabsByWorktree[container.worktreeId] ?? [])
        .filter((tab) => tab.contentType === 'terminal' && owned.has(tab.id))
        .map((tab) => tab.entityId)
      const next = planDefaultConversation(container, terminalTabIds, conversations)
      if (next) {
        void api.update(container.id, { defaultConversation: next })
      }
    }
  }
  const unsubscribe = useAppStore.subscribe(() => {
    // Why: store updates are frequent; one trailing pass per burst is enough for routing metadata.
    timer ??= setTimeout(flush, 300)
  })
  return () => {
    unsubscribe()
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export function installWorkspaceContainerTabSync(): () => void {
  const stopMetadataSync = installWorkspaceContainerMetadataSync()
  let previousTabsRecord = useAppStore.getState().unifiedTabsByWorktree
  let previousIds = collectTabIds(previousTabsRecord)

  const stopTabSync = useAppStore.subscribe((state) => {
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
  return () => {
    stopTabSync()
    stopMetadataSync()
  }
}
