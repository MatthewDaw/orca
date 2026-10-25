import { describe, expect, it } from 'vitest'
import {
  formatContainerMessage,
  pickTargetTerminal,
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
