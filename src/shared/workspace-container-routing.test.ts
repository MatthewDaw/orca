import { describe, expect, it } from 'vitest'
import {
  formatContainerMessage,
  inheritedBriefs,
  inheritedCodeScopes,
  isContainerWithin,
  pickTargetTerminal,
  rankTargetTerminals,
  resolveContainerRef
} from './workspace-container-routing'
import type { WorkspaceContainer, WorkspaceContainerCatalog } from './workspace-container-types'

function container(
  id: string,
  name: string,
  worktreeLabel: string,
  parentContainerId: string | null = null,
  terminalTabIds: string[] = []
): WorkspaceContainer {
  return {
    id,
    worktreeId: `r::${worktreeLabel}`,
    worktreeLabel,
    name,
    parentContainerId,
    tabIds: [],
    terminalTabIds,
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    createdAt: 0,
    updatedAt: 0
  }
}

const catalog: WorkspaceContainerCatalog = {
  version: 1,
  containers: [
    container('cv-bb', 'basketball', 'computer_vision', null, ['t1']),
    container('cv-pb', 'pickleball', 'computer_vision'),
    container('ai', 'AI Analysis', 'website'),
    container('ws-bb', 'basketball', 'website', 'ai'),
    container('ws-pb', 'pickleball', 'website', 'ai')
  ]
}

const idOf = (ref: string): string | null => resolveContainerRef(catalog, ref).container?.id ?? null

describe('resolveContainerRef', () => {
  it('resolves ids exactly', () => {
    expect(idOf('ws-pb')).toBe('ws-pb')
  })

  it('resolves a path suffix and survives nesting changes', () => {
    expect(idOf('AI Analysis/pickleball')).toBe('ws-pb')
    expect(idOf('website › AI Analysis › basketball')).toBe('ws-bb')
    expect(idOf('computer_vision/basketball')).toBe('cv-bb')
  })

  it('resolves by words across the path', () => {
    expect(idOf('basketball computer vision')).toBe('cv-bb')
    expect(idOf('ai analysis pickleball')).toBe('ws-pb')
  })

  it('reports candidates when a bare name is ambiguous', () => {
    const result = resolveContainerRef(catalog, 'basketball')
    expect(result.container).toBeNull()
    expect(result.container === null && result.candidates.map((c) => c.id)).toEqual([
      'cv-bb',
      'ws-bb'
    ])
  })

  it('uses the new name after a rename', () => {
    const renamed = {
      ...catalog,
      containers: catalog.containers.map((c) => (c.id === 'ws-pb' ? { ...c, name: 'padel' } : c))
    }
    expect(resolveContainerRef(renamed, 'ai analysis padel').container?.id).toBe('ws-pb')
    expect(resolveContainerRef(renamed, 'AI Analysis/pickleball').container).toBeNull()
  })
})

describe('deeply nested containers', () => {
  const deep: WorkspaceContainerCatalog = {
    version: 1,
    containers: [
      container('story', 'match story analysis', 'website'),
      container('pb', 'pickleball', 'website', 'story'),
      container('pb2', 'pickleball', 'computer_vision'),
      container('l4', 'serve tracking', 'website', 'pb'),
      container('l5', 'toss', 'website', 'l4')
    ]
  }
  const idIn = (ref: string): string | null => resolveContainerRef(deep, ref).container?.id ?? null

  it('finds a container through any number of layers, with or without the middle', () => {
    expect(idIn('website pickleball')).toBe('pb')
    expect(idIn('website/pickleball')).toBe('pb')
    expect(idIn('website/match story analysis/pickleball')).toBe('pb')
    expect(idIn('website/toss')).toBe('l5')
    expect(idIn('website › match story analysis › pickleball › serve tracking › toss')).toBe('l5')
  })

  it('keeps same-named containers on other worktrees apart', () => {
    expect(idIn('computer_vision/pickleball')).toBe('pb2')
  })

  it('inherits scope and briefs from every ancestor up to the root', () => {
    const withText = {
      ...deep,
      containers: deep.containers.map((c) =>
        c.id === 'story'
          ? { ...c, codeScope: 'root scope', brief: 'root brief' }
          : c.id === 'pb'
            ? { ...c, codeScope: 'mid scope' }
            : c
      )
    }
    const leaf = withText.containers.find((c) => c.id === 'l5')!
    expect(inheritedCodeScopes(withText, leaf).map((s) => s.scope)).toEqual([
      'root scope',
      'mid scope'
    ])
    expect(inheritedBriefs(withText, leaf).map((b) => b.brief)).toEqual(['root brief'])
  })
})

describe('resilience to restructuring', () => {
  it('still finds a container from a stale path after a layer was removed', () => {
    const flat: WorkspaceContainerCatalog = {
      version: 1,
      containers: [container('pb', 'pickleball', 'website'), container('x', 'other', 'website')]
    }
    expect(resolveContainerRef(flat, 'website/match story analysis/pickleball').container?.id).toBe(
      'pb'
    )
  })

  it('never resolves a deleted container', () => {
    expect(resolveContainerRef({ version: 1, containers: [] }, 'pb').container).toBeNull()
  })

  it('tells the recipient to stop replying on the last allowed exchange', () => {
    const sender = catalog.containers[0]!
    expect(formatContainerMessage(catalog, sender, 'hi', 2)).toContain('--exchange 3')
    const last = formatContainerMessage(catalog, sender, 'hi', 8)
    expect(last).toContain('do not reply')
    expect(last).not.toContain('--exchange 9')
  })
})

describe('pickTargetTerminal', () => {
  const target = container('x', 'x', 'w', null, ['a', 'b'])
  const terminals = [
    { handle: 'h0', tabId: 'other', title: null, agentIdentity: 'codex' },
    { handle: 'h1', tabId: 'a', title: 'shell' },
    { handle: 'h2', tabId: 'a', title: 'work', agentIdentity: 'claude' },
    { handle: 'h3', tabId: 'b', title: 'work', agentIdentity: 'codex' }
  ]

  it('defaults to the first agent terminal of the container', () => {
    expect(pickTargetTerminal(terminals, target)?.handle).toBe('h2')
  })

  it('routes by agent hint and falls back to the first when vague', () => {
    expect(pickTargetTerminal(terminals, target, 'codex')?.handle).toBe('h3')
    expect(pickTargetTerminal(terminals, target, 'whatever')?.handle).toBe('h2')
  })

  it('uses words from the conversation title to pick among several agents', () => {
    const several = [
      { handle: 'h1', tabId: 'a', title: 'Fix court overlay bug', agentIdentity: 'codex' },
      { handle: 'h2', tabId: 'a', title: 'Build shot arc feature', agentIdentity: 'codex' },
      { handle: 'h3', tabId: 'b', title: 'Review scoring pipeline', agentIdentity: 'claude' }
    ]
    expect(pickTargetTerminal(several, target, 'the shot arc one')?.handle).toBe('h2')
    expect(pickTargetTerminal(several, target, 'scoring review')?.handle).toBe('h3')
    expect(rankTargetTerminals(several, target, 'shot arc').map((t) => t.handle)).toEqual([
      'h2',
      'h1',
      'h3'
    ])
  })

  it('prefers the default conversation unless the hint matches another one', () => {
    const withDefault = {
      ...target,
      defaultConversation: {
        tabId: 'b',
        agent: 'codex' as const,
        providerSession: { key: 'session_id' as const, id: 'sess' }
      }
    }
    expect(pickTargetTerminal(terminals, withDefault)?.handle).toBe('h3')
    expect(pickTargetTerminal(terminals, withDefault, 'claude')?.handle).toBe('h2')
    expect(pickTargetTerminal(terminals, withDefault, 'whatever')?.handle).toBe('h3')
  })

  it('returns null when the container has no terminal', () => {
    expect(pickTargetTerminal(terminals, container('y', 'y', 'w'))).toBeNull()
  })
})

describe('formatContainerMessage', () => {
  it('names the sender by path and id so the recipient can reply', () => {
    const text = formatContainerMessage(catalog, catalog.containers[0]!, 'build it')
    expect(text).toContain('computer_vision › basketball')
    expect(text).toContain('--to "cv-bb"')
  })
})

describe('isContainerWithin', () => {
  const make = (id: string, parent: string | null) => ({
    id,
    worktreeId: 'w',
    name: id,
    parentContainerId: parent,
    tabIds: [],
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    createdAt: 0,
    updatedAt: 0
  })
  const catalog = {
    version: 1 as const,
    containers: [make('a', null), make('b', 'a'), make('c', 'b'), make('d', null)]
  }

  it('covers the container itself and everything nested under it, at any depth', () => {
    expect(isContainerWithin(catalog, 'a', 'a')).toBe(true)
    expect(isContainerWithin(catalog, 'a', 'c')).toBe(true)
  })

  it('excludes ancestors and unrelated containers', () => {
    expect(isContainerWithin(catalog, 'c', 'a')).toBe(false)
    expect(isContainerWithin(catalog, 'a', 'd')).toBe(false)
  })
})
