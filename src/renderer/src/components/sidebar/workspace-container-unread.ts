import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

// A finished agent leaves an unread marker keyed by its pane (`<tabId>:<leaf>`) until someone
// looks at it, so a container's bell is derived from its tabs' markers and clears by itself.
export function containerHasUnreadCompletion(
  container: WorkspaceContainer,
  unreadPaneKeys: readonly string[]
): boolean {
  const tabIds = new Set([...container.tabIds, ...(container.terminalTabIds ?? [])])
  return unreadPaneKeys.some((key) => tabIds.has(key) || tabIds.has(key.split(':')[0] ?? ''))
}

export function containerOfPane(
  containers: readonly WorkspaceContainer[],
  paneKey: string
): WorkspaceContainer | undefined {
  const tabId = paneKey.split(':')[0] ?? ''
  return containers.find(
    (c) => c.tabIds.includes(tabId) || (c.terminalTabIds ?? []).includes(tabId)
  )
}
