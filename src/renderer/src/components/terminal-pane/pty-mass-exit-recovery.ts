import { useAppStore } from '@/store'
import { createPtyMassExitGuard } from './pty-mass-exit-guard'

const guard = createPtyMassExitGuard({
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  onBurstSettled: (tabIds) => {
    // Why dynamic: the resume module reads the store, which would otherwise import back into the dispatcher.
    void import('@/store/workspace-agent-auto-resume').then(({ resumeInterruptedTabs }) =>
      resumeInterruptedTabs(tabIds)
    )
  }
})

/**
 * The code to deliver for an exit that main did not orchestrate. A restart, sleep or Orca-issued
 * close is already classified elsewhere and passes through untouched.
 */
export function classifyUnorchestratedPtyExit(exit: {
  ptyId: string
  code: number
  orchestrated: boolean
}): number {
  const state = useAppStore.getState()
  if (exit.orchestrated || state.isPtyShutdownPending(exit.ptyId)) {
    return exit.code
  }
  if (state.suppressedPtyExitIds[exit.ptyId]) {
    return exit.code
  }
  const tabId =
    Object.entries(state.ptyIdsByTabId).find(([, ptyIds]) => ptyIds.includes(exit.ptyId))?.[0] ??
    null
  return guard.observe({ code: exit.code, tabId })
}
