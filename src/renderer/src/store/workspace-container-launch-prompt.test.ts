import { describe, expect, it } from 'vitest'
import type { WorkspaceContainer } from '../../../shared/workspace-container-types'
import { withContainerContextInstruction } from './workspace-container-launch-prompt'

const container: WorkspaceContainer = {
  id: 'c',
  worktreeId: 'wt',
  worktreeLabel: 'website',
  name: 'pickleball',
  parentContainerId: null,
  tabIds: [],
  focus: '',
  connections: [],
  position: { x: 0, y: 0 },
  createdAt: 0,
  updatedAt: 0
}

describe('withContainerContextInstruction', () => {
  it('leaves prompts alone outside a container', () => {
    expect(withContainerContextInstruction('hi', null, [])).toBe('hi')
  })

  it('stays silent for a container with no parent context and no children', () => {
    expect(withContainerContextInstruction('hi', container, [container])).toBe('hi')
  })

  it('opens a launch under a parent that shares context with the instruction, ahead of any user prompt', () => {
    const parent = { ...container, id: 'p', name: 'AI', brief: 'Use X.' }
    const child = { ...container, parentContainerId: 'p' }
    const text = withContainerContextInstruction('build it', child, [parent, child])
    expect(text).toMatch(/^You are working inside the Orca container "website › AI › pickleball"/)
    expect(text).toContain('orca container context')
    expect(text.endsWith('build it')).toBe(true)
  })

  it('instructs a parent so it can maintain its brief, even without a prompt', () => {
    const child = { ...container, id: 'k', parentContainerId: 'c' }
    const text = withContainerContextInstruction('', container, [container, child])
    expect(text).toContain('short and slow-changing')
  })
})
