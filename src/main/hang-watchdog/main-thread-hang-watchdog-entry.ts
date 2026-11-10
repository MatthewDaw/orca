import { execFile } from 'node:child_process'
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createHangWatchdogDetectionLoop } from './hang-watchdog-detection-loop'
import { writeHangDetectionMarker } from './hang-detection-marker'
import type {
  HangWatchdogWorkerData,
  MainToHangWatchdogWorkerMessage
} from './hang-watchdog-worker-protocol'

type HangWatchdogPort = {
  on: (event: 'message', listener: (message: MainToHangWatchdogWorkerMessage) => void) => unknown
  close: () => void
}

// Observation only: a false positive must never kill a live main thread mid-write.
export function recordHangObservation(options: {
  parentPid: number
  markerPath: string
  unresponsiveMs: number
  selfRecovered: boolean
}): void {
  if (!options.markerPath) {
    return
  }
  try {
    writeHangDetectionMarker(options.markerPath, {
      detectedAt: Date.now(),
      parentPid: options.parentPid,
      unresponsiveMs: options.unresponsiveMs,
      selfRecovered: options.selfRecovered
    })
  } catch {
    // Diagnostic write failures must not terminate the watchdog.
  }
}

export function hangSamplePath(markerPath: string): string {
  return `${markerPath}.sample.txt`
}

// Why: the marker records how long the main thread hung, never what it was doing. This worker is
// alive during the hang, so it can ask macOS for the stuck thread's stack while it is still stuck.
export function sampleHungMainThread(
  options: { parentPid: number; markerPath: string },
  run: typeof execFile = execFile
): void {
  if (process.platform !== 'darwin' || !options.markerPath) {
    return
  }
  try {
    run(
      '/usr/bin/sample',
      [String(options.parentPid), '3', '-mayDie', '-file', hangSamplePath(options.markerPath)],
      { timeout: 30_000 },
      () => {}
    )
  } catch {
    // A missing sampler leaves the duration-only marker in place.
  }
}

export function runWatchdog(
  config: HangWatchdogWorkerData,
  port: HangWatchdogPort | null = parentPort
): void {
  if (!port) {
    return
  }
  const loop = createHangWatchdogDetectionLoop({
    timeoutMs: config.timeoutMs,
    checkIntervalMs: config.checkIntervalMs,
    now: () => Date.now(),
    onHangDetected: (unresponsiveMs) => {
      recordHangObservation({
        parentPid: config.parentPid,
        markerPath: config.markerPath,
        unresponsiveMs,
        selfRecovered: false
      })
      sampleHungMainThread(config)
    },
    // Update one marker per stall so resolution does not require reconciling a second record.
    onHangResolved: (unresponsiveMs) =>
      recordHangObservation({
        parentPid: config.parentPid,
        markerPath: config.markerPath,
        unresponsiveMs,
        selfRecovered: true
      })
  })

  let checkTimer: ReturnType<typeof setInterval> | null = setInterval(
    () => loop.tick(),
    config.checkIntervalMs
  )
  port.on('message', (message: MainToHangWatchdogWorkerMessage) => {
    if (message.type === 'heartbeat') {
      loop.recordHeartbeat()
    } else if (message.type === 'shutdown') {
      if (checkTimer) {
        clearInterval(checkTimer)
        checkTimer = null
      }
      port.close()
    }
  })
}

export function isHangWatchdogWorkerData(value: unknown): value is HangWatchdogWorkerData {
  const data = value as Partial<HangWatchdogWorkerData> | null
  return (
    !!data &&
    Number.isInteger(data.parentPid) &&
    (data.parentPid ?? 0) > 0 &&
    typeof data.markerPath === 'string' &&
    Number.isFinite(data.timeoutMs) &&
    (data.timeoutMs ?? 0) > 0 &&
    Number.isFinite(data.checkIntervalMs) &&
    (data.checkIntervalMs ?? 0) > 0
  )
}

if (!isMainThread && isHangWatchdogWorkerData(workerData)) {
  runWatchdog(workerData)
}
