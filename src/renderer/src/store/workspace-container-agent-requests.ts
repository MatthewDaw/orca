import type { ContainerAgentRequest } from '../../../shared/workspace-container-agent-request'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchArgsForRequest } from './workspace-container-launch-permission'
import {
  containerHasOpenConversation,
  openDefaultConversation
} from './workspace-container-default-conversation-actions'
import { useAppStore } from '.'

// Why the active container is borrowed: new tabs join the worktree's active container, so the
// launch targets the right one and the person's own selection is put back straight after.
async function launchInContainer(
  request: Extract<ContainerAgentRequest, { kind: 'launch' }>
): Promise<void> {
  // Why first: reading the starter's permission is async, and the borrowed selection below must not wait on it.
  const agentArgs = await launchArgsForRequest(request)
  const state = useAppStore.getState()
  const container = request.containerId
    ? state.workspaceContainers.find((c) => c.id === request.containerId)
    : null
  const worktreeId = container ? container.worktreeId : request.worktreeId
  if (!worktreeId || (request.containerId && !container)) {
    return
  }
  // Why: work arriving at a container with no conversation open goes to its default conversation,
  // which keeps its own permissions, instead of starting a stranger.
  if (
    container &&
    (request.toDefault ||
      (container.defaultConversation &&
        !request.fresh &&
        !containerHasOpenConversation(state, container)))
  ) {
    await openDefaultConversation(container.id, {
      activate: false,
      prompt: request.prompt,
      ...(agentArgs !== undefined ? { agentArgs } : {})
    })
    return
  }
  const previous = state.activeContainerIdByWorktree[worktreeId] ?? null
  // Why: with no container the launch borrows the worktree's bare space (no active container).
  state.setActiveWorkspaceContainer(worktreeId, container ? container.id : null)
  try {
    launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      agent: request.agent,
      worktreeId,
      prompt: request.prompt,
      ...(agentArgs !== undefined ? { agentArgs } : {}),
      activate: false
    })
  } finally {
    useAppStore.getState().setActiveWorkspaceContainer(worktreeId, previous)
  }
}

export function installContainerAgentRequests(): () => void {
  const api = window.api?.workspaceContainers
  if (!api) {
    return () => {}
  }
  return api.onAgentRequest((request) => {
    if (request.kind === 'delete') {
      void useAppStore
        .getState()
        .removeWorkspaceContainer(request.containerId, { skipConfirm: true })
      return
    }
    void launchInContainer(request)
  })
}
