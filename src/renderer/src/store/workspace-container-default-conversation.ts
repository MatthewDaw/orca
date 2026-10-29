import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import type {
  WorkspaceContainer,
  WorkspaceContainerDefaultConversation
} from '../../../shared/workspace-container-types'

type Conversation = Omit<WorkspaceContainerDefaultConversation, 'tabId'>

const isDefaultAgent = (agent: unknown): agent is Conversation['agent'] =>
  agent === 'claude' || agent === 'codex'

const terminalTabOf = (paneKey: string): string => paneKey.split(':')[0] ?? paneKey

// The Claude or Codex conversation each terminal tab holds, live first, then ones asleep in it.
export function conversationsByTerminalTab(
  statusByPaneKey: Readonly<Record<string, AgentStatusEntry>>,
  sleepingByPaneKey: Readonly<Record<string, SleepingAgentSessionRecord>>
): Map<string, Conversation> {
  const byTab = new Map<string, Conversation>()
  for (const record of Object.values(sleepingByPaneKey)) {
    if (isDefaultAgent(record.agent)) {
      byTab.set(terminalTabOf(record.paneKey), {
        agent: record.agent,
        providerSession: { key: record.providerSession.key, id: record.providerSession.id }
      })
    }
  }
  for (const entry of Object.values(statusByPaneKey)) {
    if (isDefaultAgent(entry.agentType) && entry.providerSession) {
      byTab.set(terminalTabOf(entry.paneKey), {
        agent: entry.agentType,
        providerSession: { key: entry.providerSession.key, id: entry.providerSession.id }
      })
    }
  }
  return byTab
}

const sameConversation = (
  a: WorkspaceContainerDefaultConversation | undefined,
  b: WorkspaceContainerDefaultConversation
): boolean =>
  a !== undefined &&
  a.tabId === b.tabId &&
  a.agent === b.agent &&
  a.providerSession.key === b.providerSession.key &&
  a.providerSession.id === b.providerSession.id

// The container's next default conversation, or null when it stays as is. The first conversation a
// container gets becomes its default; after that it follows its session into whichever tab holds it.
export function planDefaultConversation(
  container: Pick<WorkspaceContainer, 'defaultConversation'>,
  terminalTabIds: readonly string[],
  conversations: ReadonlyMap<string, Conversation>
): WorkspaceContainerDefaultConversation | null {
  const current = container.defaultConversation
  const tabId =
    current?.tabId && terminalTabIds.includes(current.tabId)
      ? current.tabId
      : current
        ? terminalTabIds.find(
            (id) => conversations.get(id)?.providerSession.id === current.providerSession.id
          )
        : terminalTabIds.find((id) => conversations.has(id))
  const conversation = tabId ? conversations.get(tabId) : undefined
  if (!tabId || !conversation) {
    return null
  }
  const next = { tabId, ...conversation }
  return sameConversation(current, next) ? null : next
}

type ContainerTabsState = {
  workspaceContainers: readonly WorkspaceContainer[] | undefined
  unifiedTabsByWorktree:
    | Readonly<Record<string, readonly { id: string; contentType: string; entityId: string }[]>>
    | undefined
}

// The terminal tab ids a container owns, in tab order.
export function terminalTabsOfContainer(
  state: ContainerTabsState,
  container: WorkspaceContainer
): string[] {
  const owned = new Set(container.tabIds)
  return (state.unifiedTabsByWorktree?.[container.worktreeId] ?? [])
    .filter((tab) => tab.contentType === 'terminal' && owned.has(tab.id))
    .map((tab) => tab.entityId)
}

export function containerOfTerminalTab(
  state: ContainerTabsState,
  terminalTabId: string
): WorkspaceContainer | null {
  return (
    // Why the fallback: tab-bar tests render against partial stores with no container list.
    (state.workspaceContainers ?? []).find((container) =>
      terminalTabsOfContainer(state, container).includes(terminalTabId)
    ) ?? null
  )
}

export type DefaultConversationAction = 'open' | 'resume' | 'start'

// What opening the container's default conversation would do right now.
export function defaultConversationAction(
  state: ContainerTabsState,
  container: WorkspaceContainer
): DefaultConversationAction {
  const tabId = container.defaultConversation?.tabId
  if (tabId && terminalTabsOfContainer(state, container).includes(tabId)) {
    return 'open'
  }
  return container.defaultConversation ? 'resume' : 'start'
}
