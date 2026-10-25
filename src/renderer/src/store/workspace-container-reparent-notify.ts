import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import {
  describeContainerPath,
  inheritedBriefs,
  inheritedCodeScopes
} from '../../../shared/workspace-container-routing'
import { sendRuntimePtyInputVerified } from '@/runtime/runtime-terminal-verified-input'
import { useAppStore } from '.'

function ancestorIds(
  containers: readonly WorkspaceContainer[],
  container: WorkspaceContainer
): string[] {
  const byId = new Map(containers.map((c) => [c.id, c]))
  const ids: string[] = []
  const seen = new Set([container.id])
  for (
    let cursor = container.parentContainerId ? byId.get(container.parentContainerId) : undefined;
    cursor && !seen.has(cursor.id);
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  ) {
    seen.add(cursor.id)
    ids.push(cursor.id)
  }
  return ids
}

// A container whose parents changed should re-read its context — but only when some parent now
// shares a brief or scope with it, so unrelated moves never interrupt an agent.
export function planReparentNotices(
  previous: readonly WorkspaceContainer[],
  next: readonly WorkspaceContainer[]
): WorkspaceContainer[] {
  const before = new Map(previous.map((c) => [c.id, ancestorIds(previous, c).join('>')]))
  const catalog = { version: 1 as const, containers: [...next] }
  return next.filter((container) => {
    const was = before.get(container.id)
    if (was === undefined || was === ancestorIds(next, container).join('>')) {
      return false
    }
    return (
      inheritedBriefs(catalog, container).some((b) => b.container.id !== container.id) ||
      inheritedCodeScopes(catalog, container).some((s) => s.container.id !== container.id)
    )
  })
}

async function notifyContainerAgent(container: WorkspaceContainer): Promise<void> {
  const state = useAppStore.getState()
  const owned = new Set(container.tabIds)
  const terminalTabIds = (state.unifiedTabsByWorktree[container.worktreeId] ?? [])
    .filter((tab) => tab.contentType === 'terminal' && owned.has(tab.id))
    .map((tab) => tab.entityId)
  const agentTab = (state.tabsByWorktree[container.worktreeId] ?? []).find(
    (tab) => terminalTabIds.includes(tab.id) && tab.launchAgent
  )
  const ptyId = agentTab ? state.ptyIdsByTabId[agentTab.id]?.[0] : undefined
  if (!ptyId) {
    return
  }
  const catalog = { version: 1 as const, containers: state.workspaceContainers }
  const message =
    `Your Orca container "${describeContainerPath(catalog, container)}" was moved under a new parent. ` +
    'Re-read your context with `orca container context` and follow the updated scope and briefing.'
  if (await sendRuntimePtyInputVerified(ptyId, message, 'driving')) {
    setTimeout(() => void sendRuntimePtyInputVerified(ptyId, '\r', 'driving'), 250)
  }
}

export function installWorkspaceContainerReparentNotify(): () => void {
  let previous = useAppStore.getState().workspaceContainers
  return useAppStore.subscribe((state) => {
    if (state.workspaceContainers === previous) {
      return
    }
    const before = previous
    previous = state.workspaceContainers
    if (!state.workspaceContainersLoaded || before.length === 0) {
      return
    }
    for (const container of planReparentNotices(before, state.workspaceContainers)) {
      void notifyContainerAgent(container)
    }
  })
}
