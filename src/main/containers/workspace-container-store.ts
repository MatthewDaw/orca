import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createContainer,
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
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { containers?: unknown }).containers)
  )
}
