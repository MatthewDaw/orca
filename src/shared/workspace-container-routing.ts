import { agentMessageHeader } from './agent-message-marker'
import type { WorkspaceContainer, WorkspaceContainerCatalog } from './workspace-container-types'

const PATH_SEPARATOR = ' › '

export function containerPathSegments(
  catalog: WorkspaceContainerCatalog,
  container: WorkspaceContainer
): string[] {
  const byId = new Map(catalog.containers.map((c) => [c.id, c]))
  const names: string[] = []
  const seen = new Set<string>()
  for (
    let cursor: WorkspaceContainer | undefined = container;
    cursor && !seen.has(cursor.id);
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  ) {
    seen.add(cursor.id)
    names.unshift(cursor.name)
  }
  return [container.worktreeLabel ?? container.worktreeId, ...names]
}

// Scope and briefs set on a container apply to everything nested under it, now and later,
// because they are read from the live tree rather than copied into children. Outermost first.
function inheritedText(
  catalog: WorkspaceContainerCatalog,
  container: WorkspaceContainer,
  read: (c: WorkspaceContainer) => string | undefined
): { container: WorkspaceContainer; text: string }[] {
  const byId = new Map(catalog.containers.map((c) => [c.id, c]))
  const chain: WorkspaceContainer[] = []
  const seen = new Set<string>()
  for (
    let cursor: WorkspaceContainer | undefined = container;
    cursor && !seen.has(cursor.id);
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  ) {
    seen.add(cursor.id)
    chain.unshift(cursor)
  }
  return chain.flatMap((c) => {
    const text = read(c)?.trim()
    return text ? [{ container: c, text }] : []
  })
}

export function inheritedCodeScopes(
  catalog: WorkspaceContainerCatalog,
  container: WorkspaceContainer
): { container: WorkspaceContainer; scope: string }[] {
  return inheritedText(catalog, container, (c) => c.codeScope).map(
    ({ container: owner, text }) => ({
      container: owner,
      scope: text
    })
  )
}

export function inheritedBriefs(
  catalog: WorkspaceContainerCatalog,
  container: WorkspaceContainer
): { container: WorkspaceContainer; brief: string }[] {
  return inheritedText(catalog, container, (c) => c.brief).map(({ container: owner, text }) => ({
    container: owner,
    brief: text
  }))
}

// Agents may only reshape their own subtree: `ancestorId` itself, or any container nested under it.
export function isContainerWithin(
  catalog: WorkspaceContainerCatalog,
  ancestorId: string,
  containerId: string
): boolean {
  const byId = new Map(catalog.containers.map((c) => [c.id, c]))
  const seen = new Set<string>()
  for (
    let cursor = byId.get(containerId);
    cursor && !seen.has(cursor.id);
    cursor = cursor.parentContainerId ? byId.get(cursor.parentContainerId) : undefined
  ) {
    if (cursor.id === ancestorId) {
      return true
    }
    seen.add(cursor.id)
  }
  return false
}

export function describeContainerPath(
  catalog: WorkspaceContainerCatalog,
  container: WorkspaceContainer
): string {
  return containerPathSegments(catalog, container).join(PATH_SEPARATOR)
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ')
    .trim()

export type ContainerRefResolution =
  | { container: WorkspaceContainer }
  | { container: null; candidates: WorkspaceContainer[] }

// Names are what people and agents say, so they are resolved against the live catalog on every
// call: renames and re-nesting change what resolves, never whether routing works. An id always
// resolves exactly.
export function resolveContainerRef(
  catalog: WorkspaceContainerCatalog,
  ref: string
): ContainerRefResolution {
  const byId = catalog.containers.find((c) => c.id === ref.trim())
  if (byId) {
    return { container: byId }
  }
  const paths = catalog.containers.map((container) => ({
    container,
    segments: containerPathSegments(catalog, container).map(normalize)
  }))
  const refSegments = ref
    .split(/[/›>]/)
    .map(normalize)
    .filter((segment) => segment.length > 0)
  if (refSegments.length === 0) {
    return { container: null, candidates: [] }
  }
  // 1. The reference is a trailing run of the path ("pickleball", "AI Analysis/pickleball").
  const suffixMatches = paths.filter(({ segments }) =>
    refSegments.every(
      (segment, index) => segments[segments.length - refSegments.length + index] === segment
    )
  )
  // 2. The reference's parts appear in order along the path, layers in between skipped
  //    ("website/pickleball" finds website › match story analysis › pickleball).
  const orderedMatches = paths.filter(({ segments }) => {
    if (refSegments.length < 2 || segments.at(-1) !== refSegments.at(-1)) {
      return false
    }
    let cursor = 0
    return refSegments.every((part) => {
      const found = segments.indexOf(part, cursor)
      cursor = found + 1
      return found !== -1
    })
  })
  // 3. Otherwise every word of the reference appears somewhere in the path ("basketball computer vision").
  const words = normalize(ref.replace(/[/›>]/g, ' ')).split(' ')
  const wordMatches = paths.filter(({ segments }) => {
    const haystack = segments.join(' ')
    return words.every((word) => haystack.includes(word))
  })
  const matches =
    suffixMatches.length > 0
      ? suffixMatches
      : orderedMatches.length > 0
        ? orderedMatches
        : wordMatches
  if (matches.length === 1) {
    return { container: matches[0]!.container }
  }
  // 4. Several matches: prefer the one whose own name is the last word group of the reference.
  const named = matches.filter(({ segments }) => segments.at(-1) === refSegments.at(-1))
  if (named.length === 1) {
    return { container: named[0]!.container }
  }
  // 5. A loose reference reads "<where> <name>": the container's own name carries the last word.
  const lastWord = words.at(-1)
  const byOwnName = lastWord
    ? matches.filter(({ segments }) => segments.at(-1)?.includes(lastWord))
    : []
  if (byOwnName.length === 1) {
    return { container: byOwnName[0]!.container }
  }
  if (matches.length > 0) {
    return { container: null, candidates: matches.map((m) => m.container) }
  }
  // 6. A stale path (a layer was since removed or renamed) still finds its target by name: rank
  //    containers sharing the last name by how many of the other parts still line up.
  const lastPart = refSegments.at(-1)!
  const sameName = paths.filter(({ segments }) => segments.at(-1) === lastPart)
  const scored = sameName.map(({ container, segments }) => {
    let cursor = 0
    let score = 0
    for (const part of refSegments.slice(0, -1)) {
      const found = segments.indexOf(part, cursor)
      if (found !== -1) {
        score += 1
        cursor = found + 1
      }
    }
    return { container, score }
  })
  const best = Math.max(0, ...scored.map((s) => s.score))
  // Why: a bare name, or a path whose earlier parts match nothing, may now mean a different
  // container entirely (it was renamed), and misrouting a message is worse than failing.
  if (refSegments.length > 1 && best === 0) {
    return { container: null, candidates: [] }
  }
  const top = scored.filter((s) => s.score === best)
  return top.length === 1
    ? { container: top[0]!.container }
    : { container: null, candidates: top.map((s) => s.container) }
}

type TerminalLike = {
  handle: string
  tabId: string
  title: string | null
  paneTitle?: string
  agentIdentity?: string
}

const wordsOf = (value: string): string[] =>
  normalize(value)
    .split(' ')
    .filter((word) => word.length > 1)

// The container's agent terminals, best match first. A hint (an agent name such as "codex", or
// words from a conversation's tab title) ranks terminals by how many of its words their title,
// pane title or agent name contain; ties and a hint that matches nothing keep tab order, so
// the first agent is the default.
export function rankTargetTerminals<T extends TerminalLike>(
  terminals: readonly T[],
  container: WorkspaceContainer,
  hint?: string
): T[] {
  const owned = new Set(container.terminalTabIds ?? [])
  const inContainer = terminals.filter((t) => owned.has(t.tabId))
  const agents = inContainer.filter((t) => t.agentIdentity)
  const pool = agents.length > 0 ? agents : inContainer
  const wanted = hint ? wordsOf(hint) : []
  const score = (t: T): number => {
    const haystack = normalize([t.agentIdentity, t.title, t.paneTitle].filter(Boolean).join(' '))
    return wanted.filter((word) => haystack.includes(word)).length
  }
  // Why: the default conversation is where a container's work lives, so it wins unless the hint
  // matches another conversation better.
  const defaultTabId = container.defaultConversation?.tabId
  const isDefault = (t: T): number => (t.tabId === defaultTabId ? 1 : 0)
  return pool
    .map((terminal, index) => ({ terminal, index, score: score(terminal) }))
    .sort(
      (a, b) =>
        b.score - a.score || isDefault(b.terminal) - isDefault(a.terminal) || a.index - b.index
    )
    .map((entry) => entry.terminal)
}

export function pickTargetTerminal<T extends TerminalLike>(
  terminals: readonly T[],
  container: WorkspaceContainer,
  hint?: string
): T | null {
  return rankTargetTerminals(terminals, container, hint)[0] ?? null
}

export const MAX_CONTAINER_EXCHANGES = 8

export function describeMessageSender(
  catalog: WorkspaceContainerCatalog,
  sender: WorkspaceContainer | null
): string {
  return sender
    ? `${describeContainerPath(catalog, sender)} (container id ${sender.id})`
    : 'a user or an agent outside any container'
}

// The line that tells a recipient how to answer a message that did not come with an exchange count.
export function replyHint(sender: WorkspaceContainer | null): string {
  return sender ? `To reply: orca container message --to "${sender.id}" --text "<your reply>"` : ''
}

export function formatContainerMessage(
  catalog: WorkspaceContainerCatalog,
  sender: WorkspaceContainer | null,
  text: string,
  exchange = 1
): string {
  const from = describeMessageSender(catalog, sender)
  const lastTurn = exchange >= MAX_CONTAINER_EXCHANGES
  const reply = !sender
    ? ''
    : lastTurn
      ? 'This is the last automatic exchange between you two: do not reply to the container. Summarize where things stand for the user instead.'
      : `To reply: orca container message --to "${sender.id}" --exchange ${exchange + 1} --text "<your reply>"`
  return [
    agentMessageHeader(from, `exchange ${exchange}/${MAX_CONTAINER_EXCHANGES}`),
    text.trim(),
    reply
  ]
    .filter(Boolean)
    .join('\n')
}
