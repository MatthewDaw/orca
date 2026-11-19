import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOCK_SCREEN_TEXT = /open in another app/i

export function screenShowsConversationLock(screenText: string): boolean {
  return LOCK_SCREEN_TEXT.test(screenText)
}

// Orca names a terminal "<conversation> | <workspace>"; Codex indexes conversations by the first part.
export function conversationNameFromTerminalTitle(title: string): string {
  return title.split(' | ')[0]!.trim()
}

/** Ids of every conversation Codex has indexed under this name. */
export function conversationIdsNamed(indexText: string, name: string): string[] {
  const ids = new Set<string>()
  for (const line of indexText.split('\n')) {
    try {
      const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown }
      if (typeof entry.id === 'string' && entry.thread_name === name) {
        ids.add(entry.id)
      }
    } catch {
      // A partial last line is skipped.
    }
  }
  return [...ids]
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 4 * 1024 * 1024, timeout: 10_000 }, (_error, stdout) =>
      resolve(stdout ?? '')
    )
  })
}

/** Codex keeps a conversation's lock file open for as long as a process has it; those are the holders. */
export async function findConversationHolders(
  conversationName: string,
  codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
): Promise<number[]> {
  if (process.platform === 'win32') {
    return []
  }
  const index = await readFile(join(codexHome, 'session_index.jsonl'), 'utf8').catch(() => '')
  const pids = new Set<number>()
  for (const id of conversationIdsNamed(index, conversationName)) {
    const out = await run('lsof', ['-t', join(codexHome, 'thread-writer-locks', `${id}.lock`)])
    for (const pid of out.split('\n').map(Number)) {
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        pids.add(pid)
      }
    }
  }
  // Only a codex process may be stopped, whatever else happens to hold the file.
  const holders: number[] = []
  for (const pid of pids) {
    if (/\bcodex\b/.test((await run('ps', ['-o', 'command=', '-p', String(pid)])).trim())) {
      holders.push(pid)
    }
  }
  return holders
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function stopConversationHolders(pids: readonly number[]): Promise<void> {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
  for (let attempt = 0; attempt < 20 && pids.some(isAlive); attempt += 1) {
    await sleep(100)
  }
  for (const pid of pids.filter(isAlive)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}
