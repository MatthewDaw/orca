import { MessageSquare } from 'lucide-react'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { useAppStore } from '@/store'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import { defaultConversationAction } from '@/store/workspace-container-default-conversation'

const LABELS = {
  open: 'Open Default Conversation',
  resume: 'Resume Default Conversation',
  start: 'Start Default Conversation'
} as const

export function ContainerDefaultConversationMenuItem({
  container
}: {
  container: WorkspaceContainer
}): React.JSX.Element {
  const action = useAppStore((s) => defaultConversationAction(s, container))
  return (
    <ContextMenuItem
      onSelect={() =>
        // Why lazy: the actions reach the launch and resume code, which the sidebar must not load.
        void import('@/store/workspace-container-default-conversation-actions').then((actions) =>
          actions.openDefaultConversation(container.id, { activate: true })
        )
      }
    >
      <MessageSquare className="size-3.5" />
      {LABELS[action]}
    </ContextMenuItem>
  )
}
