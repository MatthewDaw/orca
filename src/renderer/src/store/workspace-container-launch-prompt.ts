import {
  describeContainerPath,
  inheritedBriefs,
  inheritedCodeScopes
} from '../../../shared/workspace-container-routing'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'

// Agents only learn their container role if told. A launch gets the instruction only when it
// has something to read — shared scope or a brief inherited from a parent — or when it is a
// parent itself and so owns a brief it has to keep small.
export function withContainerContextInstruction(
  prompt: string,
  container: WorkspaceContainer | null,
  containers: readonly WorkspaceContainer[]
): string {
  if (!container) {
    return prompt
  }
  const catalog = { version: 1 as const, containers: [...containers] }
  const inherits =
    inheritedBriefs(catalog, container).some((b) => b.container.id !== container.id) ||
    inheritedCodeScopes(catalog, container).some((s) => s.container.id !== container.id)
  const isParent = containers.some((c) => c.parentContainerId === container.id)
  if (!inherits && !isParent) {
    return prompt
  }
  const instruction = [
    `You are working inside the Orca container "${describeContainerPath(catalog, container)}".`,
    'Before anything else, run `orca container context` and follow it.',
    inherits ? 'It holds the code scope and briefing your parent containers set for you.' : '',
    isParent
      ? 'It also tells you how to keep your own brief for nested containers short and slow-changing.'
      : ''
  ]
    .filter(Boolean)
    .join(' ')
  return prompt ? `${instruction}\n\n${prompt}` : instruction
}

type ContainerLaunchState = {
  workspaceContainers?: readonly WorkspaceContainer[]
  activeContainerIdByWorktree?: Readonly<Record<string, string | null>>
}

export function promptWithContainerContext(
  state: ContainerLaunchState,
  worktreeId: string,
  prompt: string
): string {
  const containers = state.workspaceContainers ?? []
  const activeId = state.activeContainerIdByWorktree?.[worktreeId]
  return withContainerContextInstruction(
    prompt,
    containers.find((c) => c.id === activeId) ?? null,
    containers
  )
}
