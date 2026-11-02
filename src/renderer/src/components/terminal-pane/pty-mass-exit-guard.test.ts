import { describe, expect, it, vi } from 'vitest'
import { UNVERIFIED_PROCESS_EXIT_CODE } from '../../../../shared/terminal-exit-cause'
import { createPtyMassExitGuard } from './pty-mass-exit-guard'

function setup() {
  let now = 0
  let pending: (() => void) | null = null
  const onBurstSettled = vi.fn()
  const guard = createPtyMassExitGuard({
    now: () => now,
    setTimer: (callback) => {
      pending = callback
      return 1
    },
    clearTimer: () => {
      pending = null
    },
    onBurstSettled
  })
  return {
    guard,
    onBurstSettled,
    advance: (ms: number) => (now += ms),
    settle: () => pending?.()
  }
}

describe('createPtyMassExitGuard', () => {
  it('leaves isolated exits alone', () => {
    const { guard, advance } = setup()
    for (let i = 0; i < 10; i++) {
      expect(guard.observe({ code: 0, tabId: `t${i}` })).toBe(0)
      advance(5000)
    }
  })

  it('keeps tabs once a burst starts and reports them after it settles', () => {
    const { guard, onBurstSettled, settle } = setup()
    const codes = Array.from({ length: 8 }, (_, i) => guard.observe({ code: 0, tabId: `t${i}` }))
    expect(codes.slice(0, 3)).toEqual([0, 0, 0])
    expect(codes.slice(3)).toEqual(Array(5).fill(UNVERIFIED_PROCESS_EXIT_CODE))
    settle()
    expect(onBurstSettled).toHaveBeenCalledWith(new Set(['t3', 't4', 't5', 't6', 't7']))
  })

  it('does not rewrite codes that already carry no proof', () => {
    const { guard } = setup()
    expect(guard.observe({ code: UNVERIFIED_PROCESS_EXIT_CODE, tabId: 'a' })).toBe(
      UNVERIFIED_PROCESS_EXIT_CODE
    )
  })
})
