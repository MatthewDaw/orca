import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  checkAgentBriefUpdate,
  checkCodeScopeUpdate
} from '../../shared/workspace-container-brief-policy'
import {
  assignTabsToContainer,
  createContainer,
  importContainers,
  removeContainer,
  removeTabFromContainers,
  removeWorktreeContainers,
  renderContainerContextPage,
  updateContainer
} from '../../shared/workspace-container-catalog'
import {
  EMPTY_WORKSPACE_CONTAINER_CATALOG,
  type WorkspaceContainer,
  type WorkspaceContainerCatalog,
  type WorkspaceContainerCreateInput,
  type WorkspaceContainerPatch
} from '../../shared/workspace-container-types'

const MAX_CHILD_NAME_CHARS = 60
const MAX_AGENT_CHILDREN = 12

export function getWorkspaceContainerDirectory(home: string = homedir()): string {
  return join(home, '.orca', 'containers')
}

export class WorkspaceContainerStore {
  private catalog: WorkspaceContainerCatalog | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly directory: string = getWorkspaceContainerDirectory()) {}

  getContextPagePath(containerId: string): string {
    return join(this.directory, 'pages', `${containerId}.md`)
  }

  async list(): Promise<WorkspaceContainerCatalog> {
    return this.load()
  }

  async create(input: WorkspaceContainerCreateInput): Promise<WorkspaceContainer> {
    const id = randomUUID()
    const next = await this.mutate((catalog) => createContainer(catalog, input, id, Date.now()))
    return next.containers.find((c) => c.id === id)!
  }

  async update(id: string, patch: WorkspaceContainerPatch): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => updateContainer(catalog, id, patch, Date.now()))
  }

  // Agent-proposed brief rewrite; refused (with the reason) when too large or too soon.
  async applyAgentBrief(
    id: string,
    text: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const target = (await this.load()).containers.find((c) => c.id === id)
    if (!target) {
      return { ok: false, reason: 'Unknown container.' }
    }
    const now = Date.now()
    const check = checkAgentBriefUpdate(target, text, now)
    if (!check.ok) {
      return check
    }
    await this.mutate((catalog) => ({
      ...catalog,
      containers: catalog.containers.map((c) =>
        c.id === id ? { ...c, brief: text.trim(), briefAgentUpdatedAt: now, updatedAt: now } : c
      )
    }))
    return { ok: true }
  }

  async applyAgentCodeScope(
    id: string,
    text: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const target = (await this.load()).containers.find((c) => c.id === id)
    if (!target) {
      return { ok: false, reason: 'Unknown container.' }
    }
    const check = checkCodeScopeUpdate(target, text)
    if (!check.ok) {
      return check
    }
    const now = Date.now()
    await this.mutate((catalog) => ({
      ...catalog,
      containers: catalog.containers.map((c) =>
        c.id === id ? { ...c, codeScope: text.trim(), updatedAt: now } : c
      )
    }))
    return { ok: true }
  }

  // Agent-requested child container; it lives on the parent's worktree and cannot duplicate a sibling's name.
  async applyAgentChildCreate(
    parentId: string,
    name: string,
    focus: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const catalog = await this.load()
    const parent = catalog.containers.find((c) => c.id === parentId)
    const trimmed = name.trim()
    if (!parent) {
      return { ok: false, reason: 'Unknown parent container.' }
    }
    if (!trimmed || trimmed.length > MAX_CHILD_NAME_CHARS) {
      return { ok: false, reason: `Name must be 1-${MAX_CHILD_NAME_CHARS} characters.` }
    }
    const siblings = catalog.containers.filter((c) => c.parentContainerId === parentId)
    if (siblings.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: `"${parent.name}" already has a child named "${trimmed}".` }
    }
    if (siblings.length >= MAX_AGENT_CHILDREN) {
      return { ok: false, reason: `"${parent.name}" already has ${MAX_AGENT_CHILDREN} children.` }
    }
    const id = randomUUID()
    const now = Date.now()
    await this.mutate((current) => {
      const created = createContainer(
        current,
        { worktreeId: parent.worktreeId, name: trimmed, parentContainerId: parentId },
        id,
        now
      )
      return focus.trim() ? updateContainer(created, id, { focus: focus.trim() }, now) : created
    })
    return { ok: true }
  }

  getInboxDirectory(): string {
    return join(this.directory, 'inbox')
  }

  async assignTabs(id: string, tabIds: string[]): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => assignTabsToContainer(catalog, id, tabIds, Date.now()))
  }

  async importContainers(containers: WorkspaceContainer[]): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => importContainers(catalog, containers))
  }

  async remove(id: string): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => removeContainer(catalog, id))
  }

  async releaseTab(tabId: string): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => removeTabFromContainers(catalog, tabId))
  }

  async removeWorktree(worktreeId: string): Promise<WorkspaceContainerCatalog> {
    return this.mutate((catalog) => removeWorktreeContainers(catalog, worktreeId))
  }

  private async load(): Promise<WorkspaceContainerCatalog> {
    if (this.catalog) {
      return this.catalog
    }
    try {
      const parsed: unknown = JSON.parse(await readFile(this.catalogPath(), 'utf8'))
      this.catalog = isCatalog(parsed) ? parsed : EMPTY_WORKSPACE_CONTAINER_CATALOG
    } catch {
      this.catalog = EMPTY_WORKSPACE_CONTAINER_CATALOG
    }
    return this.catalog
  }

  private mutate(
    apply: (catalog: WorkspaceContainerCatalog) => WorkspaceContainerCatalog
  ): Promise<WorkspaceContainerCatalog> {
    const run = this.writeChain.then(async () => {
      const next = apply(await this.load())
      if (next !== this.catalog) {
        await this.persist(next)
        this.catalog = next
      }
      return next
    })
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async persist(catalog: WorkspaceContainerCatalog): Promise<void> {
    const pagesDirectory = join(this.directory, 'pages')
    await mkdir(pagesDirectory, { recursive: true })
    const livePages = new Set<string>()
    for (const container of catalog.containers) {
      livePages.add(`${container.id}.md`)
      await writeFile(
        this.getContextPagePath(container.id),
        renderContainerContextPage(container, catalog)
      )
    }
    for (const file of await readdir(pagesDirectory)) {
      if (file.endsWith('.md') && !livePages.has(file)) {
        await rm(join(pagesDirectory, file), { force: true })
      }
    }
    // Rename keeps a crash mid-write from leaving a truncated catalog.
    const temporaryPath = `${this.catalogPath()}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(catalog, null, 2))
    await rename(temporaryPath, this.catalogPath())
  }

  private catalogPath(): string {
    return join(this.directory, 'catalog.json')
  }
}

function isCatalog(value: unknown): value is WorkspaceContainerCatalog {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'containers' in value &&
    Array.isArray(value.containers)
  )
}
