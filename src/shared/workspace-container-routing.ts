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
  // 2. Otherwise every word of the reference appears somewhere in the path ("basketball computer vision").
  const words = normalize(ref.replace(/[/›>]/g, ' ')).split(' ')
  const wordMatches = paths.filter(({ segments }) => {
    const haystack = segments.join(' ')
    return words.every((word) => haystack.includes(word))
  })
  const matches = suffixMatches.length > 0 ? suffixMatches : wordMatches
  if (matches.length === 1) {
    return { container: matches[0]!.container }
  }
  // 3. Several matches: prefer the one whose own name is the last word group of the reference.
  const named = matches.filter(({ segments }) => segments.at(-1) === refSegments.at(-1))
  if (named.length === 1) {
    return { container: named[0]!.container }
  }
  return { container: null, candidates: matches.map((m) => m.container) }
}

type TerminalLike = {
  handle: string
  tabId: string
  title: string | null
  paneTitle?: string
  agentIdentity?: string
}

// Defaults to the container's first agent terminal; a hint (an agent name such as "codex", or a
// title fragment) picks among several, and a vague or unmatched hint falls back to the first.
export function pickTargetTerminal<T extends TerminalLike>(
  terminals: readonly T[],
  container: WorkspaceContainer,
  hint?: string
): T | null {
  const owned = new Set(container.terminalTabIds ?? [])
  const inContainer = terminals.filter((t) => owned.has(t.tabId))
  const agents = inContainer.filter((t) => t.agentIdentity)
  const pool = agents.length > 0 ? agents : inContainer
  const wanted = hint ? normalize(hint) : ''
  if (wanted) {
    const hinted = pool.find((t) =>
      [t.agentIdentity, t.title, t.paneTitle].some((v) => v && normalize(v).includes(wanted))
    )
    if (hinted) {
      return hinted
    }
  }
  return pool[0] ?? null
}

export function formatContainerMessage(
  catalog: WorkspaceContainerCatalog,
  sender: WorkspaceContainer | null,
  text: string
): string {
  const from = sender
    ? `${describeContainerPath(catalog, sender)} (container id ${sender.id})`
    : 'a user or an agent outside any container'
  const reply = sender
    ? `To reply: orca container message --to "${sender.id}" --text "<your reply>"`
    : ''
  return [`[Message from ${from}]`, text.trim(), reply].filter(Boolean).join('\n')
}
