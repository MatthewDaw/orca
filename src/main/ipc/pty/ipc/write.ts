import type { PtyRendererDelivery } from '../session'
import { getPtyIpc } from '../../pty-host-bindings'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { createPtyWriteInput } from './write-input'
import {
  ctrlCClearsDraftInstead,
  recordHumanTerminalInput
} from '../../../runtime/terminal-human-draft'

// Why: in Claude and Codex, Ctrl+C with text in the box should only empty the box, but the same
// key interrupts a running task or subagent. With text typed it becomes the keys that clear the
// box; with none it goes through as Ctrl+C.
function protectDraftFromCtrlC<T extends { id: string; data: string; inputKind: string }>(
  runtime: OrcaRuntimeService | undefined,
  args: T
): T {
  if (args.inputKind !== 'driving' || !runtime?.isAgentPty(args.id)) {
    return args
  }
  const clear = ctrlCClearsDraftInstead(args.id, args.data)
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

  ipcMain.on('pty:write', (event, payload: unknown) => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(payload)) {
      return
    }
    // Why: the draft count is read before the keystroke is recorded, which would reset it.
    const args = protectDraftFromCtrlC(runtime, payload)
    if (payload.inputKind === 'driving') {
      recordHumanTerminalInput(payload.id, payload.data)
    }
    const claimTail = hostViewportClaimTails.get(args.id)
    if (claimTail) {
      void claimTail.then((claimed) => (claimed ? writePtyInput(args) : false))
      return
    }
    writePtyInput(args)
  })
  ipcMain.handle('pty:writeAccepted', (event, payload: unknown): boolean | Promise<boolean> => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(payload)) {
      return false
    }
    const args = protectDraftFromCtrlC(runtime, payload)
    if (payload.inputKind === 'driving') {
      recordHumanTerminalInput(payload.id, payload.data)
    }
    const claimTail = hostViewportClaimTails.get(args.id)
    return claimTail
      ? claimTail.then((claimed) => (claimed ? writePtyInputAccepted(args) : false))
      : writePtyInputAccepted(args)
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
