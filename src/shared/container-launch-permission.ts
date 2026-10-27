import { agentArgsSetPermission } from './tui-agent-permission-lift'
import { YOLO_TUI_AGENT_ARGS } from './tui-agent-permissions'
import type { TuiAgent } from './tui-agent'

// How a session started by an agent gets its permissions: the starter's (`inherit`, the default),
// Orca's normal launch defaults, full bypass, or none (every action asks).
export const CONTAINER_LAUNCH_PERMISSIONS = ['inherit', 'default', 'bypass', 'manual'] as const
export type ContainerLaunchPermission = (typeof CONTAINER_LAUNCH_PERMISSIONS)[number]

export function isContainerLaunchPermission(value: unknown): value is ContainerLaunchPermission {
  return CONTAINER_LAUNCH_PERMISSIONS.some((p) => p === value)
}

// The permission flags the target agent should launch with, given the starter's. Another agent
// cannot take the starter's literal flags, so only the posture carries over: a bypass becomes the
// target's bypass, anything narrower becomes the target's normal prompting.
export function translatePermissionArgs(
  source: TuiAgent,
  target: TuiAgent,
  sourceArgs: string
): string {
  if (source === target) {
    return sourceArgs.trim()
  }
  const sourceBypass = YOLO_TUI_AGENT_ARGS[source]
  return sourceBypass && sourceArgs.includes(sourceBypass)
    ? (YOLO_TUI_AGENT_ARGS[target] ?? '')
    : ''
}

// Permission flags first, then the user's own default arguments unless they set permissions
// themselves (their flag would contradict the one chosen here).
export function composeLaunchArgs(
  agent: TuiAgent,
  permissionArgs: string,
  ownArgs: string | undefined
): string {
  const own = ownArgs?.trim() ?? ''
  const keptOwn = own && !agentArgsSetPermission(agent, own) ? own : ''
  return [permissionArgs, keptOwn].filter(Boolean).join(' ')
}
