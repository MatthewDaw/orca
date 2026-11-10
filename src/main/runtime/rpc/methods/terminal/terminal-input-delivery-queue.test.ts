import { describe, expect, it, vi } from 'vitest'
import { queueSendWhileAgentAwaitsPermission } from './terminal-input-delivery'
import type { OrcaRuntimeService } from '../../../orca-runtime'

const params = {
  terminal: 't1',
  text: 'hello',
  enter: true,
  agentPrompt: true as const,
  deferWhileUserTyping: true as const
}

function runtimeStub() {
  const sendTerminalAgentPrompt = vi.fn(async () => ({
    handle: 't1',
    accepted: true,
    bytesWritten: 6
  }))
  const runtime = {
    isTerminalRunningSettledPromptAgent: vi.fn(async () => true),
    sendTerminalAgentPrompt,
    sendTerminal: vi.fn()
  }
  // SAFETY: the queue path reads only these three members of the runtime.
  return { runtime: runtime as unknown as OrcaRuntimeService, sendTerminalAgentPrompt }
}

describe('queueSendWhileAgentAwaitsPermission', () => {
  it('holds a blocked agent message and resends it waiting out the permission prompt', async () => {
    const { runtime, sendTerminalAgentPrompt } = runtimeStub()
    const receipt = queueSendWhileAgentAwaitsPermission(
      runtime,
      params,
      new Error('agent_prompt_blocked')
    )
    expect(receipt).toEqual({
      send: {
        handle: 't1',
        accepted: true,
        bytesWritten: 0,
        queued: true,
        queuedReason: 'permission'
      }
    })
    await vi.waitFor(() => expect(sendTerminalAgentPrompt).toHaveBeenCalledOnce())
    expect(sendTerminalAgentPrompt).toHaveBeenCalledWith('t1', 'hello', {
      inputKind: 'driving',
      onPermission: 'wait'
    })
  })

  it('leaves other errors and synchronous senders to the caller', () => {
    const { runtime, sendTerminalAgentPrompt } = runtimeStub()
    expect(
      queueSendWhileAgentAwaitsPermission(runtime, params, new Error('terminal_not_writable'))
    ).toBeNull()
    expect(
      queueSendWhileAgentAwaitsPermission(
        runtime,
        { ...params, deferWhileUserTyping: undefined },
        new Error('agent_prompt_blocked')
      )
    ).toBeNull()
    expect(sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
})
