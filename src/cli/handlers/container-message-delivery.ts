import type { RuntimeTerminalSend } from '../../shared/runtime-types'
import type { HandlerContext } from '../dispatch'
import { promptTurnStarted, readTargetAgentStatus } from './agent-prompt-delivery-check'

type MessagedTerminal = { handle: string; title: string | null; agentIdentity?: string }

/** Prints how far a container message got, so the sender knows whether to wait or check. */
export async function reportContainerMessageDelivery(
  ctx: HandlerContext,
  args: {
    send: RuntimeTerminalSend
    terminal: MessagedTerminal
    targetPath: string
    others: readonly MessagedTerminal[]
  }
): Promise<void> {
  const { send, terminal, targetPath, others } = args
  const delivery = !send.accepted
    ? 'refused'
    : send.queued
      ? 'queued'
      : promptTurnStarted(send)
        ? 'started'
        : (await readTargetAgentStatus(ctx.client, terminal.handle)) === 'working'
          ? 'waiting-for-turn-end'
          : 'unconfirmed'
  if (ctx.json) {
    console.log(
      JSON.stringify({
        to: targetPath,
        terminal: terminal.handle,
        accepted: send.accepted,
        delivery,
        queued: send.queued === true,
        ...(send.queuedReason ? { queuedReason: send.queuedReason } : {}),
        otherConversations: others.map((t) => ({ handle: t.handle, title: t.title }))
      })
    )
  } else {
    const who = `${targetPath} (${terminal.agentIdentity ?? 'terminal'} ${terminal.handle})`
    console.log(
      delivery === 'queued'
        ? send.queuedReason === 'permission'
          ? `Queued for ${targetPath}: its agent is waiting on a permission prompt, so Orca will type the message in once that is answered. Do not resend.`
          : `Queued for ${targetPath}: a person is mid-message there, so it will be typed in once they send or clear it. Do not resend.`
        : delivery === 'started'
          ? `Delivered to ${who}: its agent started working on it.`
          : delivery === 'waiting-for-turn-end'
            ? `Delivered to ${who}: its agent is mid-turn and will read the message when that turn ends. Do not resend.`
            : delivery === 'unconfirmed'
              ? `Typed into ${who}, but its agent has not started on it yet. Check with \`orca terminal read --terminal ${terminal.handle}\` before resending.`
              : `${who} did not accept the message.`
    )
  }
}
