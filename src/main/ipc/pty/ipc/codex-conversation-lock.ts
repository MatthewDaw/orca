import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { getPtyIpc } from '../../pty-host-bindings'
import {
  conversationNameFromTerminalTitle,
  findConversationHolders,
  screenShowsConversationLock,
  stopConversationHolders
} from '../../../codex/codex-conversation-holders'

export type CodexConversationLockStatus = { locked: boolean; holders: number }

async function lockStatus(
  runtime: OrcaRuntimeService,
  ptyId: string
): Promise<{ status: CodexConversationLockStatus; holders: number[] }> {
  const none = { status: { locked: false, holders: 0 }, holders: [] as number[] }
  const screen = await runtime.readVisibleScreenText(ptyId).catch(() => null)
  if (!screen || !screenShowsConversationLock(screen)) {
    return none
  }
  const { terminals } = await runtime.listTerminals()
  const title = terminals.find((terminal) => terminal.ptyId === ptyId)?.title
  if (!title) {
    return none
  }
  const holders = await findConversationHolders(conversationNameFromTerminalTitle(title))
  return { status: { locked: holders.length > 0, holders: holders.length }, holders }
}

export function installPtyCodexConversationLockIpcHandler(deps: {
  runtime?: OrcaRuntimeService
}): void {
  getPtyIpc().handle(
    'pty:codexConversationLock',
    async (
      _event,
      args: { id: unknown; release?: unknown }
    ): Promise<CodexConversationLockStatus> => {
      const { runtime } = deps
      if (!runtime || typeof args?.id !== 'string') {
        return { locked: false, holders: 0 }
      }
      const { status, holders } = await lockStatus(runtime, args.id)
      if (args.release === true && status.locked) {
        await stopConversationHolders(holders)
        return { locked: false, holders: 0 }
      }
      return status
    }
  )
}
