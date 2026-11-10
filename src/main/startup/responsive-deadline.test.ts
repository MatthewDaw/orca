import { describe, expect, it, vi } from 'vitest'
import { startResponsiveDeadline } from './responsive-deadline'

function harness(ms: number) {
  let clock = 0
  let tick: (() => void) | null = null
  const onExpire = vi.fn()
  const deadline = startResponsiveDeadline({
    ms,
    onExpire,
    now: () => clock,
    setInterval: (fn) => {
      tick = fn
      return 'h'
    },
    clearInterval: () => {
      tick = null
    }
  })
  return {
    onExpire,
    deadline,
    advance: (byMs: number) => {
      clock += byMs
      tick?.()
    }
  }
}

describe('startResponsiveDeadline', () => {
  it('expires after the budget of ordinary ticks', () => {
    const h = harness(5_000)
    for (let i = 0; i < 4; i++) {
      h.advance(1_000)
    }
    expect(h.onExpire).not.toHaveBeenCalled()
    h.advance(1_000)
    expect(h.onExpire).toHaveBeenCalledOnce()
  })

  it('credits a tick held back by a hang as one interval, not the hang', () => {
    const h = harness(5_000)
    h.advance(1_000)
    h.advance(80_000)
    expect(h.onExpire).not.toHaveBeenCalled()
    h.advance(1_000)
    h.advance(1_000)
    expect(h.onExpire).toHaveBeenCalledOnce()
  })

  it('restarts the budget and stops after cancel', () => {
    const h = harness(3_000)
    h.advance(1_000)
    h.advance(1_000)
    h.deadline.restart()
    h.advance(1_000)
    h.advance(1_000)
    expect(h.onExpire).not.toHaveBeenCalled()
    h.deadline.cancel()
    h.advance(1_000)
    h.advance(1_000)
    expect(h.onExpire).not.toHaveBeenCalled()
  })
})
