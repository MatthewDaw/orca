import type { TuiAgent } from './tui-agent'
import { ALL_TUI_AGENTS } from './tui-agent-display-names'

export type ContainerLaunchAgent = TuiAgent

// Requests agents make through the CLI that only the renderer can carry out (it owns tabs and terminals).
export type ContainerAgentRequest =
  | { kind: 'delete'; containerId: string }
  // A launch targets a container, or with no container id the bare space of a worktree.
  | {
      kind: 'launch'
      containerId: string | null
      worktreeId?: string
      agent: ContainerLaunchAgent
      prompt: string
    }

export function isContainerLaunchAgent(value: unknown): value is ContainerLaunchAgent {
  return ALL_TUI_AGENTS.some((agent) => agent === value)
}
