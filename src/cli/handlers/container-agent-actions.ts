import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'
import { isContainerLaunchAgent } from '../../shared/workspace-container-agent-request'
import {
  describeContainerPath,
  isContainerWithin,
  resolveContainerRef
} from '../../shared/workspace-container-routing'
import type { HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { containerDirectory, readCatalog } from './container-catalog-file'

export async function createChildContainer(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const parentRef = getOptionalStringFlag(ctx.flags, 'parent') ?? process.env.ORCA_CONTAINER_ID
  const resolved = parentRef ? resolveContainerRef(catalog, parentRef) : null
  if (!resolved?.container) {
    throw new RuntimeClientError(
      'selector_not_found',
      'This terminal is not in a container. Pass --parent <container>.'
    )
  }
  const parent = resolved.container
  const name = getRequiredStringFlag(ctx.flags, 'name').trim()
  const taken = catalog.containers.some(
    (c) => c.parentContainerId === parent.id && c.name.toLowerCase() === name.toLowerCase()
  )
  if (!name || taken) {
    throw new RuntimeClientError(
      'invalid_argument',
      taken
        ? `"${describeContainerPath(catalog, parent)}" already has a child named "${name}".`
        : 'A name is required.'
    )
  }
  const inbox = join(containerDirectory(), 'inbox')
  await mkdir(inbox, { recursive: true })
  await writeFile(
    join(inbox, `${randomUUID()}.json`),
    JSON.stringify({
      createChild: true,
      requesterId: process.env.ORCA_CONTAINER_ID,
      containerId: parent.id,
      name,
      focus: getOptionalStringFlag(ctx.flags, 'focus') ?? ''
    })
  )
  console.log(
    `Requested a child container "${name}" under ${describeContainerPath(catalog, parent)}; Orca will create it within a moment. Reach it with \`orca container message --to "${describeContainerPath(catalog, parent)}/${name}"\` once someone opens an agent there.`
  )
}

function requireContainer(
  catalog: WorkspaceContainerCatalog,
  ref: string | undefined,
  flag: string
): WorkspaceContainerCatalog['containers'][number] {
  const resolved = ref ? resolveContainerRef(catalog, ref) : null
  if (!resolved?.container) {
    throw new RuntimeClientError(
      resolved && resolved.candidates.length > 0 ? 'invalid_argument' : 'selector_not_found',
      ref
        ? `"${ref}" does not name exactly one container. Run \`orca container list\` and use the full path or id.`
        : `Pass ${flag} <container>.`
    )
  }
  return resolved.container
}

async function dropAgentRequest(payload: Record<string, unknown>): Promise<void> {
  const inbox = join(containerDirectory(), 'inbox')
  await mkdir(inbox, { recursive: true })
  await writeFile(join(inbox, `${randomUUID()}.json`), JSON.stringify(payload))
}

export async function deleteContainer(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const target = requireContainer(
    catalog,
    getOptionalStringFlag(ctx.flags, 'container'),
    '--container'
  )
  const requesterId = process.env.ORCA_CONTAINER_ID
  if (requesterId && !isContainerWithin(catalog, requesterId, target.id)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'You can only delete containers nested under your own.'
    )
  }
  if (requesterId === target.id) {
    throw new RuntimeClientError('invalid_argument', 'A container cannot delete itself.')
  }
  await dropAgentRequest({ action: 'delete', containerId: target.id, requesterId })
  console.log(
    `Requested deletion of ${describeContainerPath(catalog, target)}. Its open tabs and agent sessions will be closed and any containers nested in it move up a level.`
  )
}

export async function launchContainerAgent(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const requesterId = process.env.ORCA_CONTAINER_ID
  const target = requireContainer(
    catalog,
    getOptionalStringFlag(ctx.flags, 'container') ?? requesterId,
    '--container'
  )
  const agent = getRequiredStringFlag(ctx.flags, 'agent')
  if (!isContainerLaunchAgent(agent)) {
    throw new RuntimeClientError('invalid_argument', '--agent must be "claude" or "codex".')
  }
  if (requesterId && !isContainerWithin(catalog, requesterId, target.id)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'You can only start sessions in your own container or ones nested under it.'
    )
  }
  await dropAgentRequest({
    action: 'launch',
    containerId: target.id,
    agent,
    prompt: getOptionalStringFlag(ctx.flags, 'prompt') ?? '',
    requesterId
  })
  console.log(
    `Requested a new ${agent} session in ${describeContainerPath(catalog, target)}. Once it is up, reach it with \`orca container message --to "${describeContainerPath(catalog, target)}"\`.`
  )
}
