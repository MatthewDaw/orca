import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { readActiveClaudeKeychainCredentialsStrict } from '../../main/claude-accounts/keychain'

type PushAgent = 'claude' | 'codex'
type PushStatus = 'pushed' | 'would-push' | 'skipped' | 'failed'
export type PushOutcome = { agent: PushAgent; status: PushStatus; detail: string }

export type SshRunner = (host: string, remoteCommand: string, stdin: string) => Promise<void>

// Why: an access token this old means the laptop's own login is not being refreshed, so the
// refresh token is probably dead too and copying it would only move the failure to the worker.
const STALE_ACCESS_TOKEN_MS = 24 * 60 * 60 * 1000
const SSH_TIMEOUT_MS = 60_000

type ClaudeSource =
  | { kind: 'oauth-blob'; json: string; origin: string }
  | { kind: 'setup-token'; token: string; origin: string }

type OauthBlob = { claudeAiOauth?: { refreshToken?: string; expiresAt?: number } }

/** Remote commands avoid `$` and quotes so cmd.exe, PowerShell and sh all pass them unchanged. */
function remoteInstall(wslDistro: string | undefined, script: string): string {
  const shell = `sh -c "${script}"`
  return wslDistro ? `wsl.exe -d ${wslDistro} -- ${shell}` : shell
}

function atomicWrite(dir: string, file: string): string {
  const target = `${dir}/${file}`
  return (
    `umask 077; mkdir -p ${dir}; cp -p ${target} ${target}.orca-bak 2>/dev/null; ` +
    `cat > ${target}.tmp && mv ${target}.tmp ${target}`
  )
}

export function parseLiveClaudeCredentials(raw: string, now: number): string | null {
  let parsed: OauthBlob
  try {
    parsed = JSON.parse(raw) as OauthBlob
  } catch {
    return null
  }
  const oauth = parsed.claudeAiOauth
  if (!oauth?.refreshToken || typeof oauth.expiresAt !== 'number') {
    return null
  }
  return now - oauth.expiresAt > STALE_ACCESS_TOKEN_MS ? null : raw
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function findClaudeSource(
  flags: Map<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  now: number
): Promise<ClaudeSource | null> {
  const tokenFile = getOptionalStringFlag(flags, 'claude-token-file')
  if (tokenFile) {
    const token = (await readOptionalFile(tokenFile))?.trim()
    if (!token) {
      throw new RuntimeClientError('invalid_argument', `--claude-token-file ${tokenFile} is empty.`)
    }
    return { kind: 'setup-token', token, origin: tokenFile }
  }
  if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    return {
      kind: 'setup-token',
      token: env.CLAUDE_CODE_OAUTH_TOKEN.trim(),
      origin: 'CLAUDE_CODE_OAUTH_TOKEN'
    }
  }
  const configDir = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const candidates: [string, () => Promise<string | null>][] = [
    ['credentials file', () => readOptionalFile(join(configDir, '.credentials.json'))],
    [
      'macOS keychain',
      () => readActiveClaudeKeychainCredentialsStrict(configDir).catch(() => null)
    ],
    ['macOS keychain', () => readActiveClaudeKeychainCredentialsStrict().catch(() => null)]
  ]
  for (const [origin, read] of candidates) {
    const live = parseLiveClaudeCredentials((await read()) ?? '', now)
    if (live) {
      return { kind: 'oauth-blob', json: live, origin }
    }
  }
  return null
}

export const NO_CLAUDE_LOGIN_GUIDANCE =
  'No live Claude login on this machine to copy (the stored logins are expired). ' +
  'Run `claude setup-token` once here (opens a browser, prints a year-long token), save it to a file, ' +
  'then `orca account push --to <host> --agent claude --claude-token-file <file>`.'

async function pushCodex(
  host: string,
  wslDistro: string | undefined,
  run: SshRunner,
  dryRun: boolean
): Promise<PushOutcome> {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  const raw = await readOptionalFile(join(codexHome, 'auth.json'))
  if (!raw) {
    return {
      agent: 'codex',
      status: 'skipped',
      detail: `no ${codexHome}/auth.json; run codex login`
    }
  }
  if (dryRun) {
    return {
      agent: 'codex',
      status: 'would-push',
      detail: `${codexHome}/auth.json -> ~/.codex/auth.json`
    }
  }
  await run(host, remoteInstall(wslDistro, atomicWrite('~/.codex', 'auth.json')), raw)
  return {
    agent: 'codex',
    status: 'pushed',
    detail: '~/.codex/auth.json (previous kept as .orca-bak)'
  }
}

async function pushClaude(
  host: string,
  wslDistro: string | undefined,
  run: SshRunner,
  source: ClaudeSource | null,
  dryRun: boolean
): Promise<PushOutcome> {
  if (!source) {
    return { agent: 'claude', status: 'skipped', detail: NO_CLAUDE_LOGIN_GUIDANCE }
  }
  const dest =
    source.kind === 'oauth-blob'
      ? '~/.claude/.credentials.json'
      : '~/.config/orca/claude-oauth-token'
  if (dryRun) {
    return { agent: 'claude', status: 'would-push', detail: `${source.origin} -> ${dest}` }
  }
  if (source.kind === 'oauth-blob') {
    await run(
      host,
      remoteInstall(wslDistro, atomicWrite('~/.claude', '.credentials.json')),
      source.json
    )
  } else {
    await run(
      host,
      remoteInstall(wslDistro, atomicWrite('~/.config/orca', 'claude-oauth-token')),
      source.token
    )
    // Why: agents on the worker start without a profile sourced, so export the token from ~/.profile once.
    const block = `\n# orca-claude-token\nexport CLAUDE_CODE_OAUTH_TOKEN=$(cat ~/.config/orca/claude-oauth-token)\n`
    await run(
      host,
      remoteInstall(wslDistro, 'grep -qs orca-claude-token ~/.profile || cat >> ~/.profile'),
      block
    )
  }
  return { agent: 'claude', status: 'pushed', detail: dest }
}

export const sshRunner: SshRunner = (host, remoteCommand, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host, remoteCommand],
      {
        stdio: ['pipe', 'ignore', 'pipe']
      }
    )
    let stderr = ''
    const timer = setTimeout(() => child.kill(), SSH_TIMEOUT_MS)
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr.trim() || `ssh exited with code ${code}`))
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })

export async function pushAgentLogins(
  options: { host: string; agents: PushAgent[]; wslDistro?: string; dryRun: boolean },
  flags: Map<string, string | boolean>,
  run: SshRunner = sshRunner
): Promise<PushOutcome[]> {
  const claudeSource = options.agents.includes('claude')
    ? await findClaudeSource(flags, process.env, Date.now())
    : null
  const outcomes: PushOutcome[] = []
  for (const agent of options.agents) {
    try {
      outcomes.push(
        agent === 'codex'
          ? await pushCodex(options.host, options.wslDistro, run, options.dryRun)
          : await pushClaude(options.host, options.wslDistro, run, claudeSource, options.dryRun)
      )
    } catch (error) {
      outcomes.push({
        agent,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return outcomes
}

function parseAgents(value: string | undefined): PushAgent[] {
  if (value === undefined || value === 'all') {
    return ['claude', 'codex']
  }
  if (value === 'claude' || value === 'codex') {
    return [value]
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `Unsupported --agent "${value}". Use claude, codex or all.`
  )
}

export const ACCOUNT_PUSH_HANDLERS: Record<string, CommandHandler> = {
  'account push': async ({ flags, json }) => {
    const host = getRequiredStringFlag(flags, 'to')
    if (host.startsWith('-') || /\s/.test(host)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `--to must be an ssh host name, got "${host}".`
      )
    }
    const wslDistro = getOptionalStringFlag(flags, 'wsl-distro')
    if (wslDistro !== undefined && !/^[A-Za-z0-9._-]+$/.test(wslDistro)) {
      throw new RuntimeClientError('invalid_argument', `Invalid --wsl-distro "${wslDistro}".`)
    }
    const outcomes = await pushAgentLogins(
      {
        host,
        wslDistro,
        agents: parseAgents(getOptionalStringFlag(flags, 'agent')),
        dryRun: flags.get('dry-run') === true
      },
      flags
    )
    if (json) {
      console.log(JSON.stringify({ host, results: outcomes }, null, 2))
    } else {
      console.log(outcomes.map((o) => `${o.agent}: ${o.status} - ${o.detail}`).join('\n'))
    }
    if (outcomes.some((o) => o.status === 'failed')) {
      process.exitCode = 1
    }
  }
}
