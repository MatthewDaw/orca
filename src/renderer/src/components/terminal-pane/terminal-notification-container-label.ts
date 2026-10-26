import { containerOfPane } from '../sidebar/workspace-container-unread'
import { describeContainerPath } from '../../../../shared/workspace-container-routing'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

// Names the container an agent finished in, so a notification says which of several agents on a
// worktree is done.
export function withContainerInLabel<T extends { worktreeLabel: string }>(
  labels: T,
  state: { workspaceContainers?: readonly WorkspaceContainer[] },
  paneKey: string | null | undefined
): T {
  const containers = state.workspaceContainers ?? []
  const container = paneKey ? containerOfPane(containers, paneKey) : undefined
  if (!container) {
    return labels
  }
  const path = describeContainerPath({ version: 1, containers: [...containers] }, container)
  return { ...labels, worktreeLabel: path.replaceAll(' › ', ' / ') }
}
