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

export type ContainerBell = {
  // 'finished' rings the bell, 'working' shows a solid dot, null means nothing to report.
  indicator: 'finished' | 'working' | null
  settleAt: number | null
}

const tabOfPane = (paneKey: string): string => paneKey.split(':')[0] ?? ''

// Three states: an agent is working (dot); one has stopped and nobody has looked yet (bell);
// or nothing, including a finish already seen. A bell needs an unread finish marker, no working
// pane in that tab, and a short quiet period so a pause between turns never rings it.
// `settleAt` is when a just-stopped agent will start ringing, so the caller can re-check then.
export function containerBell(
  container: WorkspaceContainer,
  unreadPaneKeys: readonly string[],
  statusByPaneKey: Readonly<Record<string, PaneStatusRow | undefined>>,
  now: number
): ContainerBell {
  const tabIds = new Set([...container.tabIds, ...(container.terminalTabIds ?? [])])
  const rowsOf = (tabId: string): [string, PaneStatusRow | undefined][] =>
    Object.entries(statusByPaneKey).filter(([key]) => tabOfPane(key) === tabId)
  const isWorking = (tabId: string): boolean =>
    rowsOf(tabId).some(([, row]) => row?.state === 'working')
  const unreadTabs = new Set(unreadPaneKeys.map(tabOfPane).filter((tabId) => tabIds.has(tabId)))
  let settleAt: number | null = null
  for (const tabId of unreadTabs) {
    const rows = rowsOf(tabId)
    if (isWorking(tabId)) {
      continue
    }
    const quietSince = Math.max(0, ...rows.map(([, row]) => row?.stateStartedAt ?? 0))
    const readyAt = quietSince + BELL_SETTLE_MS
    if (readyAt <= now) {
      return { indicator: 'finished', settleAt: null }
    }
    settleAt = Math.min(settleAt ?? readyAt, readyAt)
  }
  const working = [...tabIds].some(isWorking)
  return { indicator: working ? 'working' : null, settleAt }
}
