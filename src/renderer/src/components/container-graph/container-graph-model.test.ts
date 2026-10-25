import { describe, expect, it } from 'vitest'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import {
  absoluteContainerPosition,
  buildContainerGraph,
  CONTAINER_NODE_SIZE,
  measureContainer
} from './container-graph-model'

function container(id: string, overrides: Partial<WorkspaceContainer> = {}): WorkspaceContainer {
  return {
    id,
    worktreeId: 'wt',
    name: id,
    parentContainerId: null,
    tabIds: [],
    focus: '',
    connections: [],
    position: { x: 0, y: 0 },
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

describe('container graph model', () => {
  it('orders parents before children and sets parentId', () => {
    const containers = [
      container('child', { parentContainerId: 'parent', position: { x: 24, y: 56 } }),
      container('parent')
    ]
    const { nodes } = buildContainerGraph(containers, new Map())
    expect(nodes.map((n) => n.id)).toEqual(['parent', 'child'])
    expect(nodes[1]!.parentId).toBe('parent')
    expect(nodes[0]!.data.isGroup).toBe(true)
  })

  it('grows a parent to wrap its children', () => {
    const containers = [
      container('parent'),
      container('child', { parentContainerId: 'parent', position: { x: 24, y: 56 } })
    ]
    const size = measureContainer(containers, containers[0]!)
    expect(size.width).toBeGreaterThan(CONTAINER_NODE_SIZE.width)
    expect(size.height).toBeGreaterThan(CONTAINER_NODE_SIZE.height)
  })

  it('builds edges only for connections whose target exists', () => {
    const containers = [
      container('a', {
        connections: [
          { targetContainerId: 'b', description: 'Ask for tests' },
          { targetContainerId: 'gone', description: 'dangling' }
        ]
      }),
      container('b')
    ]
    const { edges } = buildContainerGraph(containers, new Map())
    expect(edges.map((e) => [e.source, e.target, e.label])).toEqual([['a', 'b', 'Ask for tests']])
  })

  it('names the worktree on each node', () => {
    const { nodes } = buildContainerGraph([container('a')], new Map([['wt', 'website']]))
    expect(nodes[0]!.data.worktreeName).toBe('website')
  })

  it('sums positions up the parent chain for an absolute position', () => {
    const containers = [
      container('root', { position: { x: 100, y: 100 } }),
      container('mid', { parentContainerId: 'root', position: { x: 10, y: 20 } }),
      container('leaf', { parentContainerId: 'mid', position: { x: 1, y: 2 } })
    ]
    expect(absoluteContainerPosition(containers, 'leaf')).toEqual({ x: 111, y: 122 })
  })

  it('survives a parent cycle without looping forever', () => {
    const containers = [
      container('a', { parentContainerId: 'b' }),
      container('b', { parentContainerId: 'a' })
    ]
    expect(() => buildContainerGraph(containers, new Map())).not.toThrow()
    expect(() => absoluteContainerPosition(containers, 'a')).not.toThrow()
  })
})
