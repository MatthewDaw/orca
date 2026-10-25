import { execFile } from 'node:child_process'

const SESSION_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Matches `codex resume <id>` and `claude --resume <id>` / `--resume=<id>`.
const RESUME_PATTERN = new RegExp(`(?:\\bresume |--resume[ =])(${SESSION_ID})`, 'i')

type ProcessRow = { pid: number; ppid: number; command: string }

export function resumeSessionIdFromCommand(command: string | undefined): string | null {
  return command?.match(RESUME_PATTERN)?.[1]?.toLowerCase() ?? null
}

export function parseProcessTable(output: string): ProcessRow[] {
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }] : []
  })
}

// Only this daemon's own descendants qualify, so another Orca profile or a standalone agent that
// resumes the same conversation is never touched.
export function findStaleResumeHolders(
  rows: readonly ProcessRow[],
  daemonPid: number,
  sessionId: string
): number[] {
  const owned = new Set<number>([daemonPid])
  for (let grew = true; grew;) {
    grew = false
    for (const row of rows) {
      if (!owned.has(row.pid) && owned.has(row.ppid)) {
        owned.add(row.pid)
        grew = true
      }
    }
  }
  return rows
    .filter((row) => row.pid !== daemonPid && owned.has(row.pid))
    .filter((row) => resumeSessionIdFromCommand(row.command) === sessionId)
    .map((row) => row.pid)
}

function listProcesses(): Promise<ProcessRow[]> {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid=,command='], { maxBuffer: 16 * 1024 * 1024 }, (error, out) =>
      resolve(error ? [] : parseProcessTable(out))
    )
  })
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Why: a fresh `resume <id>` spawn means the app decided the earlier terminal for that conversation
// is gone, but agents lock their conversation to one process, so a leftover one (a pty the daemon
// kept after the app quit) makes the new resume stop with "open in another app".
export async function releaseStaleResumeHolders(
  command: string | undefined,
  daemonPid: number = process.pid
): Promise<void> {
  const sessionId = resumeSessionIdFromCommand(command)
  if (!sessionId || process.platform === 'win32') {
    return
  }
  const holders = findStaleResumeHolders(await listProcesses(), daemonPid, sessionId)
  for (const pid of holders) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
  for (let attempt = 0; attempt < 15 && holders.some(isAlive); attempt += 1) {
    await sleep(100)
  }
  for (const pid of holders.filter(isAlive)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}
