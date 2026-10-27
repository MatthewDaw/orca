import type { RuntimeWorktreeCreateResult } from '../../shared/runtime-worktree-contracts'
import type { HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveCurrentWorktreeSelection } from '../selectors'
import { getCreateRepoTarget } from '../worktree-project-target'
import { WORKTREE_SPACE_PREFIX } from './container-worktree-space'

// A worktree's own space is itself a container, so a container "on a new worktree" is a new
// git worktree; its space can then be messaged, given sessions and nested containers.
export async function createContainerOnNewWorktree(ctx: HandlerContext): Promise<void> {
  const name = getRequiredStringFlag(ctx.flags, 'name').trim()
  const callerTerminalHandle = process.env.ORCA_TERMINAL_HANDLE || undefined
  // Cwd supplies the repo and parent worktree, as `orca worktree create` does.
  const current = await resolveCurrentWorktreeSelection(ctx.cwd, ctx.client).catch(() => undefined)
  const repoTarget = await getCreateRepoTarget(ctx.flags, current, ctx.client)
  const created = await ctx.client.call<RuntimeWorktreeCreateResult>('worktree.create', {
    ...repoTarget,
    name,
    displayName: name,
    displayNameKind: 'user',
    baseBranch: getOptionalStringFlag(ctx.flags, 'base-branch'),
    runHooks: false,
    activate: false,
    ...(current ? { cwdParentWorktree: current.selector } : {}),
    noParent: false,
    callerTerminalHandle,
    cliProvenanceRequest: callerTerminalHandle ? { callerTerminalHandle } : {}
  })
  const worktree = created.result.worktree
  const handle = `${WORKTREE_SPACE_PREFIX}${worktree.id}`
  if (ctx.json) {
    console.log(JSON.stringify({ worktree: worktree.id, container: handle, name }))
    return
  }
  console.log(
    `Created worktree "${name}" as its own container (${handle}). Start an agent there with \`orca container launch --container "${handle}" --agent <name>\`, then reach it with \`orca container message --to "${handle}"\`. From a terminal inside it, \`orca container create --name <name>\` nests containers under it.`
  )
}
