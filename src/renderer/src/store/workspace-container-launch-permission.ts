import type { ContainerAgentRequest } from '../../../shared/workspace-container-agent-request'
import {
  composeLaunchArgs,
  translatePermissionArgs
} from '../../../shared/container-launch-permission'
import { isContainerLaunchAgent } from '../../../shared/workspace-container-agent-request'
import { YOLO_TUI_AGENT_ARGS } from '../../../shared/tui-agent-permissions'
import { useAppStore } from '.'

type LaunchRequest = Extract<ContainerAgentRequest, { kind: 'launch' }>

// The permission flags the starter was running with: read from its transcript (so a mode changed
// mid-session counts), falling back to the flags Orca recorded when it launched it.
async function starterPermission(tabId: string): Promise<{ agent: string; args: string } | null> {
  const state = useAppStore.getState()
  const entry = Object.entries(state.agentStatusByPaneKey).find(([paneKey]) =>
    paneKey.startsWith(`${tabId}:`)
  )?.[1]
  if (!entry?.agentType) {
    return null
  }
  const session = entry.providerSession
  const fromTranscript =
    session?.key === 'session_id'
      ? await window.api?.workspaceContainers
          ?.agentPermissionArgs(entry.agentType, session.id)
          .catch(() => null)
      : null
  const args = fromTranscript ?? state.getAgentLaunchConfigForStatusEntry(entry)?.agentArgs ?? null
  return args === null ? null : { agent: entry.agentType, args }
}

// The explicit launch arguments for a requested session, or undefined to use Orca's defaults
// (also when the starter's permission cannot be determined).
export async function launchArgsForRequest(request: LaunchRequest): Promise<string | undefined> {
  const mode = request.permission ?? 'inherit'
  const agent = request.agent
  const own = useAppStore.getState().settings?.agentDefaultArgs?.[agent]
  if (mode === 'default') {
    return undefined
  }
  if (mode === 'manual') {
    return composeLaunchArgs(agent, '', own)
  }
  if (mode === 'bypass') {
    const flag = YOLO_TUI_AGENT_ARGS[agent]
    return flag ? composeLaunchArgs(agent, flag, own) : undefined
  }
  const starter = request.requesterTabId ? await starterPermission(request.requesterTabId) : null
  if (!starter || !isContainerLaunchAgent(starter.agent)) {
    return undefined
  }
  return composeLaunchArgs(agent, translatePermissionArgs(starter.agent, agent, starter.args), own)
}
