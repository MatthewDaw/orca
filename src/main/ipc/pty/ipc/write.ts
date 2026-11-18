import type { PtyRendererDelivery } from '../session'
import { getPtyIpc } from '../../pty-host-bindings'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { createPtyWriteInput } from './write-input'
import {
  isLoneCtrlC,
  recordHumanTerminalInput,
  resolveCtrlCForDraft
} from '../../../runtime/terminal-human-draft'

// Why: in Claude and Codex, Ctrl+C with text in the box should only empty the box, but the same
// key interrupts a running task or subagent. The screen says whether the box has text: with text
// it becomes the keys that clear the box; with none it goes through as Ctrl+C.
function needsDraftCheck(
  runtime: OrcaRuntimeService | undefined,
  args: { id: string; data: string; inputKind: string }
): runtime is OrcaRuntimeService {
  return (
    args.inputKind === 'driving' && isLoneCtrlC(args.data) && Boolean(runtime?.isAgentPty(args.id))
  )
}

async function protectDraftFromCtrlC<T extends { id: string; data: string }>(
  runtime: OrcaRuntimeService,
  args: T
): Promise<T> {
  const clear = await resolveCtrlCForDraft(args.id, args.data, (id) =>
    runtime.readComposerDraft(id)
  )
  return clear === null ? args : { ...args, data: clear }
}

export function installPtyWriteIpcHandlers(deps: {
  mainWindow?: PtyRendererDelivery
  runtime?: OrcaRuntimeService
}): void {
  const ipcMain = getPtyIpc()
  const { runtime } = deps
  const {
    writePtyInput,
    writePtyInputAccepted,
    isPtyWritePayload,
    isPtyViewportClaimPayload,
    isPtyWriteEventFromMainWindow
  } = createPtyWriteInput(deps)

  const hostViewportClaimTails = new Map<string, Promise<boolean>>()

  // Why: only a Ctrl+C waits on the screen check; keys typed behind it queue after it so the
  // terminal never sees them out of order.
  const writesInFlight = new Map<string, Promise<unknown>>()
  function routeWrite<P extends { id: string; data: string; inputKind: string }>(
    payload: P,
    write: (args: P) => boolean | Promise<boolean>
  ): boolean | Promise<boolean> {
    const send = (args: P): boolean | Promise<boolean> => {
      if (payload.inputKind === 'driving') {
        recordHumanTerminalInput(payload.id, payload.data)
      }
      return write(args)
    }
    const pending = writesInFlight.get(payload.id)
    if (!pending && !needsDraftCheck(runtime, payload)) {
      return send(payload)
    }
    const run = (pending ?? Promise.resolve())
      .catch(() => undefined)
      .then(
        async () =>
          await send(
            needsDraftCheck(runtime, payload)
              ? await protectDraftFromCtrlC(runtime, payload)
              : payload
          )
      )
    writesInFlight.set(payload.id, run)
    void run
      .catch(() => undefined)
      .finally(() => {
        if (writesInFlight.get(payload.id) === run) {
          writesInFlight.delete(payload.id)
        }
      })
    return run
  }

  ipcMain.on('pty:write', (event, payload: unknown) => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(payload)) {
      return
    }
    void Promise.resolve(
      routeWrite(payload, (args) => {
        const claimTail = hostViewportClaimTails.get(args.id)
        if (claimTail) {
          void claimTail.then((claimed) => (claimed ? writePtyInput(args) : false))
          return true
        }
        writePtyInput(args)
        return true
      })
    ).catch(() => undefined)
  })
  ipcMain.handle('pty:writeAccepted', (event, payload: unknown): boolean | Promise<boolean> => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(payload)) {
      return false
    }
    return routeWrite(payload, (args) => {
      const claimTail = hostViewportClaimTails.get(args.id)
      return claimTail
        ? claimTail.then((claimed) => (claimed ? writePtyInputAccepted(args) : false))
        : writePtyInputAccepted(args)
    })
  })

  ipcMain.removeAllListeners('pty:claimViewport')
  ipcMain.on('pty:claimViewport', (event, args: unknown) => {
    if (!isPtyWriteEventFromMainWindow(event) || !runtime || !isPtyViewportClaimPayload(args)) {
      return
    }
    const prior = hostViewportClaimTails.get(args.id)
    // A second mirrored pane must join the in-flight resize claim before input, never replace it with a no-op.
    const claim = (
      prior
        ? prior.then(
            () => runtime.claimRemoteDesktopHost(args.id, args.cols, args.rows),
            () => runtime.claimRemoteDesktopHost(args.id, args.cols, args.rows)
          )
        : runtime.claimRemoteDesktopHost(args.id, args.cols, args.rows)
    ).catch((error) => {
      // Claim failure drops gated input; surface it instead of failing silently.
      console.error('[pty] remote desktop host claim failed; gated input will be discarded', error)
      return false
    })
    hostViewportClaimTails.set(args.id, claim)
    void claim.then(() => {
      if (hostViewportClaimTails.get(args.id) === claim) {
        hostViewportClaimTails.delete(args.id)
      }
    })
  })
}
