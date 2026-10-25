import type { Tab } from '../../../shared/tab-types'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { useAppStore } from '.'

type ContainerLookupState = {
  unifiedTabsByWorktree: Readonly<Record<string, readonly Tab[]>>
  workspaceContainers: readonly WorkspaceContainer[]
  activeContainerIdByWorktree: Readonly<Record<string, string | null>>
}

// A fresh tab may spawn before the tab sync assigns it, so an unassigned tab counts as the active container's.
export function findContainerForTerminal(
  state: ContainerLookupState,
  worktreeId: string,
  terminalTabId: string
): WorkspaceContainer | null {
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (t) => t.contentType === 'terminal' && (t.entityId === terminalTabId || t.id === terminalTabId)
  )
  if (!tab) {
    return null
  }
  const owner = state.workspaceContainers.find((c) => c.tabIds.includes(tab.id))
  if (owner) {
    return owner
  }
  const activeId = state.activeContainerIdByWorktree[worktreeId]
  return state.workspaceContainers.find((c) => c.id === activeId) ?? null
}

export async function resolveContainerSpawnEnv(
  worktreeId: string | undefined,
  terminalTabId: string | undefined
): Promise<Record<string, string>> {
  const api = window.api?.workspaceContainers
  if (!api || !worktreeId || !terminalTabId) {
    return {}
  }
  const container = findContainerForTerminal(useAppStore.getState(), worktreeId, terminalTabId)
  if (!container) {
    return {}
  }
  return {
    ORCA_CONTAINER_CONTEXT: await api.getContextPagePath(container.id),
    ORCA_CONTAINER_NAME: container.name,
    ORCA_CONTAINER_ID: container.id
  }
}
