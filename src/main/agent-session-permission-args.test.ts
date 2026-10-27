import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  claudePermissionArgs,
  codexPermissionArgs,
  readAgentSessionPermissionArgs
} from './agent-session-permission-args'

const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((h) => rm(h, { recursive: true, force: true })))
})

describe('permission args', () => {
  it('maps Claude modes to launch flags', () => {
    expect(claudePermissionArgs('bypassPermissions')).toBe('--dangerously-skip-permissions')
    expect(claudePermissionArgs('acceptEdits')).toBe('--permission-mode acceptEdits')
    expect(claudePermissionArgs('default')).toBeNull()
  })

  it('maps Codex policies to launch flags', () => {
    expect(codexPermissionArgs('never', 'danger-full-access')).toBe(
      '--dangerously-bypass-approvals-and-sandbox'
    )
    expect(codexPermissionArgs('on-request', 'workspace-write')).toBe(
      '--ask-for-approval on-request --sandbox workspace-write'
    )
  })
})

describe('readAgentSessionPermissionArgs', () => {
  it('reads the last Claude mode from the session transcript', async () => {
    const home = await mkdtemp(join(tmpdir(), 'perm-'))
    homes.push(home)
    await mkdir(join(home, '.claude', 'projects', 'proj'), { recursive: true })
    await writeFile(
      join(home, '.claude', 'projects', 'proj', 'abcdef12-session.jsonl'),
      '{"permissionMode":"default"}\n{"permissionMode":"bypassPermissions"}\n'
    )
    expect(await readAgentSessionPermissionArgs('claude', 'abcdef12-session', home)).toBe(
      '--dangerously-skip-permissions'
    )
  })

  it('reads the last Codex policy and ignores unsafe ids', async () => {
    const home = await mkdtemp(join(tmpdir(), 'perm-'))
    homes.push(home)
    const dir = join(home, '.codex', 'sessions', '2026', '10', '26')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'rollout-2026-10-26T00-00-00-01a179eb-f40a.jsonl'),
      '{"approval_policy":"never","sandbox_policy":{"type":"danger-full-access"}}\n'
    )
    expect(await readAgentSessionPermissionArgs('codex', '01a179eb-f40a', home)).toBe(
      '--dangerously-bypass-approvals-and-sandbox'
    )
    expect(await readAgentSessionPermissionArgs('codex', '../../etc', home)).toBeNull()
  })
})
