import { describe, expect, it } from 'vitest'
import { attachDurableMutationRecovery } from './terminal-prompt-mutation-recovery'
import { RuntimeClientError } from './types'

describe('attachDurableMutationRecovery', () => {
  it('offers --retry-request only to a command that accepts it', () => {
    const blocked = new RuntimeClientError('agent_prompt_blocked', 'blocked')
    const viaTerminalSend = attachDurableMutationRecovery(
      blocked,
      'req-1',
      ['orca', 'terminal', 'send', '--text', 'hi', '--enter'],
      'terminal.send'
    )
    expect(String((viaTerminalSend as Error).message)).toContain('--retry-request req-1')

    const viaContainerMessage = attachDurableMutationRecovery(
      blocked,
      'req-2',
      ['orca', 'container', 'message', '--to', 'main', '--text', 'hi'],
      'terminal.send'
    )
    const message = String((viaContainerMessage as Error).message)
    expect(message).not.toContain('--retry-request req-2')
    expect(message).toContain('no --retry-request flag')
  })
})
