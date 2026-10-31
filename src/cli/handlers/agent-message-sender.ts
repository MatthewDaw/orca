import { agentMessageHeader } from '../../shared/agent-message-marker'
import {
  describeMessageSender,
  replyHint,
  resolveContainerRef
} from '../../shared/workspace-container-routing'
import type { WorkspaceContainer } from '../../shared/workspace-container-types'
import type { HandlerContext } from '../dispatch'
import { readCatalog } from './container-catalog-file'
import { callerWorktreeSpace } from './container-worktree-space'

// The header Orca puts in front of a message this terminal's agent sends another agent, built from
// the terminal's own environment so the sender never has to name itself. Null when the caller is
// not an agent terminal (a person's shell outside Orca), whose text is sent as typed.
export async function callerMessageHeader(
  ctx: HandlerContext,
  detail?: string
): Promise<string | null> {
  if (!process.env.ORCA_TAB_ID && !process.env.ORCA_CONTAINER_ID) {
    return null
  }
  const catalog = await readCatalog().catch(() => ({ version: 1 as const, containers: [] }))
  const id = process.env.ORCA_CONTAINER_ID
  const sender: WorkspaceContainer | null =
    (id ? resolveContainerRef(catalog, id).container : null) ??
    (await callerWorktreeSpace(ctx, catalog).catch(() => null))
  const lines = [
    agentMessageHeader(describeMessageSender(catalog, sender), detail),
    replyHint(sender)
  ]
  return lines.filter(Boolean).join('\n')
}
