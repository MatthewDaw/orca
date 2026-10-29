import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'
import {
  CONTAINER_LAUNCH_PERMISSIONS,
  isContainerLaunchPermission
} from '../../shared/container-launch-permission'
import { isContainerLaunchAgent } from '../../shared/workspace-container-agent-request'
import {
  describeContainerPath,
  isContainerWithin,
  resolveContainerRef
} from '../../shared/workspace-container-routing'
import { ALL_TUI_AGENTS } from '../../shared/tui-agent-display-names'
import type { RuntimeTerminalListResult } from '../../shared/runtime-terminal-contracts'
import type { HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { containerDirectory, readCatalog } from './container-catalog-file'
import { createContainerOnNewWorktree } from './container-new-worktree'
import {
  callerWorktreeSpace,
  isWorktreeSpaceId,
  resolveWorktreeSpace
} from './container-worktree-space'

export async function createChildContainer(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  if (ctx.flags.get('new-worktree') === true) {
    await createContainerOnNewWorktree(ctx)
    return
  }
  const parentRef = getOptionalStringFlag(ctx.flags, 'parent') ?? process.env.ORCA_CONTAINER_ID
  const resolved = parentRef ? resolveContainerRef(catalog, parentRef) : null
  // Why: a terminal in a worktree's own space is in no container but still sits on a worktree,
  // so with no parent the container is created at the top level of that worktree.
  const worktreeId = resolved?.container ? undefined : process.env.ORCA_WORKTREE_ID
  if (!resolved?.container && !(parentRef === undefined && worktreeId)) {
    throw new RuntimeClientError(
      'selector_not_found',
      'This terminal is not in a container or worktree. Pass --parent <container>.'
    )
  }
  const parent = resolved?.container ?? null
  const name = getRequiredStringFlag(ctx.flags, 'name').trim()
  const taken = catalog.containers.some(
    (c) =>
      (c.parentContainerId ?? null) === (parent?.id ?? null) &&
      (parent || c.worktreeId === worktreeId) &&
      c.name.toLowerCase() === name.toLowerCase()
  )
  const parentPath = parent ? describeContainerPath(catalog, parent) : 'this worktree'
  if (!name || taken) {
    throw new RuntimeClientError(
      'invalid_argument',
      taken ? `"${parentPath}" already has a container named "${name}".` : 'A name is required.'
    )
  }
  const inbox = join(containerDirectory(), 'inbox')
  await mkdir(inbox, { recursive: true })
  await writeFile(
    join(inbox, `${randomUUID()}.json`),
    JSON.stringify({
      createChild: true,
      requesterId: process.env.ORCA_CONTAINER_ID,
      ...(parent ? { containerId: parent.id } : { worktreeId }),
      name,
      focus: getOptionalStringFlag(ctx.flags, 'focus') ?? ''
    })
  )
  console.log(
    parent
      ? `Requested a child container "${name}" under ${parentPath}; Orca will create it within a moment. Reach it with \`orca container message --to "${parentPath}/${name}"\` once someone opens an agent there.`
      : `Requested a container "${name}" on this worktree; Orca will create it within a moment. Reach it with \`orca container message --to "${name}"\` once someone opens an agent there.`
  )
}

// A container ref, or a worktree's own space (by worktree name or `worktree:<id>`); with no ref,
// this terminal's own container or, outside any container, its worktree's space.
async function requireTarget(
  ctx: HandlerContext,
  catalog: WorkspaceContainerCatalog,
  explicitRef: string | undefined,
  flag: string
): Promise<WorkspaceContainerCatalog['containers'][number]> {
  const ref = explicitRef ?? process.env.ORCA_CONTAINER_ID
  if (!ref) {
    const own = await callerWorktreeSpace(ctx, catalog)
    if (own) {
      return own
    }
  }
  const resolved = ref ? resolveContainerRef(catalog, ref) : null
  if (resolved?.container) {
    return resolved.container
  }
  const space =
    ref && !(resolved && resolved.candidates.length > 0)
      ? await resolveWorktreeSpace(ctx, catalog, ref)
      : null
  if (space) {
    return space
  }
  throw new RuntimeClientError(
    resolved && resolved.candidates.length > 0 ? 'invalid_argument' : 'selector_not_found',
    ref
      ? `"${ref}" does not name exactly one container or worktree. Run \`orca container list\` and use the full path or id.`
      : `Pass ${flag} <container>.`
  )
}

// Why: an agent in a container acts on its own subtree; one in a worktree's own space (no
// container) acts on anything on that worktree. A plain terminal outside Orca is trusted.
function assertMayAct(
  catalog: WorkspaceContainerCatalog,
  target: WorkspaceContainerCatalog['containers'][number],
  action: string
): void {
  const requesterId = process.env.ORCA_CONTAINER_ID
  const requesterWorktree = process.env.ORCA_WORKTREE_ID
  const allowed = requesterId
    ? !isWorktreeSpaceId(target.id) && isContainerWithin(catalog, requesterId, target.id)
    : !requesterWorktree || target.worktreeId === requesterWorktree
  if (!allowed) {
    throw new RuntimeClientError(
      'invalid_argument',
      `You can only ${action} in your own container, ones nested under it, or (from a worktree's own space) that worktree.`
    )
  }
}

async function dropAgentRequest(payload: Record<string, unknown>): Promise<void> {
  const inbox = join(containerDirectory(), 'inbox')
  await mkdir(inbox, { recursive: true })
  await writeFile(join(inbox, `${randomUUID()}.json`), JSON.stringify(payload))
}

export async function deleteContainer(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const target = await requireTarget(
    ctx,
    catalog,
    getRequiredStringFlag(ctx.flags, 'container'),
    '--container'
  )
  if (isWorktreeSpaceId(target.id)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'A worktree is not a container you can delete here. Use `orca worktree rm` to remove it.'
    )
  }
  const requesterId = process.env.ORCA_CONTAINER_ID
  assertMayAct(catalog, target, 'delete containers')
  if (requesterId === target.id) {
    throw new RuntimeClientError('invalid_argument', 'A container cannot delete itself.')
  }
  await dropAgentRequest({ action: 'delete', containerId: target.id, requesterId })
  console.log(
    `Requested deletion of ${describeContainerPath(catalog, target)}. Its open tabs and agent sessions will be closed and any containers nested in it move up a level.`
  )
}

export async function launchContainerAgent(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const requesterId = process.env.ORCA_CONTAINER_ID
  const target = await requireTarget(
    ctx,
    catalog,
    getOptionalStringFlag(ctx.flags, 'container'),
    '--container'
  )
  const agent = getRequiredStringFlag(ctx.flags, 'agent')
  if (!isContainerLaunchAgent(agent)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--agent must be one of: ${ALL_TUI_AGENTS.join(', ')}.`
    )
  }
  // Why: starting a session only adds a conversation, so any agent may start one in any container.
  const permission = getOptionalStringFlag(ctx.flags, 'permission') ?? 'inherit'
  if (!isContainerLaunchPermission(permission)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--permission must be one of: ${CONTAINER_LAUNCH_PERMISSIONS.join(', ')}.`
    )
  }
  await dropAgentRequest({
    action: 'launch',
    ...(isWorktreeSpaceId(target.id)
      ? { worktreeId: target.worktreeId }
      : { containerId: target.id }),
    agent,
    prompt: getOptionalStringFlag(ctx.flags, 'prompt') ?? '',
    permission,
    requesterTabId: process.env.ORCA_TAB_ID,
    requesterId
  })
  console.log(
    `Requested a new ${agent} session in ${describeContainerPath(catalog, target)}. Once it is up, reach it with \`orca container message --to "${isWorktreeSpaceId(target.id) ? target.id : describeContainerPath(catalog, target)}"\`.`
  )
}

async function terminalsInContainer(
  ctx: HandlerContext,
  container: WorkspaceContainerCatalog['containers'][number]
): Promise<RuntimeTerminalListResult['terminals']> {
  const listed = await ctx.client.call<RuntimeTerminalListResult>('terminal.list', {
    worktree: `id:${container.worktreeId}`,
    includeVisualLayouts: false
  })
  const owned = new Set(container.terminalTabIds ?? [])
  return listed.result.terminals.filter((t) => owned.has(t.tabId))
}

export async function listContainerAgents(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const target = await requireTarget(
    ctx,
    catalog,
    getOptionalStringFlag(ctx.flags, 'container') ?? process.env.ORCA_CONTAINER_ID,
    '--container'
  )
  const terminals = await terminalsInContainer(ctx, target)
  if (ctx.json) {
    console.log(
      JSON.stringify({ container: describeContainerPath(catalog, target), terminals }, null, 2)
    )
    return
  }
  console.log(describeContainerPath(catalog, target))
  for (const t of terminals) {
    const mine = t.tabId === process.env.ORCA_TAB_ID ? ' (you)' : ''
    console.log(`  ${t.handle}\t${t.agentIdentity ?? 'terminal'}\t${t.title ?? ''}${mine}`)
  }
  if (terminals.length === 0) {
    console.log('  No open terminals.')
  }
}

export async function closeContainerAgent(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const handle = getRequiredStringFlag(ctx.flags, 'terminal')
  const requesterId = process.env.ORCA_CONTAINER_ID
  const ownSpace = requesterId ? null : await callerWorktreeSpace(ctx, catalog)
  for (const container of [...catalog.containers, ...(ownSpace ? [ownSpace] : [])]) {
    if (requesterId && !isContainerWithin(catalog, requesterId, container.id)) {
      continue
    }
    const terminal = (await terminalsInContainer(ctx, container)).find((t) => t.handle === handle)
    if (!terminal) {
      continue
    }
    if (terminal.tabId === process.env.ORCA_TAB_ID) {
      throw new RuntimeClientError('invalid_argument', 'You cannot close your own session.')
    }
    await ctx.client.call('terminal.closeTab', { terminal: handle })
    console.log(
      `Closed ${terminal.agentIdentity ?? 'terminal'} ${handle} in ${describeContainerPath(catalog, container)}.`
    )
    return
  }
  throw new RuntimeClientError(
    'selector_not_found',
    `No terminal ${handle} in your container or ones nested under it. Run \`orca container agents\` for handles.`
  )
}
