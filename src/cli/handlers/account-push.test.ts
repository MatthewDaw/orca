import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLiveClaudeCredentials, pushAgentLogins } from './account-push'

describe('account push', () => {
  let dir: string
  let previousCodexHome: string | undefined
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'account-push-'))
    previousCodexHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = dir
  })
  afterEach(() => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends the codex login over stdin, never on the command line', async () => {
    writeFileSync(join(dir, 'auth.json'), '{"tokens":{"refresh_token":"SECRET"}}')
    const run = vi.fn().mockResolvedValue(undefined)
    const [outcome] = await pushAgentLogins(
      { host: 'winlaptop', agents: ['codex'], wslDistro: 'Ubuntu', dryRun: false },
      new Map(),
      run
    )
    expect(outcome.status).toBe('pushed')
    const [host, command, stdin] = run.mock.calls[0]
    expect(host).toBe('winlaptop')
    expect(stdin).toContain('SECRET')
    expect(command).not.toContain('SECRET')
    expect(command.startsWith('wsl.exe -d Ubuntu -- sh -c "')).toBe(true)
    expect(command.slice(command.indexOf('"') + 1, -1)).not.toMatch(/[$'"`]/)
  })

  it('pushes a setup token as a 0600 file plus a one-time profile export', async () => {
    const tokenFile = join(dir, 'token')
    writeFileSync(tokenFile, 'sk-ant-oat01-TOKEN\n')
    const run = vi.fn().mockResolvedValue(undefined)
    const outcomes = await pushAgentLogins(
      { host: 'worker', agents: ['claude'], dryRun: false },
      new Map([['claude-token-file', tokenFile]]),
      run
    )
    expect(outcomes[0].status).toBe('pushed')
    expect(run.mock.calls[0][1]).toContain('umask 077')
    expect(run.mock.calls[0][2]).toBe('sk-ant-oat01-TOKEN')
    expect(run.mock.calls[1][1]).toContain('grep -qs orca-claude-token ~/.profile')
    expect(run.mock.calls[1][2]).toContain('CLAUDE_CODE_OAUTH_TOKEN')
  })

  it('does not touch the host on a dry run', async () => {
    writeFileSync(join(dir, 'auth.json'), '{}')
    const run = vi.fn()
    const [outcome] = await pushAgentLogins(
      { host: 'worker', agents: ['codex'], dryRun: true },
      new Map(),
      run
    )
    expect(outcome.status).toBe('would-push')
    expect(run).not.toHaveBeenCalled()
  })

  it('reports a failed host without hiding the other agent', async () => {
    writeFileSync(join(dir, 'auth.json'), '{}')
    const tokenFile = join(dir, 'token')
    writeFileSync(tokenFile, 'tok')
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValue(undefined)
    const outcomes = await pushAgentLogins(
      { host: 'worker', agents: ['codex', 'claude'], dryRun: false },
      new Map([['claude-token-file', tokenFile]]),
      run
    )
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'pushed'])
    expect(outcomes[0].detail).toBe('Permission denied')
  })

  it('treats a login whose access token expired long ago as dead', () => {
    const now = Date.now()
    const blob = (expiresAt: number): string =>
      JSON.stringify({ claudeAiOauth: { refreshToken: 'r', expiresAt } })
    expect(parseLiveClaudeCredentials(blob(now + 1000), now)).not.toBeNull()
    expect(parseLiveClaudeCredentials(blob(now - 3600_000), now)).not.toBeNull()
    expect(parseLiveClaudeCredentials(blob(now - 40 * 86_400_000), now)).toBeNull()
    expect(parseLiveClaudeCredentials('{"mcpOAuth":{}}', now)).toBeNull()
  })
})
