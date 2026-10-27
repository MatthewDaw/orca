import type {
  WorkspaceContainer,
  WorkspaceContainerCatalog
} from '../../shared/workspace-container-types'
import type { RuntimeTerminalListResult } from '../../shared/runtime-terminal-contracts'
import type { RuntimeWorktreeListResult } from '../../shared/runtime-worktree-contracts'
import type { HandlerContext } from '../dispatch'

// A worktree's own space (the tabs no container claimed) is a container too, but it has no
// catalog entry, so the CLI builds one on demand under the id `worktree:<worktree id>`.
export const WORKTREE_SPACE_PREFIX = 'worktree:'

export const isWorktreeSpaceId = (id: string): boolean => id.startsWith(WORKTREE_SPACE_PREFIX)

export async function buildWorktreeSpace(
  ctx: HandlerContext,
  catalog: WorkspaceContainerCatalog,
  worktreeId: string,
  name?: string
): Promise<WorkspaceContainer> {
  const listed = await ctx.client.call<RuntimeTerminalListResult>('terminal.list', {
    worktree: `id:${worktreeId}`,
    includeVisualLayouts: false
  })
  const claimed = new Set(catalog.containers.flatMap((c) => c.terminalTabIds ?? []))
  return {
    id: `${WORKTREE_SPACE_PREFIX}${worktreeId}`,
    worktreeId,
    name: name ?? (await worktreeDisplayName(ctx, worktreeId)),
    parentContainerId: null,
    tabIds: [],
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    terminalTabIds: listed.result.terminals.map((t) => t.tabId).filter((t) => !claimed.has(t)),
    createdAt: 0,
    updatedAt: 0
  }
}

async function worktreeDisplayName(ctx: HandlerContext, worktreeId: string): Promise<string> {
  const listed = await ctx.client.call<RuntimeWorktreeListResult>('worktree.list', {
    limit: 10_000
  })
  return listed.result.worktrees.find((w) => w.id === worktreeId)?.displayName ?? worktreeId
}

// `worktree:<id>` or a worktree's display name, branch or checkout folder; null unless exactly one matches.
export async function resolveWorktreeSpace(
  ctx: HandlerContext,
  catalog: WorkspaceContainerCatalog,
  ref: string
): Promise<WorkspaceContainer | null> {
  const listed = await ctx.client.call<RuntimeWorktreeListResult>('worktree.list', {
    limit: 10_000
  })
  const wanted = ref.trim().toLowerCase()
  const matches = listed.result.worktrees.filter((w) =>
    isWorktreeSpaceId(ref)
      ? `${WORKTREE_SPACE_PREFIX}${w.id}` === ref
      : [w.displayName, w.branch].some(
          (n) => n?.replace(/^refs\/heads\//, '').toLowerCase() === wanted
        )
  )
  return matches.length === 1
    ? buildWorktreeSpace(ctx, catalog, matches[0].id, matches[0].displayName)
    : null
}

// The space this terminal sits in when it is not inside any container.
export async function callerWorktreeSpace(
  ctx: HandlerContext,
  catalog: WorkspaceContainerCatalog
): Promise<WorkspaceContainer | null> {
  const worktreeId = process.env.ORCA_WORKTREE_ID
  return worktreeId ? buildWorktreeSpace(ctx, catalog, worktreeId) : null
}
