import { describe, expect, it } from 'vitest'
import { resolveWorktreeIdForRef, worktreeRefFor } from './workspace-container-worktree-refs'

const worktrees = [
  { id: 'r::/repo', branch: 'refs/heads/main', isMainWorktree: true },
  { id: 'r::/repo-feat', branch: 'refs/heads/feat/login', isMainWorktree: false }
]

describe('container worktree refs', () => {
  it('names the main worktree "main" and others by branch', () => {
    expect(worktreeRefFor(worktrees, 'r::/repo')).toBe('main')
    expect(worktreeRefFor(worktrees, 'r::/repo-feat')).toBe('feat/login')
    expect(worktreeRefFor(worktrees, 'r::/gone')).toBeNull()
  })

  it("resolves refs back to this machine's worktrees", () => {
    expect(resolveWorktreeIdForRef(worktrees, 'main')).toBe('r::/repo')
    expect(resolveWorktreeIdForRef(worktrees, 'feat/login')).toBe('r::/repo-feat')
  })

  it('falls back to main when the branch is not checked out', () => {
    expect(resolveWorktreeIdForRef(worktrees, 'feat/other')).toBe('r::/repo')
  })

  it('resolves nothing when there is no worktree at all', () => {
    expect(resolveWorktreeIdForRef([], 'main')).toBeNull()
  })
})
