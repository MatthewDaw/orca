import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const TAIL_BYTES = 512 * 1024
const SESSION_ID = /^[A-Za-z0-9_-]{8,80}$/

// The launch flags that reproduce a Claude session's last permission mode; null means defaults.
export function claudePermissionArgs(mode: string | null): string | null {
  if (!mode || mode === 'default') {
    return null
  }
  return mode === 'bypassPermissions'
    ? '--dangerously-skip-permissions'
    : `--permission-mode ${mode}`
}

// The same for Codex's last approval policy and sandbox.
export function codexPermissionArgs(
  approval: string | null,
  sandbox: string | null
): string | null {
  if (approval === 'never' && sandbox === 'danger-full-access') {
    return '--dangerously-bypass-approvals-and-sandbox'
  }
  return (
    [approval ? `--ask-for-approval ${approval}` : '', sandbox ? `--sandbox ${sandbox}` : '']
      .filter(Boolean)
      .join(' ')
      .trim() || null
  )
}

async function readTail(path: string): Promise<string | null> {
  try {
    const size = (await stat(path)).size
    const handle = await open(path, 'r')
    try {
      const length = Math.min(size, TAIL_BYTES)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

const lastMatch = (text: string, pattern: RegExp): string | null => {
  let found: string | null = null
  for (const match of text.matchAll(pattern)) {
    found = match[1] ?? null
  }
  return found
}

async function findClaudeTranscript(home: string, id: string): Promise<string | null> {
  const root = join(home, '.claude', 'projects')
  for (const project of await readdir(root).catch(() => [])) {
    const path = join(root, project, `${id}.jsonl`)
    if (
      await stat(path).then(
        () => true,
        () => false
      )
    ) {
      return path
    }
  }
  return null
}

async function findCodexTranscript(home: string, id: string): Promise<string | null> {
  const root = join(process.env.CODEX_HOME || join(home, '.codex'), 'sessions')
  for (const year of await readdir(root).catch(() => [])) {
    for (const month of await readdir(join(root, year)).catch(() => [])) {
      for (const day of await readdir(join(root, year, month)).catch(() => [])) {
        const dir = join(root, year, month, day)
        const file = (await readdir(dir).catch(() => [])).find(
          (name) => name.startsWith('rollout-') && name.endsWith(`-${id}.jsonl`)
        )
        if (file) {
          return join(dir, file)
        }
      }
    }
  }
  return null
}

// Why from the transcript: the agent records the permission it actually ran with, including a
// mode changed mid-session, so a restart can resume under the same permissions even when the
// launch was typed by hand and Orca never saw its flags.
export async function readAgentSessionPermissionArgs(
  agent: string,
  sessionId: string,
  home: string = homedir()
): Promise<string | null> {
  if (!SESSION_ID.test(sessionId)) {
    return null
  }
  if (agent === 'claude') {
    const path = await findClaudeTranscript(home, sessionId)
    const tail = path ? await readTail(path) : null
    return tail ? claudePermissionArgs(lastMatch(tail, /"permissionMode":"([A-Za-z]+)"/g)) : null
  }
  if (agent === 'codex') {
    const path = await findCodexTranscript(home, sessionId)
    const tail = path ? await readTail(path) : null
    return tail
      ? codexPermissionArgs(
          lastMatch(tail, /"approval_policy":"([a-z-]+)"/g),
          lastMatch(tail, /"sandbox_policy":\{"type":"([a-z-]+)"/g)
        )
      : null
  }
  return null
}
