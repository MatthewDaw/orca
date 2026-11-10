const TICK_MS = 1_000
// A tick arriving later than this was held by a blocked main thread, not by the passage of
// responsive time; only the expected interval is credited.
const TICK_CREDIT_CAP_MS = TICK_MS * 2

export type ResponsiveDeadline = {
  /** Resets the responsive-time counter to zero. */
  restart: () => void
  cancel: () => void
}

// Why: a main-thread hang stops every timer, so when the thread resumes, a plain timeout fires
// immediately with the hang's whole duration counted against the deadline. Counting only the
// time the event loop was answering ticks keeps a hang from expiring budgets meant for work.
export function startResponsiveDeadline(args: {
  ms: number
  onExpire: () => void
  now?: () => number
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
}): ResponsiveDeadline {
  const now = args.now ?? Date.now
  const schedule =
    args.setInterval ?? ((fn: () => void, ms: number): unknown => setInterval(fn, ms))
  const unschedule =
    args.clearInterval ??
    // SAFETY: with the default scheduler the only handle ever passed back is Node's own interval.
    ((handle: unknown): void => clearInterval(handle as ReturnType<typeof setInterval>))
  let elapsed = 0
  let last = now()
  let handle: unknown = schedule(() => {
    const at = now()
    elapsed += Math.min(at - last, TICK_CREDIT_CAP_MS)
    last = at
    if (elapsed >= args.ms && handle !== null) {
      unschedule(handle)
      handle = null
      args.onExpire()
    }
  }, TICK_MS)
  return {
    restart: () => {
      elapsed = 0
      last = now()
    },
    cancel: () => {
      if (handle !== null) {
        unschedule(handle)
        handle = null
      }
    }
  }
}
