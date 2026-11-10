import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { DEFAULT_PROMPT_OBSERVE_MS } from './agent-prompt-delivery-check'
import { reportContainerMessageDelivery } from './container-message-delivery'
import type { RuntimeTerminalSend } from '../../shared/runtime-types'
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
  matchWorktreeTerminalsByHint,
  rankTargetTerminals,
  resolveContainerRef
} from '../../shared/workspace-container-routing'
import { containerDirectory, readCatalog } from './container-catalog-file'
import {
  callerWorktreeSpace,
  isWorktreeSpaceId,
  resolveWorktreeSpace
} from './container-worktree-space'
import {
  closeContainerAgent,
  createChildContainer,
  deleteContainer,
  dropAgentRequest,
  launchContainerAgent,
  listContainerAgents
} from './container-agent-actions'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

async function listContainers(ctx: HandlerContext): Promise<void> {
  const catalog = await readCatalog()
  const { containers } = catalog
  // Why: a terminal outside every container still sits in its worktree's own space, which is a
  // valid place to launch and message from, so the list must not read as "nothing here".
  const ownSpace = await callerWorktreeSpace(ctx, catalog).catch(() => null)
  if (ctx.json) {
    console.log(JSON.stringify({ containers, ownSpace }, null, 2))
    return
  }
  for (const container of containers) {
    console.log(`${describeContainerPath({ version: 1, containers }, container)}\t${container.id}`)
  }
  if (ownSpace && !containers.some((c) => c.id === process.env.ORCA_CONTAINER_ID)) {
    console.log(
      `${ownSpace.name} (this terminal's own space, not inside a container)\t${ownSpace.id}`
    )
  } else if (containers.length === 0) {
    console.log('No containers.')
  }
}

async function printContext(ctx: HandlerContext): Promise<void> {
  const name = getOptionalStringFlag(ctx.flags, 'name')
  let pagePath = name ? undefined : process.env.ORCA_CONTAINER_CONTEXT
  if (name) {
    const catalog = await readCatalog()
    const resolved = resolveContainerRef(catalog, name)
    if (!resolved.container && resolved.candidates.length > 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        `"${name}" matches several containers: ${resolved.candidates.map((c) => describeContainerPath(catalog, c)).join(', ')}. Add the parent's name, or run \`orca container list\`.`
      )
    }
    pagePath = resolved.container
      ? join(containerDirectory(), 'pages', `${resolved.container.id}.md`)
      : undefined
  }
  if (!pagePath && !name) {
    const catalog = await readCatalog()
    const space = await callerWorktreeSpace(ctx, catalog).catch(() => null)
    if (space) {
      const here = catalog.containers.filter((c) => c.worktreeId === space.worktreeId)
      console.log(
        [
          `This terminal is in the worktree space "${space.name}": it sits on the worktree itself, in no container, and that is a valid place to work from.`,
          here.length > 0
            ? `Containers on this worktree: ${here.map((c) => describeContainerPath(catalog, c)).join(', ')}.`
            : 'No containers exist on this worktree yet.',
          'Start a session here with `orca container launch --agent <claude|codex> --prompt "<task>"` (no --container needed).',
          'Message other containers with `orca container message --to "<name>" --text "<message>"`; `orca container list` shows them all.'
        ].join('\n')
      )
      return
    }
  }
  if (!pagePath) {
    throw new RuntimeClientError(
      'selector_not_found',
      name
        ? `No container matches "${name}". Run \`orca container list\` to see them all.`
        : 'This terminal is not in a container or worktree. Pass --name <container>.'
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
  const found = resolveContainerRef(catalog, toRef)
  // Why: a worktree's own space is a container too, reached by its worktree name or `worktree:<id>`.
  const candidates = found.container ? [] : found.candidates
  const space =
    found.container || candidates.length > 0
      ? null
      : await resolveWorktreeSpace(ctx, catalog, toRef)
  const target = { container: found.container ?? space, candidates }
  if (!target.container) {
    const options = target.candidates.map(
      (c) => `  - ${describeContainerPath(catalog, c)} (id ${c.id})`
    )
    throw new RuntimeClientError(
      target.candidates.length > 0 ? 'invalid_argument' : 'selector_not_found',
      target.candidates.length > 0
        ? `"${toRef}" matches several containers; use the full path or id:\n${options.join('\n')}`
        : `No container or worktree matches "${toRef}". Run \`orca container list\` for the current names.`
    )
  }
  const senderRef = getOptionalStringFlag(ctx.flags, 'from') ?? process.env.ORCA_CONTAINER_ID
  const sender = senderRef
    ? (resolveContainerRef(catalog, senderRef).container ??
      (isWorktreeSpaceId(senderRef) ? await resolveWorktreeSpace(ctx, catalog, senderRef) : null))
    : await callerWorktreeSpace(ctx, catalog)
  const listed = await ctx.client.call<RuntimeTerminalListResult>('terminal.list', {
    worktree: `id:${target.container.worktreeId}`,
    includeVisualLayouts: false
  })
  const ranked = rankTargetTerminals(
    listed.result.terminals,
    target.container,
    getOptionalStringFlag(ctx.flags, 'agent')
  )
  const agentHint = getOptionalStringFlag(ctx.flags, 'agent')
  const inContainerMatch =
    !agentHint || ranked.some((t) => matchWorktreeTerminalsByHint([t], agentHint).length > 0)
  // Why: with a hint that matches nothing in the container, search the worktree before falling
  // back to the default conversation, which is how a worker's message used to reach the wrong agent.
  const worktreeMatches =
    agentHint && !inContainerMatch
      ? matchWorktreeTerminalsByHint(
          listed.result.terminals.filter((t) => t.agentIdentity),
          agentHint
        )
      : []
  if (agentHint && !inContainerMatch && worktreeMatches.length === 0 && ranked.length > 0) {
    throw new RuntimeClientError(
      'selector_not_found',
      `No conversation in ${describeContainerPath(catalog, target.container)} or its worktree matches --agent "${agentHint}". Open conversations:\n${ranked
        .map((t) => `  - ${t.title ?? t.handle}${t.agentIdentity ? ` (${t.agentIdentity})` : ''}`)
        .join('\n')}\nResend with words from one of those titles, or omit --agent for the default.`
    )
  }
  const terminal = worktreeMatches[0] ?? ranked[0] ?? null
  const others = worktreeMatches.length > 0 ? worktreeMatches.slice(1) : ranked.slice(1)
  const targetPath = describeContainerPath(catalog, target.container)
  const text = formatContainerMessage(
    catalog,
    sender,
    getRequiredStringFlag(ctx.flags, 'text'),
    exchange
  )
  if (!terminal && !isWorktreeSpaceId(target.container.id)) {
    // Why: nobody is in the container, so its default conversation picks the message up.
    const fallback = target.container.defaultConversation
    await dropAgentRequest({
      action: 'launch',
      containerId: target.container.id,
      agent: fallback?.agent ?? 'claude',
      prompt: text,
      permission: 'inherit',
      requesterTabId: process.env.ORCA_TAB_ID,
      requesterId: process.env.ORCA_CONTAINER_ID,
      toDefault: true
    })
    const how = fallback
      ? `its default ${fallback.agent} conversation is being resumed`
      : 'a new Claude session (now its default conversation) is being started'
    console.log(
      ctx.json
        ? JSON.stringify({ to: targetPath, resumed: Boolean(fallback), started: !fallback })
        : `${targetPath} had no conversation open, so ${how} with your message.`
    )
    return
  }
  if (!terminal) {
    throw new RuntimeClientError(
      'selector_not_found',
      `"${targetPath}" has no open terminal to receive the message. Open an agent in that container first.`
    )
  }
  const sent = await ctx.client.call<{ send: RuntimeTerminalSend }>(
    'terminal.send',
    {
      terminal: terminal.handle,
      text,
      enter: true,
      interrupt: false,
      // Why: an agent TUI reads text plus Enter in one write as a paste and keeps the Enter as a
      // newline; the agent-prompt path pastes, then submits, so the message goes out at once.
      agentPrompt: true,
      // Why: never type into a person's half-written message or over a permission prompt; Orca
      // holds the message and types it in once that clears, so the sender never needs to retry.
      deferWhileUserTyping: true,
      // Why: watching for the recipient's turn start turns the send into an acknowledgement.
      waitSubmitMs: DEFAULT_PROMPT_OBSERVE_MS,
      client: { id: 'orca-cli', type: 'desktop' }
    },
    { timeoutMs: DEFAULT_PROMPT_OBSERVE_MS + 10_000 }
  )
  const send = sent.result.send
  await reportContainerMessageDelivery(ctx, { send, terminal, targetPath, others })
  if (others.length > 0 && !ctx.json) {
    // Why: with several conversations the sender should know which one it reached and how to pick another.
    console.log(
      `${ranked.length} conversations are open there; this went to "${terminal.title ?? terminal.handle}". To reach another, resend with --agent "<words from its title>":\n${others
        .map((t) => `  - ${t.title ?? t.handle}${t.agentIdentity ? ` (${t.agentIdentity})` : ''}`)
        .join('\n')}`
    )
  }
  if (!send.accepted) {
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
