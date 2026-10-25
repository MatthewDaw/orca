import { existsSync, mkdirSync, watch, type FSWatcher } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'
import type { WorkspaceContainerStore } from './workspace-container-store'

let watcher: FSWatcher | null = null

type BriefProposal = { containerId: string; text: string }

function parseProposal(raw: string): BriefProposal | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'containerId' in value &&
      typeof value.containerId === 'string' &&
      'text' in value &&
      typeof value.text === 'string'
    ) {
      return { containerId: value.containerId, text: value.text }
    }
  } catch {
    // Malformed proposals are dropped below.
  }
  return null
}

async function drainInbox(
  store: WorkspaceContainerStore,
  onChanged: (catalog: WorkspaceContainerCatalog) => void
): Promise<void> {
  const directory = store.getInboxDirectory()
  let applied = false
  for (const file of await readdir(directory).catch(() => [])) {
    if (!file.endsWith('.json')) {
      continue
    }
    const path = join(directory, file)
    const proposal = parseProposal(await readFile(path, 'utf8').catch(() => ''))
    await rm(path, { force: true })
    if (proposal && (await store.applyAgentBrief(proposal.containerId, proposal.text)).ok) {
      applied = true
    }
  }
  if (applied) {
    onChanged(await store.list())
  }
}

// Why a file inbox: the CLI has no RPC into the container store, and a direct catalog write would
// be overwritten by the app's cached copy, so agents drop a proposal here and the app applies it
// through the same size and cooldown policy as everything else.
export function startContainerBriefInbox(
  store: WorkspaceContainerStore,
  onChanged: (catalog: WorkspaceContainerCatalog) => void
): void {
  if (watcher) {
    return
  }
  const directory = store.getInboxDirectory()
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  let pending: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    pending ??= setTimeout(() => {
      pending = null
      void drainInbox(store, onChanged)
    }, 150)
  }
  watcher = watch(directory, schedule)
  schedule()
}
