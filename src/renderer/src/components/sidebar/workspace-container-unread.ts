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

export const BELL_SETTLE_MS = 3000

type PaneStatusRow = { state: string; stateStartedAt: number }

export type ContainerBell = { ringing: boolean; settleAt: number | null }

const tabOfPane = (paneKey: string): string => paneKey.split(':')[0] ?? ''

// The bell means "stopped and not yet looked at": an unread finish marker, no pane of that tab
// working now, and the agent quiet for a few seconds so a pause between turns never rings it.
// `settleAt` is when a just-stopped agent will start ringing, so the caller can re-check then.
export function containerBell(
  container: WorkspaceContainer,
  unreadPaneKeys: readonly string[],
  statusByPaneKey: Readonly<Record<string, PaneStatusRow | undefined>>,
  now: number
): ContainerBell {
  const tabIds = new Set([...container.tabIds, ...(container.terminalTabIds ?? [])])
  const unreadTabs = new Set(unreadPaneKeys.map(tabOfPane).filter((tabId) => tabIds.has(tabId)))
  let settleAt: number | null = null
  for (const tabId of unreadTabs) {
    const rows = Object.entries(statusByPaneKey).filter(([key]) => tabOfPane(key) === tabId)
    if (rows.some(([, row]) => row?.state === 'working')) {
      continue
    }
    const quietSince = Math.max(0, ...rows.map(([, row]) => row?.stateStartedAt ?? 0))
    const readyAt = quietSince + BELL_SETTLE_MS
    if (readyAt <= now) {
      return { ringing: true, settleAt: null }
    }
    settleAt = Math.min(settleAt ?? readyAt, readyAt)
  }
  return { ringing: false, settleAt }
}
