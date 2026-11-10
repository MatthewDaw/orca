import { startResponsiveDeadline, type ResponsiveDeadline } from './responsive-deadline'

type FirstWindowStartupServices = {
  startDaemonPtyProvider: (signal: AbortSignal) => Promise<void>
  startAgentHookServer: (signal: AbortSignal) => Promise<void>
  onDaemonError: (error: unknown) => void
  onAgentHookServerError: (error: unknown) => void
  /** True keeps the PTY gate closed for another fail-open window: the daemon is alive and worth waiting for. */
  holdFailOpenWhile?: () => Promise<boolean>
  onFailOpenHeld?: (holds: number) => void
}

type StartupService = {
  ready: Promise<void>
  reportTimeout: () => void
}

type FirstWindowStartupServicesResult = {
  firstWindowReady: Promise<void>
  localPtyReady: Promise<void>
  localPtyProviderReady: Promise<void>
}

export const FIRST_WINDOW_STARTUP_SERVICE_TIMEOUT_MS = 12_000
// Why: a slow (but succeeding) daemon start must not flip terminals to the
// LocalPtyProvider fallback — local PTYs are killed on quit, so panes bound to
// them lose their daemon sessions permanently (#5232). The PTY gate therefore
// waits for the daemon attempt itself and only fail-opens at a hard cap that
// exists solely as a deadlock backstop.
export const LOCAL_PTY_STARTUP_FAIL_OPEN_TIMEOUT_MS = 60_000
// Why bounded: a daemon that answers health checks but never finishes adopting is the deadlock
// the cap exists for; a few extra windows cover a slow start without waiting forever.
export const LOCAL_PTY_STARTUP_FAIL_OPEN_MAX_HOLDS = 3

function startService(
  label: string,
  start: (signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void
): StartupService {
  const abortController = new AbortController()
  let settled = false
  let reportedTimeout = false
  const ready = Promise.resolve()
    .then(() => start(abortController.signal))
    .catch((error) => {
      if (!reportedTimeout) {
        onError(error)
      }
    })
    .finally(() => {
      settled = true
    })

  return {
    ready,
    reportTimeout: () => {
      if (settled) {
        return
      }
      reportedTimeout = true
      abortController.abort()
      onError(new Error(`${label} startup timed out`))
    }
  }
}

/**
 * Starts the services that must be ready before restored terminal panes mount.
 */
export function startFirstWindowStartupServices({
  startDaemonPtyProvider,
  startAgentHookServer,
  onDaemonError,
  onAgentHookServerError,
  holdFailOpenWhile,
  onFailOpenHeld
}: FirstWindowStartupServices): FirstWindowStartupServicesResult {
  // Why: daemon startup and hook-server binding are independent, but both gate
  // restored terminals; run them together so cold-start latency is max(), not sum().
  // The first window fails open quickly so the user sees the app; the local PTY
  // gate waits for the services themselves (a slow daemon must not flip spawns
  // to the non-restorable LocalPtyProvider fallback) and only fails open at the
  // hard cap, which also aborts the services so a late daemon swap cannot
  // strand any fallback PTYs that spawn after the gate opens.
  const daemon = startService('daemon PTY provider', startDaemonPtyProvider, onDaemonError)
  const hooks = startService('agent hook server', startAgentHookServer, onAgentHookServerError)
  const allServicesReady = Promise.all([daemon.ready, hooks.ready]).then(() => undefined)
  let windowTimeout: ReturnType<typeof setTimeout> | null = null
  let failOpenDeadline: ResponsiveDeadline | null = null
  let settled = false
  const servicesSettled = allServicesReady.finally(() => {
    settled = true
    if (windowTimeout) {
      clearTimeout(windowTimeout)
    }
    failOpenDeadline?.cancel()
  })
  const failOpenReady = new Promise<void>((resolve) => {
    let holds = 0
    const failOpen = (): void => {
      daemon.reportTimeout()
      hooks.reportTimeout()
      resolve()
    }
    // Why a responsive deadline: an 80s main-thread hang at launch used to fire this cap the
    // instant the thread recovered, aborting a daemon adoption that was one step from done and
    // re-spawning every live agent session as a duplicate on the local provider.
    const arm = (): void => {
      failOpenDeadline = startResponsiveDeadline({
        ms: LOCAL_PTY_STARTUP_FAIL_OPEN_TIMEOUT_MS,
        onExpire: () => {
          if (settled) {
            return
          }
          if (!holdFailOpenWhile || holds >= LOCAL_PTY_STARTUP_FAIL_OPEN_MAX_HOLDS) {
            failOpen()
            return
          }
          void holdFailOpenWhile()
            .catch(() => false)
            .then((hold) => {
              if (settled) {
                return
              }
              if (!hold) {
                failOpen()
                return
              }
              holds += 1
              onFailOpenHeld?.(holds)
              arm()
            })
        }
      })
    }
    arm()
  })
  const firstWindowReady = Promise.race([
    servicesSettled,
    new Promise<void>((resolve) => {
      windowTimeout = setTimeout(resolve, FIRST_WINDOW_STARTUP_SERVICE_TIMEOUT_MS)
    })
  ])
  const localPtyReady = Promise.race([servicesSettled, failOpenReady])
  // Why: destructive routing only needs daemon authority. A stalled optional
  // hook server must not hold terminal close for the full fail-open window.
  const localPtyProviderReady = Promise.race([daemon.ready, failOpenReady])

  return { firstWindowReady, localPtyReady, localPtyProviderReady }
}
