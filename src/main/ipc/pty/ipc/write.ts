import type { PtyRendererDelivery } from '../session'
import { getPtyIpc } from '../../pty-host-bindings'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { createPtyWriteInput } from './write-input'
import {
  interruptKeyFor,
  isLoneCtrlC,
  recordHumanTerminalInput,
  resolveCtrlCForDraft
} from '../../../runtime/terminal-human-draft'

// Why: in Claude and Codex, Ctrl+C only clears the input box (it never interrupts), and Ctrl+X
// is the interrupt, sent as Escape so it stops the running turn but not subagents. The screen
// says whether the box has text. Terminals Orca has not recognised as agents keep plain Ctrl+C.
function needsKeyRewrite(
  runtime: OrcaRuntimeService | undefined,
  args: { id: string; data: string; inputKind: string }
): runtime is OrcaRuntimeService {
  return (
    Boolean(runtime) &&
    args.inputKind === 'driving' &&
    (isLoneCtrlC(args.data) || interruptKeyFor(args.data) !== null)
  )
}

async function rewriteAgentKey<T extends { id: string; data: string }>(
  runtime: OrcaRuntimeService,
  args: T
): Promise<T> {
  const isAgent = runtime.isAgentPty(args.id)
  const interrupt = interruptKeyFor(args.data)
  if (interrupt !== null) {
    return isAgent ? { ...args, data: interrupt } : args
  }
  const clear = await resolveCtrlCForDraft(
    args.id,
    args.data,
    (id) => runtime.readComposerDraft(id),
    isAgent
  )
  return clear === null ? args : { ...args, data: clear }
}

const KEY_GAP_MS = 3

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
    const send = async (args: P): Promise<boolean> => {
      if (payload.inputKind === 'driving') {
        recordHumanTerminalInput(payload.id, payload.data)
      }
      if (args.data === '') {
        return true
      }
      if (args.data === payload.data || args.data.length < 2) {
        return write(args)
      }
      // Why: the clear keys go one at a time; arriving as a single burst, the TUI reads them as
      // pasted text and its box stops matching what is on screen.
      let accepted = true
      for (const key of args.data) {
        accepted = (await write({ ...args, data: key })) && accepted
        await new Promise((resolve) => setTimeout(resolve, KEY_GAP_MS))
      }
      return accepted
    }
    const pending = writesInFlight.get(payload.id)
    if (!pending && !needsKeyRewrite(runtime, payload)) {
      return send(payload)
    }
    const run = (pending ?? Promise.resolve())
      .catch(() => undefined)
      .then(
        async () =>
          await send(
            needsKeyRewrite(runtime, payload) ? await rewriteAgentKey(runtime, payload) : payload
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
