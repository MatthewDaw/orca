import {
  isProvenProcessExit,
  UNVERIFIED_PROCESS_EXIT_CODE
} from '../../../../shared/terminal-exit-cause'

// Why a burst: node-pty reports 0 for a signalled death, so one `pkill -u $USER` looks like a
// clean exit of every session. Nobody closes this many terminals within seconds by hand.
const BURST_WINDOW_MS = 2000
const BURST_THRESHOLD = 4
const SETTLE_MS = 4000

type MassExitGuardDeps = {
  now: () => number
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  onBurstSettled: (tabIds: ReadonlySet<string>) => void
}

export type PtyMassExitGuard = {
  /** The code to deliver: the sentinel while a burst is under way, so no tab is closed for it. */
  observe: (exit: { code: number; tabId: string | null }) => number
}

export function createPtyMassExitGuard(deps: MassExitGuardDeps): PtyMassExitGuard {
  let recent: number[] = []
  let burstTabIds: Set<string> | null = null
  let settleTimer: unknown = null

  const armSettle = (): void => {
    if (settleTimer !== null) {
      deps.clearTimer(settleTimer)
    }
    settleTimer = deps.setTimer(() => {
      const tabIds = burstTabIds
      settleTimer = null
      burstTabIds = null
      recent = []
      if (tabIds && tabIds.size > 0) {
        deps.onBurstSettled(tabIds)
      }
    }, SETTLE_MS)
  }

  return {
    observe: ({ code, tabId }) => {
      if (!isProvenProcessExit(code)) {
        return code
      }
      const now = deps.now()
      recent = recent.filter((at) => now - at < BURST_WINDOW_MS)
      recent.push(now)
      if (!burstTabIds && recent.length < BURST_THRESHOLD) {
        return code
      }
      burstTabIds ??= new Set()
      if (tabId) {
        burstTabIds.add(tabId)
      }
      armSettle()
      return UNVERIFIED_PROCESS_EXIT_CODE
    }
  }
}
