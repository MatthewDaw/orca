import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import {
  canAdmitTerminalTabsForStartup,
  requestBackgroundTerminalWorktreeMount
} from '@/components/terminal/background-terminal-worktree-mount'
import { getSleepingRecordTabId } from '@/lib/sleeping-agent-wake-requests'
import { sendRuntimePtyInputVerified } from '@/runtime/runtime-terminal-verified-input'
import { restoreSleepingAgentPermissions } from './workspace-agent-permission-restore'
import { useAppStore } from '.'

// Gap between wakes: resuming every agent in one frame stalls the renderer and the agents' APIs.
const WAKE_SPACING_MS = 900
const READY_POLL_MS = 1000
const READY_TIMEOUT_MS = 90_000
const CONTINUE_MESSAGE =
  'Orca was restarted while you were in the middle of a task. Pick up exactly where you left off and keep going.'

type ResumePlanItem = { worktreeId: string; tabId: string; continueWork: boolean }

export function planAgentAutoResume(
  records: readonly SleepingAgentSessionRecord[]
): ResumePlanItem[] {
  const seen = new Set<string>()
  return records.flatMap((record) => {
    const tabId = getSleepingRecordTabId(record)
    // Why only quit/live: a worktree-sleep record is an agent the person put to sleep on purpose.
    // A quit record flagged tab-open-only is not that: it is an idle agent a previous restart left
    // unresumed, and skipping it would leave it waiting for a click forever.
    const wasRunning = record.origin === 'quit' || record.origin === 'live'
    if (!tabId || !wasRunning || seen.has(tabId)) {
      return []
    }
    seen.add(tabId)
    // Why: an agent that was idle comes back open and idle; only one cut off mid-task is told to go on.
    return [{ worktreeId: record.worktreeId, tabId, continueWork: record.state === 'working' }]
  })
}

// The resumed agent only accepts a prompt once its TUI is up and its hooks report it at rest.
async function continueWhenReady(tabId: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
    const state = useAppStore.getState()
    const ptyId = state.ptyIdsByTabId[tabId]?.[0]
    const row = Object.entries(state.agentStatusByPaneKey).find(([paneKey]) =>
      paneKey.startsWith(`${tabId}:`)
    )?.[1]
    if (ptyId && row && row.state !== 'working') {
      if (await sendRuntimePtyInputVerified(ptyId, CONTINUE_MESSAGE, 'driving')) {
        setTimeout(() => void sendRuntimePtyInputVerified(ptyId, '\r', 'driving'), 250)
      }
      return
    }
  }
}

// Every other terminal tab (an agent whose resume record was lost, or a plain shell) is mounted
// too, so a restart restores all sessions without anyone clicking through containers. Tabs of an
// agent the person put to sleep on purpose stay asleep.
export function planRemainingTabs(
  tabsByWorktree: Readonly<Record<string, readonly { id: string }[] | undefined>>,
  records: readonly SleepingAgentSessionRecord[],
  handledTabIds: ReadonlySet<string>
): { worktreeId: string; tabIds: string[] }[] {
  const asleepOnPurpose = new Set(
    records.filter((r) => r.origin === 'worktree-sleep').map(getSleepingRecordTabId)
  )
  return Object.entries(tabsByWorktree).flatMap(([worktreeId, tabs]) => {
    const tabIds = (tabs ?? [])
      .map((tab) => tab.id)
      .filter((id) => !handledTabIds.has(id) && !asleepOnPurpose.has(id))
    return tabIds.length > 0 ? [{ worktreeId, tabIds }] : []
  })
}

async function resumeAll(): Promise<void> {
  // Why first: a resume reads its permission flags from the record, so they must be attached before any wake.
  await restoreSleepingAgentPermissions()
  const records = Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey)
  const plan = planAgentAutoResume(records)
  for (const { worktreeId, tabId, continueWork } of plan) {
    const stillThere = useAppStore
      .getState()
      .tabsByWorktree[worktreeId]?.some((tab) => tab.id === tabId)
    if (!stillThere) {
      continue
    }
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tabId] })
    if (continueWork) {
      void continueWhenReady(tabId)
    }
    await new Promise((resolve) => setTimeout(resolve, WAKE_SPACING_MS))
  }
  const remaining = planRemainingTabs(
    useAppStore.getState().tabsByWorktree,
    records,
    new Set(plan.map((item) => item.tabId))
  )
  for (const { worktreeId, tabIds } of remaining) {
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds })
    await new Promise((resolve) => setTimeout(resolve, WAKE_SPACING_MS))
  }
}

// Why: Orca holds a restored agent until its pane is first shown, so after a restart every agent
// but the visible one sat idle until clicked. This wakes them all once, after startup restoration
// has published PTY ownership.
export function installAgentAutoResume(): () => void {
  let started = false
  const maybeStart = (): void => {
    const s = useAppStore.getState()
    if (
      started ||
      !canAdmitTerminalTabsForStartup({
        workspaceSessionReady: s.workspaceSessionReady,
        hydrationSucceeded: s.hydrationSucceeded,
        startupWorktreeRefreshCompleted: s.startupWorktreeRefreshCompleted
      })
    ) {
      return
    }
    started = true
    void resumeAll()
  }
  maybeStart()
  return useAppStore.subscribe(maybeStart)
}
