import { execFile } from 'node:child_process'

const STALL_CHECK_MS = 10_000

export const SPAWN_HELPER_STALL_NOTICE =
  '\r\n[Orca] macOS has not let this terminal start (its launch helper is blocked). ' +
  'Run `sudo killall syspolicyd` in another terminal, then open a new tab.\r\n'

function readProcessCommand(pid: number): Promise<string> {
  return new Promise((resolve) => {
    execFile('/bin/ps', ['-o', 'command=', '-p', String(pid)], { timeout: 3000 }, (_err, out) =>
      resolve(String(out ?? ''))
    )
  })
}

type StallWatchdogDeps = {
  pid: number
  hasOutput: () => boolean
  isDead: () => boolean
  notify: (text: string) => void
  onStalled: () => void
  setTimer?: (callback: () => void, ms: number) => { unref?: () => void }
  readCommand?: (pid: number) => Promise<string>
}

// Why: a launch macOS holds at its first instruction (a stuck code-signing check) looks identical
// to a slow shell. A helper still unexec'd after 10s with no output is that stall, not slowness.
export function watchMacosSpawnHelperStall(deps: StallWatchdogDeps): void {
  const timer = (deps.setTimer ?? setTimeout)(() => {
    if (deps.hasOutput() || deps.isDead()) {
      return
    }
    void (deps.readCommand ?? readProcessCommand)(deps.pid).then((command) => {
      if (deps.hasOutput() || deps.isDead() || !command.includes('spawn-helper')) {
        return
      }
      deps.onStalled()
      deps.notify(SPAWN_HELPER_STALL_NOTICE)
    })
  }, STALL_CHECK_MS)
  timer.unref?.()
}
