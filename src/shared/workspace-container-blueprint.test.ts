import { describe, expect, it } from 'vitest'
import {
  blueprintToContainers,
  buildContainerBlueprint,
  parseContainerBlueprint,
  serializeContainerBlueprint
} from './workspace-container-blueprint'
import type { WorkspaceContainer } from './workspace-container-types'

function container(id: string, overrides: Partial<WorkspaceContainer> = {}): WorkspaceContainer {
  return {
    id,
    worktreeId: 'repo::/main',
    name: id,
    parentContainerId: null,
    tabIds: ['tab-1'],
    focus: `${id} focus`,
    connections: [],
    position: { x: 10, y: 20 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('container blueprint', () => {
  it('round-trips structure but drops machine-local tab and worktree ids', () => {
    const containers = [
      container('a', { connections: [{ targetContainerId: 'b', description: 'ask b' }] }),
      container('b', { parentContainerId: 'a' })
    ]
    const blueprint = buildContainerBlueprint(containers, () => 'main')
    const parsed = parseContainerBlueprint(serializeContainerBlueprint(blueprint))
    const restored = blueprintToContainers(parsed!, () => 'other::/new-main', 5)
    expect(restored.map((c) => [c.id, c.worktreeId, c.parentContainerId, c.tabIds])).toEqual([
      ['a', 'other::/new-main', null, []],
      ['b', 'other::/new-main', 'a', []]
    ])
    expect(restored[0]!.connections).toEqual([{ targetContainerId: 'b', description: 'ask b' }])
    expect(restored[0]!.focus).toBe('a focus')
  })

  it('skips containers whose worktree has no reference', () => {
    const blueprint = buildContainerBlueprint([container('a')], () => null)
    expect(blueprint.containers).toEqual([])
  })

  it('rejects malformed or wrong-version files', () => {
    expect(parseContainerBlueprint('not json')).toBeNull()
    expect(parseContainerBlueprint('{"version":2,"containers":[]}')).toBeNull()
    expect(parseContainerBlueprint('{"version":1}')).toBeNull()
  })

  it('drops unknown parents and dangling connections from a hand-edited file', () => {
    const parsed = parseContainerBlueprint(
      JSON.stringify({
        version: 1,
        containers: [
          {
            id: 'a',
            name: 'A',
            parentId: 'ghost',
            connections: [{ targetContainerId: 'ghost', description: 'x' }]
          }
        ]
      })
    )
    const [restored] = blueprintToContainers(parsed!, () => 'wt', 1)
    expect(restored!.parentContainerId).toBeNull()
    expect(restored!.connections).toEqual([])
  })

  it('ignores duplicate ids and entries without a resolvable worktree', () => {
    const parsed = parseContainerBlueprint(
      JSON.stringify({
        version: 1,
        containers: [
          { id: 'a', name: 'A1' },
          { id: 'a', name: 'A2' },
          { id: 'b', name: 'B', worktree: 'gone-branch' }
        ]
      })
    )
    const restored = blueprintToContainers(parsed!, (ref) => (ref === 'main' ? 'wt' : null), 1)
    expect(restored.map((c) => c.name)).toEqual(['A1'])
  })
})
