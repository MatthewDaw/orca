import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { FilledBellIcon } from './WorktreeCardHelpers'
import { containerBell } from './workspace-container-unread'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

// Where the container card reports its agents, in three states: a solid dot while one is working,
// a bell once one has stopped and nobody has looked yet, and nothing after it has been seen.
// While children are hidden the bell also covers nested containers; the working dot never does,
// it only speaks for the container itself.
export function ContainerUnreadBell({
  containers,
  own
}: {
  containers: readonly WorkspaceContainer[]
  own: WorkspaceContainer
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
  const status = useMemo(() => {
    const keys = Object.keys(unreadPanes)
    const results = containers.map((c) => containerBell(c, keys, statuses, now))
    const settleTimes = results.flatMap((r) => (r.settleAt === null ? [] : [r.settleAt]))
    return {
      finished: results.some((r) => r.indicator === 'finished'),
      working: containerBell(own, keys, statuses, now).indicator === 'working',
      settleAt: settleTimes.length > 0 ? Math.min(...settleTimes) : null
    }
  }, [containers, own, unreadPanes, statuses, now])

  useEffect(() => {
    if (status.settleAt === null) {
      return undefined
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, status.settleAt - Date.now()) + 50
    )
    return () => clearTimeout(timer)
  }, [status.settleAt])

  if (status.finished && !viewing) {
    return (
      <span title="An agent here finished its work" className="shrink-0">
        <FilledBellIcon className="size-[13px] animate-pulse text-annotation-highlight drop-shadow-sm" />
      </span>
    )
  }
  if (status.working) {
    return (
      <span
        title="An agent here is working"
        className="flex size-[13px] shrink-0 items-center justify-center"
      >
        <span className="size-2 rounded-full bg-foreground/70" />
      </span>
    )
  }
  return null
}
