import type { DaemonFileLog } from './daemon-file-log'
import type { PtySubprocessOptions } from './pty-subprocess'

type MacosSpawnLogHooks = Pick<
  PtySubprocessOptions,
  'onMacosTccSpawnStrategy' | 'onSpawnHelperStalled'
>

/** Routes macOS-only spawn diagnostics to the daemon log; empty elsewhere. */
export function macosPtySpawnLogHooks(log: DaemonFileLog, sessionId: string): MacosSpawnLogHooks {
  if (process.platform !== 'darwin') {
    return {}
  }
  return {
    onMacosTccSpawnStrategy: (strategy) => log.log('macos-tcc-pty-spawn', { strategy }),
    onSpawnHelperStalled: () => log.log('macos-spawn-helper-stalled', { sessionId })
  }
}
