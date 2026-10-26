import React from 'react'
import { useAppStore } from '@/store'
import { FilledBellIcon } from './WorktreeCardHelpers'
import { containerHasUnreadCompletion } from './workspace-container-unread'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

// Rings when an agent in the container (or, while its children are hidden, in any nested one)
// has finished and nobody has looked at it yet.
export function ContainerUnreadBell({
  containers
}: {
  containers: readonly WorkspaceContainer[]
}): React.JSX.Element | null {
  const unread = useAppStore((s) =>
    containers.some((container) =>
      containerHasUnreadCompletion(container, Object.keys(s.unreadAgentCompletionPanes))
    )
  )
  if (!unread) {
    return null
  }
  return (
    <span title="An agent here finished its work" className="shrink-0">
      <FilledBellIcon className="size-[13px] animate-pulse text-annotation-highlight drop-shadow-sm" />
    </span>
  )
}
