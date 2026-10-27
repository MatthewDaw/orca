import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { useAppStore } from '.'

const looked = new Set<string>()

// Why: a session started by hand (or before Orca recorded launch flags) has no launch config, so
// it would resume with no permission flags. The agent's own transcript knows the permission it ran
// with, so each such record gets it attached before anything resumes.
export function needsPermissionLookup(record: SleepingAgentSessionRecord): boolean {
  return (
    !record.launchConfig &&
    (record.agent === 'claude' || record.agent === 'codex') &&
    record.providerSession.key === 'session_id'
  )
}

export async function restoreSleepingAgentPermissions(): Promise<void> {
  const api = window.api?.workspaceContainers
  if (!api) {
    return
  }
  const records = Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey).filter(
    (record) => needsPermissionLookup(record) && !looked.has(record.paneKey)
  )
  const found = await Promise.all(
    records.map(async (record) => {
      looked.add(record.paneKey)
      const args = await api
        .agentPermissionArgs(record.agent, record.providerSession.id)
        .catch(() => null)
      return args ? ([record.paneKey, args] as const) : null
    })
  )
  const updates = found.filter((entry) => entry !== null)
  if (updates.length === 0) {
    return
  }
  useAppStore.setState((state) => {
    const next = { ...state.sleepingAgentSessionsByPaneKey }
    for (const [paneKey, agentArgs] of updates) {
      const record = next[paneKey]
      if (record && !record.launchConfig) {
        next[paneKey] = { ...record, launchConfig: { agentArgs, agentEnv: {} } }
      }
    }
    return { sleepingAgentSessionsByPaneKey: next }
  })
}

// Records are looked up as they appear (startup restore, new live checkpoints), so by the next
// restart every running agent already carries the permission it was using.
export function installAgentPermissionRestore(): () => void {
  let pending = false
  const run = (): void => {
    if (pending) {
      return
    }
    pending = true
    void restoreSleepingAgentPermissions().finally(() => {
      pending = false
    })
  }
  run()
  return useAppStore.subscribe((state, previous) => {
    if (state.sleepingAgentSessionsByPaneKey !== previous.sleepingAgentSessionsByPaneKey) {
      run()
    }
  })
}
