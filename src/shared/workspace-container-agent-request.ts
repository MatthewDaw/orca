export const CONTAINER_LAUNCH_AGENTS = ['claude', 'codex'] as const
export type ContainerLaunchAgent = (typeof CONTAINER_LAUNCH_AGENTS)[number]

// Requests agents make through the CLI that only the renderer can carry out (it owns tabs and terminals).
export type ContainerAgentRequest =
  | { kind: 'delete'; containerId: string }
  | { kind: 'launch'; containerId: string; agent: ContainerLaunchAgent; prompt: string }

export function isContainerLaunchAgent(value: unknown): value is ContainerLaunchAgent {
  return CONTAINER_LAUNCH_AGENTS.some((agent) => agent === value)
}
