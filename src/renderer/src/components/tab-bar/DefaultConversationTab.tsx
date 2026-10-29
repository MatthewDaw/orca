import { Check, Pin, Star } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import {
  containerOfTerminalTab,
  conversationsByTerminalTab
} from '@/store/workspace-container-default-conversation'

// The pin, and a small star on the tab holding its container's default conversation.
export function TabTitleMarks({
  isPinned,
  terminalTabId
}: {
  isPinned: boolean
  terminalTabId: string
}): React.JSX.Element {
  const isDefault = useAppStore((s) =>
    (s.workspaceContainers ?? []).some((c) => c.defaultConversation?.tabId === terminalTabId)
  )
  return (
    <>
      {isPinned && <Pin className="mr-1 size-3 shrink-0 text-muted-foreground" aria-hidden />}
      {isDefault && (
        <span title="Default conversation" className="mr-1 flex shrink-0">
          <Star className="size-2.5 fill-current text-muted-foreground/70" aria-hidden />
        </span>
      )}
    </>
  )
}

export function DefaultConversationMenuItem({
  terminalTabId
}: {
  terminalTabId: string
}): React.JSX.Element | null {
  const status = useAppStore((s) => {
    const container = containerOfTerminalTab(s, terminalTabId)
    if (!container) {
      return 'none'
    }
    if (container.defaultConversation?.tabId === terminalTabId) {
      return 'default'
    }
    return conversationsByTerminalTab(s.agentStatusByPaneKey, s.sleepingAgentSessionsByPaneKey).has(
      terminalTabId
    )
      ? 'available'
      : 'none'
  })
  if (status === 'none') {
    return null
  }
  return (
    <DropdownMenuItem
      disabled={status === 'default'}
      onSelect={() =>
        // Why lazy: the actions reach the launch and resume code, which the tab bar must not load.
        void import('@/store/workspace-container-default-conversation-actions').then((actions) =>
          actions.setDefaultConversationFromTab(terminalTabId)
        )
      }
    >
      {status === 'default' ? <Check className="size-3.5" /> : <Star className="size-3.5" />}
      {status === 'default' ? 'Default Conversation' : 'Set as Default Conversation'}
    </DropdownMenuItem>
  )
}
