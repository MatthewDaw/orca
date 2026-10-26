import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceContainerStore } from './workspace-container-store'

const directories: string[] = []

async function newStore(): Promise<WorkspaceContainerStore> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-containers-'))
  directories.push(directory)
  return new WorkspaceContainerStore(directory)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('applyAgentChildCreate', () => {
  it('creates a child on the parent worktree with its focus', async () => {
    const store = await newStore()
    const parent = await store.create({ worktreeId: 'wt', name: 'basketball' })
    expect(await store.applyAgentChildCreate(parent.id, ' shot-arc ', 'Draw arcs')).toEqual({
      ok: true
    })
    const child = (await store.list()).containers.find((c) => c.name === 'shot-arc')
    expect(child).toMatchObject({
      worktreeId: 'wt',
      parentContainerId: parent.id,
      focus: 'Draw arcs'
    })
  })

  it('refuses duplicate sibling names, empty names and unknown parents', async () => {
    const store = await newStore()
    const parent = await store.create({ worktreeId: 'wt', name: 'basketball' })
    await store.applyAgentChildCreate(parent.id, 'shot-arc', '')
    expect((await store.applyAgentChildCreate(parent.id, 'Shot-Arc', '')).ok).toBe(false)
    expect((await store.applyAgentChildCreate(parent.id, '  ', '')).ok).toBe(false)
    expect((await store.applyAgentChildCreate('missing', 'x', '')).ok).toBe(false)
  })
})
