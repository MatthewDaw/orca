import { existsSync, mkdirSync, watch, type FSWatcher } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'
import {
  isContainerLaunchAgent,
  type ContainerAgentRequest
} from '../../shared/workspace-container-agent-request'
import { isContainerWithin } from '../../shared/workspace-container-routing'
import type { WorkspaceContainerStore } from './workspace-container-store'

let watcher: FSWatcher | null = null

type BriefProposal =
  | { kind: 'text'; containerId: string; text: string; field: 'brief' | 'codeScope' }
  | {
      kind: 'child'
      containerId: string | null
      worktreeId?: string
      name: string
      focus: string
      requesterId?: string
    }
  | { kind: 'request'; request: ContainerAgentRequest; requesterId?: string }

const stringField = (value: object, key: string): string | undefined => {
  const field: unknown = Object.entries(value).find(([k]) => k === key)?.[1]
  return typeof field === 'string' ? field : undefined
}

function parseProposal(raw: string): BriefProposal | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const requesterId = stringField(value, 'requesterId')
      const containerId = stringField(value, 'containerId')
      const action = stringField(value, 'action')
      if (containerId && action === 'delete') {
        return { kind: 'request', request: { kind: 'delete', containerId }, requesterId }
      }
      const agent = stringField(value, 'agent')
      if (containerId && action === 'launch' && isContainerLaunchAgent(agent)) {
        return {
          kind: 'request',
          request: {
            kind: 'launch',
            containerId,
            agent,
            prompt: stringField(value, 'prompt') ?? ''
          },
          requesterId
        }
      }
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'createChild' in value &&
      value.createChild === true &&
      (stringField(value, 'containerId') || stringField(value, 'worktreeId')) &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      return {
        kind: 'child',
        containerId: stringField(value, 'containerId') ?? null,
        worktreeId: stringField(value, 'worktreeId'),
        name: value.name,
        focus: 'focus' in value && typeof value.focus === 'string' ? value.focus : '',
        requesterId: stringField(value, 'requesterId')
      }
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'containerId' in value &&
      typeof value.containerId === 'string' &&
      'text' in value &&
      typeof value.text === 'string'
    ) {
      return {
        kind: 'text',
        containerId: value.containerId,
        text: value.text,
        field: 'field' in value && value.field === 'codeScope' ? 'codeScope' : 'brief'
      }
    }
  } catch {
    // Malformed proposals are dropped below.
  }
  return null
}

async function drainInbox(
  store: WorkspaceContainerStore,
  onChanged: (catalog: WorkspaceContainerCatalog) => void,
  onRequest: (request: ContainerAgentRequest) => void
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
    if (proposal?.kind === 'request') {
      if (
        await mayActOn(
          store,
          proposal.requesterId,
          proposal.request.containerId,
          proposal.request.kind
        )
      ) {
        onRequest(proposal.request)
      }
    } else if (proposal) {
      // Why: a worktree-level create comes from a terminal in that worktree's own space, which owns every container on it.
      const allowed =
        proposal.kind !== 'child' ||
        proposal.containerId === null ||
        (await mayActOn(store, proposal.requesterId, proposal.containerId, 'create'))
      const result = !allowed
        ? { ok: false }
        : proposal.kind === 'child'
          ? await store.applyAgentChildCreate(
              proposal.containerId,
              proposal.name,
              proposal.focus,
              proposal.worktreeId
            )
          : proposal.field === 'codeScope'
            ? await store.applyAgentCodeScope(proposal.containerId, proposal.text)
            : await store.applyAgentBrief(proposal.containerId, proposal.text)
      applied ||= result.ok
    }
  }
  if (applied) {
    onChanged(await store.list())
  }
}

// Why: an agent reshapes only its own subtree (deleting never reaches itself or its ancestors);
// a request with no requester comes from a person's plain terminal and is trusted.
async function mayActOn(
  store: WorkspaceContainerStore,
  requesterId: string | undefined,
  targetId: string,
  action: 'create' | 'launch' | 'delete'
): Promise<boolean> {
  if (!requesterId) {
    return true
  }
  const catalog = await store.list()
  if (action === 'delete' && requesterId === targetId) {
    return false
  }
  return isContainerWithin(catalog, requesterId, targetId)
}

// Why a file inbox: the CLI has no RPC into the container store, and a direct catalog write would
// be overwritten by the app's cached copy, so agents drop a proposal here and the app applies it
// through the same size and cooldown policy as everything else.
export function startContainerBriefInbox(
  store: WorkspaceContainerStore,
  onChanged: (catalog: WorkspaceContainerCatalog) => void,
  onRequest: (request: ContainerAgentRequest) => void
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
      void drainInbox(store, onChanged, onRequest)
    }, 150)
  }
  watcher = watch(directory, schedule)
  schedule()
}
