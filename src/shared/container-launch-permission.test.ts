import { describe, expect, it } from 'vitest'
import { composeLaunchArgs, translatePermissionArgs } from './container-launch-permission'

describe('translatePermissionArgs', () => {
  it('keeps the starter flags when the same agent starts another', () => {
    expect(translatePermissionArgs('codex', 'codex', '--ask-for-approval on-request')).toBe(
      '--ask-for-approval on-request'
    )
  })

  it('carries a bypass across agents', () => {
    expect(
      translatePermissionArgs('codex', 'claude', '--dangerously-bypass-approvals-and-sandbox')
    ).toBe('--dangerously-skip-permissions')
    expect(translatePermissionArgs('claude', 'codex', '--dangerously-skip-permissions')).toBe(
      '--dangerously-bypass-approvals-and-sandbox'
    )
  })

  it('does not widen a narrower posture across agents', () => {
    expect(translatePermissionArgs('claude', 'codex', '--permission-mode acceptEdits')).toBe('')
  })
})

describe('composeLaunchArgs', () => {
  it('puts the permission first and keeps unrelated default arguments', () => {
    expect(composeLaunchArgs('claude', '--dangerously-skip-permissions', '--model opus')).toBe(
      '--dangerously-skip-permissions --model opus'
    )
  })

  it('drops default arguments that set permissions themselves', () => {
    expect(composeLaunchArgs('claude', '', '--dangerously-skip-permissions --model opus')).toBe('')
  })
})
