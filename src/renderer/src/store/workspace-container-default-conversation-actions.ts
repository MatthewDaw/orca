import { toast } from 'sonner'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchSleepingAgentSession } from '@/lib/sleeping-agent-session-launch'
import { pasteAgentLaunchPromptOnceReady } from '@/lib/launch-agent-tab-prompt-paste'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import {
  containerOfTerminalTab,
  conversationsByTerminalTab,
  defaultConversationAction,
  terminalTabsOfContainer as terminalTabsOf,
  type DefaultConversationAction
} from './workspace-container-default-conversation'
import { useAppStore } from '.'

type State = ReturnType<typeof useAppStore.getState>

const currentConversations = (state: State): ReturnType<typeof conversationsByTerminalTab> =>
  conversationsByTerminalTab(state.agentStatusByPaneKey, state.sleepingAgentSessionsByPaneKey)

// Whether a Claude or Codex conversation is already open in the container (live or asleep in a tab).
export function containerHasOpenConversation(state: State, container: WorkspaceContainer): boolean {
  const conversations = currentConversations(state)
  const terminals = state.tabsByWorktree[container.worktreeId] ?? []
  return terminalTabsOf(state, container).some(
    (id) =>
      conversations.has(id) ||
      terminals.some(
        (t) => t.id === id && (t.launchAgent === 'claude' || t.launchAgent === 'codex')
      )
  )
}

export async function setDefaultConversationFromTab(terminalTabId: string): Promise<void> {
  const state = useAppStore.getState()
  const container = containerOfTerminalTab(state, terminalTabId)
  const conversation = currentConversations(state).get(terminalTabId)
  if (!container || !conversation) {
    toast.error('This tab has no Claude or Codex conversation to make the default yet.')
    return
  }
  await window.api?.workspaceContainers?.update(container.id, {
    defaultConversation: { tabId: terminalTabId, ...conversation }
  })
}

// Opens the default conversation's tab, resumes it in a new tab when closed, or starts a Claude
// session (which becomes the default) when the container never had one. With activate false the
// person's selection is left alone and a prompt, if any, is submitted to the conversation.
export async function openDefaultConversation(
  containerId: string,
  options: { activate: boolean; prompt?: string; agentArgs?: string }
): Promise<DefaultConversationAction | null> {
  const state = useAppStore.getState()
  const container = state.workspaceContainers.find((c) => c.id === containerId)
  if (!container) {
    return null
  }
  const { worktreeId } = container
  const action = defaultConversationAction(state, container)
  const previous = state.activeContainerIdByWorktree[worktreeId] ?? null
  // Why: new tabs join the worktree's active container, so the container is selected first; a
  // background open puts the person's own selection back straight after.
  state.setActiveWorkspaceContainer(worktreeId, container.id)
  if (options.activate) {
    await activateWorktreeFromSidebar(worktreeId)
  }
  try {
    if (action === 'open') {
      const terminalTabId = container.defaultConversation?.tabId
      const tab = (useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []).find(
        (t) => t.contentType === 'terminal' && t.entityId === terminalTabId
      )
      if (tab && options.activate) {
        useAppStore.getState().activateTab(tab.id, { worktreeId })
      } else if (terminalTabId) {
        // Why: a default asleep in its tab has no terminal to type into until it is mounted.
        requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [terminalTabId] })
        deliverPrompt(worktreeId, terminalTabId, container, options.prompt)
      }
    } else if (action === 'resume') {
      await resumeDefaultConversation(container, options)
    } else {
      launchAgentInNewTab({
        requestId: newAgentLaunchRequestId(),
        agent: 'claude',
        worktreeId,
        prompt: options.prompt ?? '',
        ...(options.agentArgs !== undefined ? { agentArgs: options.agentArgs } : {}),
        activate: options.activate
      })
    }
  } finally {
    if (!options.activate) {
      useAppStore.getState().setActiveWorkspaceContainer(worktreeId, previous)
    }
  }
  return action
}

async function resumeDefaultConversation(
  container: WorkspaceContainer,
  options: { activate: boolean; prompt?: string }
): Promise<void> {
  const conversation = container.defaultConversation
  if (!conversation) {
    return
  }
  const { worktreeId } = container
  // Why: the conversation comes back with the permissions it last ran with, read from its transcript.
  const agentArgs =
    (await window.api?.workspaceContainers
      ?.agentPermissionArgs(conversation.agent, conversation.providerSession.id)
      .catch(() => null)) ?? ''
  const now = Date.now()
  const launched: { tabId: string | null } = { tabId: null }
  launchSleepingAgentSession(
    {
      paneKey: `default-conversation:${container.id}`,
      worktreeId,
      agent: conversation.agent,
      providerSession: conversation.providerSession,
      prompt: '',
      state: 'done',
      capturedAt: now,
      updatedAt: now,
      launchConfig: { agentArgs, agentEnv: {} }
    },
    {
      suppressNavigation: !options.activate,
      onSessionLaunched: (tabId) => {
        launched.tabId = tabId
      }
    }
  )
  const launchedTabId = launched.tabId
  if (!launchedTabId) {
    return
  }
  if (!options.activate) {
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [launchedTabId] })
  }
  deliverPrompt(worktreeId, launchedTabId, container, options.prompt)
}

function deliverPrompt(
  worktreeId: string,
  tabId: string,
  container: WorkspaceContainer,
  text: string | undefined
): void {
  const prompt = text?.trim()
  const agent = container.defaultConversation?.agent
  if (prompt && agent) {
    void pasteAgentLaunchPromptOnceReady({
      worktreeId,
      tabId,
      agent,
      content: prompt,
      submit: true,
      prompt
    }).catch(() => undefined)
  }
}
