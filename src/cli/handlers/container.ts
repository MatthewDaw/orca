import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  BRIEF_MAX_CHARS,
  checkAgentBriefUpdate,
  checkCodeScopeUpdate,
  CODE_SCOPE_MAX_CHARS
} from '../../shared/workspace-container-brief-policy'
import type { RuntimeTerminalListResult } from '../../shared/runtime-terminal-contracts'
import {
  describeContainerPath,
  formatContainerMessage,
  MAX_CONTAINER_EXCHANGES,
  pickTargetTerminal,
  resolveContainerRef
} from '../../shared/workspace-container-routing'
import { containerDirectory, readCatalog } from './container-catalog-file'
import {
  closeContainerAgent,
  createChildContainer,
  deleteContainer,
  launchContainerAgent,
  listContainerAgents
} from './container-agent-actions'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

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
    console.log(`${describeContainerPath({ version: 1, containers }, container)}\t${container.id}`)
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

async function sendContainerMessage(ctx: HandlerContext): Promise<void> {
  const exchange = Number.parseInt(getOptionalStringFlag(ctx.flags, 'exchange') ?? '1', 10)
  if (!Number.isInteger(exchange) || exchange < 1) {
    throw new RuntimeClientError('invalid_argument', '--exchange must be a positive integer.')
  }
  if (exchange > MAX_CONTAINER_EXCHANGES) {
    throw new RuntimeClientError(
      'invalid_argument',
      `This conversation has reached ${MAX_CONTAINER_EXCHANGES} automatic exchanges. Stop messaging the other container and summarize where things stand for the user.`
    )
  }
  const catalog = await readCatalog()
  const toRef = getRequiredStringFlag(ctx.flags, 'to')
  const target = resolveContainerRef(catalog, toRef)
  if (!target.container) {
    const options = target.candidates.map(
      (c) => `  - ${describeContainerPath(catalog, c)} (id ${c.id})`
    )
    throw new RuntimeClientError(
      target.candidates.length > 0 ? 'invalid_argument' : 'selector_not_found',
      target.candidates.length > 0
        ? `"${toRef}" matches several containers; use the full path or id:\n${options.join('\n')}`
        : `No container matches "${toRef}". Run \`orca container list\` for the current names.`
    )
  }
  const senderRef = getOptionalStringFlag(ctx.flags, 'from') ?? process.env.ORCA_CONTAINER_ID
  const sender = senderRef ? resolveContainerRef(catalog, senderRef).container : null
  const listed = await ctx.client.call<RuntimeTerminalListResult>('terminal.list', {
    worktree: `id:${target.container.worktreeId}`,
    includeVisualLayouts: false
  })
  const terminal = pickTargetTerminal(
    listed.result.terminals,
    target.container,
    getOptionalStringFlag(ctx.flags, 'agent')
  )
  const targetPath = describeContainerPath(catalog, target.container)
  if (!terminal) {
    throw new RuntimeClientError(
      'selector_not_found',
      `"${targetPath}" has no open terminal to receive the message. Open an agent in that container first.`
    )
  }
  const sent = await ctx.client.call<{ send: { accepted: boolean; queued?: true } }>(
    'terminal.send',
    {
      terminal: terminal.handle,
      text: formatContainerMessage(
        catalog,
        sender,
        getRequiredStringFlag(ctx.flags, 'text'),
        exchange
      ),
      enter: true,
      interrupt: false,
      // Why: never type into a person's half-written message; it waits until they send or clear it.
      deferWhileUserTyping: true,
      client: { id: 'orca-cli', type: 'desktop' }
    }
  )
  if (ctx.json) {
    console.log(
      JSON.stringify({
        to: targetPath,
        terminal: terminal.handle,
        accepted: sent.result.send.accepted,
        queued: sent.result.send.queued === true
      })
    )
  } else {
    console.log(
      sent.result.send.queued
        ? `Queued for ${targetPath}: a person is mid-message there, so it will be typed in once they send or clear it.`
        : `Sent to ${targetPath} (${terminal.agentIdentity ?? 'terminal'} ${terminal.handle}).`
    )
  }
  if (!sent.result.send.accepted) {
    process.exitCode = 1
  }
}

async function showOrSetContainerText(
  ctx: HandlerContext,
  field: 'brief' | 'codeScope'
): Promise<void> {
  const catalog = await readCatalog()
  const ref = getOptionalStringFlag(ctx.flags, 'container') ?? process.env.ORCA_CONTAINER_ID
  const resolved = ref ? resolveContainerRef(catalog, ref) : null
  if (!resolved?.container) {
    throw new RuntimeClientError(
      'selector_not_found',
      'This terminal is not in a container. Pass --container <container>.'
    )
  }
  const container = resolved.container
  const label = field === 'brief' ? 'brief' : 'scope'
  const limit = field === 'brief' ? BRIEF_MAX_CHARS : CODE_SCOPE_MAX_CHARS
  const text = getOptionalStringFlag(ctx.flags, 'set')
  if (text === undefined) {
    const current = (container[field] ?? '').trim()
    console.log(
      current ? `${current}\n\n(${current.length}/${limit} characters)` : `_No ${label} set._`
    )
    return
  }
  const check =
    field === 'brief'
      ? checkAgentBriefUpdate(container, text, Date.now())
      : checkCodeScopeUpdate(container, text)
  if (!check.ok) {
    throw new RuntimeClientError('invalid_argument', check.reason)
  }
  const inbox = join(containerDirectory(), 'inbox')
  await mkdir(inbox, { recursive: true })
  await writeFile(
    join(inbox, `${randomUUID()}.json`),
    JSON.stringify({ containerId: container.id, text, field })
  )
  console.log(
    `The ${label} for ${describeContainerPath(catalog, container)} was submitted and Orca will apply it within a moment.`
  )
}

export const CONTAINER_HANDLERS: Record<string, CommandHandler> = {
  'container list': listContainers,
  'container context': printContext,
  'container message': sendContainerMessage,
  'container create': createChildContainer,
  'container agents': listContainerAgents,
  'container close-agent': closeContainerAgent,
  'container rm': deleteContainer,
  'container launch': launchContainerAgent,
  'container brief': (ctx) => showOrSetContainerText(ctx, 'brief'),
  'container scope': (ctx) => showOrSetContainerText(ctx, 'codeScope')
}
