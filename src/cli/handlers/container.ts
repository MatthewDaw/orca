import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

const containerDirectory = (): string => join(homedir(), '.orca', 'containers')

async function readCatalog(): Promise<WorkspaceContainerCatalog> {
  try {
    return JSON.parse(await readFile(join(containerDirectory(), 'catalog.json'), 'utf8'))
  } catch {
    return { version: 1, containers: [] }
  }
}

async function listContainers(ctx: HandlerContext): Promise<void> {
  const { containers } = await readCatalog()
  if (ctx.json) {
    console.log(JSON.stringify({ containers }, null, 2))
    return
  }
  if (containers.length === 0) {
    console.log('No containers.')
    return
  }
  for (const container of containers) {
    console.log(`${container.name}\t${container.worktreeId}\t${container.tabIds.length} tabs`)
  }
}

async function printContext(ctx: HandlerContext): Promise<void> {
  const name = getOptionalStringFlag(ctx.flags, 'name')
  let pagePath = name ? undefined : process.env.ORCA_CONTAINER_CONTEXT
  if (name) {
    const wanted = name.toLowerCase()
    const matches = (await readCatalog()).containers.filter((c) => c.name.toLowerCase() === wanted)
    if (matches.length > 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        `More than one container is named "${name}". Rename one so the name is unique.`
      )
    }
    pagePath = matches[0] && join(containerDirectory(), 'pages', `${matches[0].id}.md`)
  }
  if (!pagePath) {
    throw new RuntimeClientError(
      'selector_not_found',
      name
        ? `No container named "${name}".`
        : 'This terminal is not in a container. Pass --name <container>.'
    )
  }
  const page = await readFile(pagePath, 'utf8').catch(() => {
    throw new RuntimeClientError('selector_not_found', `Context page not found at ${pagePath}.`)
  })
  console.log(ctx.json ? JSON.stringify({ path: pagePath, page }, null, 2) : page)
}

export const CONTAINER_HANDLERS: Record<string, CommandHandler> = {
  'container list': listContainers,
  'container context': printContext
}
