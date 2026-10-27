import type { ContainerAgentRequest } from '../../../shared/workspace-container-agent-request'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { useAppStore } from '.'

// Why the active container is borrowed: new tabs join the worktree's active container, so the
// launch targets the right one and the person's own selection is put back straight after.
function launchInContainer(request: Extract<ContainerAgentRequest, { kind: 'launch' }>): void {
  const state = useAppStore.getState()
  const container = request.containerId
    ? state.workspaceContainers.find((c) => c.id === request.containerId)
    : null
  const worktreeId = container ? container.worktreeId : request.worktreeId
  if (!worktreeId || (request.containerId && !container)) {
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
    launchInContainer(request)
  })
}
