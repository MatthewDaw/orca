import type { RuntimeClient } from '../runtime-client'
import type { RuntimeTerminalListResult, RuntimeTerminalSend } from '../../shared/runtime-types'

// Why: without a window the receipt can never show a turn start, so every agent-to-agent send
// warned of a swallowed Enter. Long enough for an idle agent to begin its turn, short enough to wait on.
export const DEFAULT_PROMPT_OBSERVE_MS = 8_000

export type TargetAgentStatus = NonNullable<
  RuntimeTerminalListResult['terminals'][number]['agentStatus']
>

/** The target agent's hook state right now; null when the host cannot say. */
export async function readTargetAgentStatus(
  client: Pick<RuntimeClient, 'call'>,
  handle: string
): Promise<TargetAgentStatus | null> {
  try {
    const listed = await client.call<RuntimeTerminalListResult>('terminal.list', {
      handles: [handle],
      includeVisualLayouts: false
    })
    return listed.result.terminals.find((t) => t.handle === handle)?.agentStatus ?? null
  } catch {
    return null
  }
}

/** True when the receipt proves the target agent started a turn on this message. */
export function promptTurnStarted(send: RuntimeTerminalSend): boolean {
  return send.prompt?.stages.includes('turn_started') === true
}
