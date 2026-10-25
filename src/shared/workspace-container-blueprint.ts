import type { WorkspaceContainer, WorkspaceContainerConnection } from './workspace-container-types'

export const CONTAINER_BLUEPRINT_RELATIVE_PATH = '.orca/containers.json'
export const MAIN_WORKTREE_REF = 'main'

export type WorkspaceContainerBlueprintEntry = {
  id: string
  name: string
  /** `main` or a branch name; resolved to a worktree id when the project is opened. */
  worktree: string
  parentId: string | null
  focus: string
  codeScope?: string
  connections: WorkspaceContainerConnection[]
  position: { x: number; y: number }
}

export type WorkspaceContainerBlueprint = {
  version: 1
  containers: WorkspaceContainerBlueprintEntry[]
}

// Worktree ids and tab ids are local to one machine, so a blueprint keeps only what describes the structure.
export function buildContainerBlueprint(
  containers: readonly WorkspaceContainer[],
  worktreeRefOf: (worktreeId: string) => string | null
): WorkspaceContainerBlueprint {
  const entries: WorkspaceContainerBlueprintEntry[] = []
  for (const container of containers) {
    const worktree = worktreeRefOf(container.worktreeId)
    if (worktree) {
      entries.push({
        id: container.id,
        name: container.name,
        worktree,
        parentId: container.parentContainerId,
        focus: container.focus,
        ...(container.codeScope?.trim() ? { codeScope: container.codeScope } : {}),
        connections: container.connections,
        position: container.position
      })
    }
  }
  return { version: 1, containers: entries }
}

export function serializeContainerBlueprint(blueprint: WorkspaceContainerBlueprint): string {
  return `${JSON.stringify(blueprint, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseConnection(value: unknown): WorkspaceContainerConnection | null {
  if (!isRecord(value) || typeof value.targetContainerId !== 'string') {
    return null
  }
  return {
    targetContainerId: value.targetContainerId,
    description: typeof value.description === 'string' ? value.description : ''
  }
}

function parseEntry(value: unknown): WorkspaceContainerBlueprintEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null
  }
  const position = isRecord(value.position) ? value.position : {}
  return {
    id: value.id,
    name: value.name,
    worktree: typeof value.worktree === 'string' ? value.worktree : MAIN_WORKTREE_REF,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    focus: typeof value.focus === 'string' ? value.focus : '',
    ...(typeof value.codeScope === 'string' && value.codeScope.trim()
      ? { codeScope: value.codeScope }
      : {}),
    connections: Array.isArray(value.connections)
      ? value.connections.map(parseConnection).filter((c) => c !== null)
      : [],
    position: {
      x: typeof position.x === 'number' ? position.x : 0,
      y: typeof position.y === 'number' ? position.y : 0
    }
  }
}

export function parseContainerBlueprint(raw: string): WorkspaceContainerBlueprint | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.containers)) {
    return null
  }
  const seen = new Set<string>()
  const containers = value.containers
    .map(parseEntry)
    .filter((entry) => entry !== null)
    .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
  return { version: 1, containers }
}

// Unknown parents or connection targets are dropped so a hand-edited file cannot corrupt the catalog.
export function blueprintToContainers(
  blueprint: WorkspaceContainerBlueprint,
  resolveWorktreeId: (worktreeRef: string) => string | null,
  now: number
): WorkspaceContainer[] {
  const ids = new Set(blueprint.containers.map((entry) => entry.id))
  const containers: WorkspaceContainer[] = []
  for (const entry of blueprint.containers) {
    const worktreeId = resolveWorktreeId(entry.worktree)
    if (!worktreeId) {
      continue
    }
    containers.push({
      id: entry.id,
      worktreeId,
      name: entry.name,
      parentContainerId: entry.parentId && ids.has(entry.parentId) ? entry.parentId : null,
      tabIds: [],
      focus: entry.focus,
      ...(entry.codeScope ? { codeScope: entry.codeScope } : {}),
      connections: entry.connections.filter((c) => ids.has(c.targetContainerId)),
      position: entry.position,
      createdAt: now,
      updatedAt: now
    })
  }
  return containers
}
