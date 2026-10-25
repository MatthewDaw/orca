import type { Worktree } from '../../../shared/worktree/types'
import { MAIN_WORKTREE_REF } from '../../../shared/workspace-container-blueprint'

type WorktreeRefSource = Pick<Worktree, 'id' | 'branch' | 'isMainWorktree'>

const shortBranch = (branch: string): string => branch.replace(/^refs\/heads\//, '')

export function worktreeRefFor(
  worktrees: readonly WorktreeRefSource[],
  worktreeId: string
): string | null {
  const worktree = worktrees.find((w) => w.id === worktreeId)
  if (!worktree) {
    return null
  }
  return worktree.isMainWorktree ? MAIN_WORKTREE_REF : shortBranch(worktree.branch)
}

// An unknown branch falls back to main so a container is never lost just because its branch is not checked out here.
export function resolveWorktreeIdForRef(
  worktrees: readonly WorktreeRefSource[],
  ref: string
): string | null {
  const main = worktrees.find((w) => w.isMainWorktree)
  if (ref === MAIN_WORKTREE_REF) {
    return main?.id ?? null
  }
  const byBranch = worktrees.find((w) => !w.isMainWorktree && shortBranch(w.branch) === ref)
  return byBranch?.id ?? main?.id ?? null
}
