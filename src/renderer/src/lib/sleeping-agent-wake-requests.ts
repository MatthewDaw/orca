import { useAppStore } from '@/store'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { parseLegacyNumericPaneKey, parsePaneKey } from '../../../shared/stable-pane-id'

// Why the pane rather than the record object: a live record is rewritten
// whenever its agent's status moves, and an object-keyed ask was lost in the gap between a startup
// mount request and the pane connecting, leaving idle agents unresumed. A cleared record still
// drops its ask (nothing takes it), and taking it consumes it.
const requestedWakeKeys = new Set<string>()

const wakeKey = (record: SleepingAgentSessionRecord): string => record.paneKey

export function getSleepingRecordTabId(record: SleepingAgentSessionRecord): string | null {
  return (
    record.tabId ??
    parsePaneKey(record.paneKey)?.tabId ??
    parseLegacyNumericPaneKey(record.paneKey)?.tabId ??
    null
  )
}

/** Asks the named tabs' sleeping agents to start when their panes mount hidden. */
export function requestSleepingAgentWakeOnMount(
  worktreeId: string,
  tabIds: readonly string[]
): void {
  const wanted = new Set(tabIds)
  for (const record of Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey)) {
    const tabId = getSleepingRecordTabId(record)
    if (record.worktreeId === worktreeId && tabId !== null && wanted.has(tabId)) {
      requestedWakeKeys.add(wakeKey(record))
    }
  }
}

export function takeSleepingAgentWakeRequest(record: SleepingAgentSessionRecord): boolean {
  return requestedWakeKeys.delete(wakeKey(record))
}
