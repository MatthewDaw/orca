import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { FilledBellIcon } from './WorktreeCardHelpers'
import { containerBell } from './workspace-container-unread'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

// Rings only once an agent in the container (or, while its children are hidden, in any nested
// one) has stopped working and nobody has looked yet. Working again, or opening it, silences it.
export function ContainerUnreadBell({
  containers
}: {
  containers: readonly WorkspaceContainer[]
}): React.JSX.Element | null {
  const unreadPanes = useAppStore((s) => s.unreadAgentCompletionPanes)
  const statuses = useAppStore((s) => s.agentStatusByPaneKey)
  const viewing = useAppStore((s) =>
    containers.some(
      (c) =>
        s.activeWorktreeId === c.worktreeId &&
        s.activeContainerIdByWorktree?.[c.worktreeId] === c.id
    )
  )
  const [now, setNow] = useState(() => Date.now())
  const bell = useMemo(() => {
    const keys = Object.keys(unreadPanes)
    const results = containers.map((c) => containerBell(c, keys, statuses, now))
    const settleTimes = results.flatMap((r) => (r.settleAt === null ? [] : [r.settleAt]))
    return {
      ringing: results.some((r) => r.ringing),
      settleAt: settleTimes.length > 0 ? Math.min(...settleTimes) : null
    }
  }, [containers, unreadPanes, statuses, now])

  useEffect(() => {
    if (bell.settleAt === null) {
      return undefined
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, bell.settleAt - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [bell.settleAt])

  if (!bell.ringing || viewing) {
    return null
  }
  return (
    <span title="An agent here finished its work" className="shrink-0">
      <FilledBellIcon className="size-[13px] animate-pulse text-annotation-highlight drop-shadow-sm" />
    </span>
  )
}
