import { InvalidArgumentError } from '../../core'
import { isTerminalQueryReply } from '../../../../../shared/terminal-query-reply'
import type { RuntimeTerminalSend } from '../../../../../shared/runtime-terminal-send-contract'
import type { DriverState, OrcaRuntimeService } from '../../../orca-runtime'
import {
  TERMINAL_INPUT_MAX_BYTES,
  TERMINAL_INPUT_TOO_LARGE_ERROR,
  isTerminalInputTooLargeWithYield
} from '../../../../../shared/terminal-input'
import type { TerminalViewportClient } from './terminal-stream-types'
import { isUserComposing, waitUntilUserStopsComposing } from '../../../terminal-human-draft'

export function isTerminalInputLockedForClient(
  runtime: OrcaRuntimeService,
  ptyId: string,
  client: TerminalViewportClient | undefined
): boolean {
  if (client?.type === 'mobile') {
    return false
  }
  // Why: pre-refactor mobile builds sent no client metadata, so treat a missing client as legacy mobile (unlocked).
  if (!client) {
    return false
  }
  return runtime.getDriver(ptyId).kind === 'mobile'
}

export async function assertTerminalSendTextWithinLimit(text: string | undefined): Promise<void> {
  if (!text) {
    return
  }
  // Why: sends can be paste-sized; validate outside Zod so large input yields before runtime dispatch.
  if (await isTerminalInputTooLargeWithYield(text, TERMINAL_INPUT_MAX_BYTES)) {
    throw new InvalidArgumentError(TERMINAL_INPUT_TOO_LARGE_ERROR)
  }
}

export function resolveMobileFloorClientId(
  driver: DriverState | null,
  client: TerminalViewportClient | undefined
): string | null {
  if (client?.type === 'mobile') {
    return client.id
  }
  if (!client && driver?.kind === 'mobile') {
    return driver.clientId
  }
  return null
}

export type TerminalStreamInputOutcome = 'delivered' | 'rejected' | 'failed'

function isTerminalStreamInputRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_not_writable') || message.includes('terminal_handle_stale')
}

export async function sendTerminalStreamInput(
  runtime: OrcaRuntimeService,
  args: {
    terminal: string
    text: string
    client: TerminalViewportClient | undefined
    isMobile: boolean
    /** Waits for the provider's handoff; one that may have written is `failed`, not `rejected`. */
    requireWriteSettlement?: boolean
  }
): Promise<TerminalStreamInputOutcome> {
  const action = { text: args.text, enter: false, interrupt: false }
  const clientId = args.isMobile ? args.client?.id : undefined
  const floorClaim: MobileInputFloorClaimHolder = { current: null }
  const settlement = args.requireWriteSettlement ? { requireWriteSettlement: true as const } : {}
  try {
    const result = await runtime.sendTerminal(args.terminal, action, {
      inputKind: 'driving',
      ...settlement,
      ...(clientId
        ? {
            reserveWrite: (writePtyId: string) => {
              const claim = runtime.beginMobileInputFloor(writePtyId, clientId)
              if (!claim) {
                throw new Error('mobile_input_floor_unavailable')
              }
              floorClaim.current = claim
            },
            afterWrite: () => commitMobileInputFloorClaim(floorClaim)
          }
        : {})
    })
    const outcome = streamInputOutcome(result)
    if (outcome === 'rejected') {
      floorClaim.current?.rollback()
    }
    return outcome
  } catch (error) {
    floorClaim.current?.rollback()
    return isTerminalStreamInputRejection(error) ? 'rejected' : 'failed'
  }
}

function streamInputOutcome(result: RuntimeTerminalSend): TerminalStreamInputOutcome {
  if (result.writeSettlement?.outcome === 'unverifiable') {
    // Why: only bytes that may already be in flight are ambiguous; the rest are a proven refusal.
    return result.writeSettlement.bytesHandedToTransport ? 'failed' : 'rejected'
  }
  return result.accepted ? 'delivered' : 'rejected'
}

export type MobileInputFloorClaimHolder = {
  current: ReturnType<OrcaRuntimeService['beginMobileInputFloor']>
}

export async function commitMobileInputFloorClaim(
  claim: MobileInputFloorClaimHolder
): Promise<void> {
  const current = claim.current
  if (!current) {
    return
  }
  try {
    await current.commit()
  } finally {
    // Why: the runtime may yield before the next write, which then needs a fresh reservation if desktop reclaimed the floor.
    if (claim.current === current) {
      claim.current = null
    }
  }
}

export function getTerminalSendGuardRefusedReason(
  error: unknown
): 'no-agent' | 'permission' | undefined {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('terminal_guard_permission')) {
    return 'permission'
  }
  if (message.includes('terminal_guard_no_agent')) {
    return 'no-agent'
  }
  return undefined
}

export function isTerminalSendGuardNotWritable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_guard_not_writable')
}

export function assertTerminalSendExactPtyBinding(
  runtime: OrcaRuntimeService,
  handle: string,
  expectedPtyId: string | undefined
): void {
  try {
    if (expectedPtyId && runtime.resolveLiveLeafForHandle(handle)?.ptyId === expectedPtyId) {
      return
    }
  } catch {
    // Fall through to the stable guarded-send result below.
  }
  throw new Error('terminal_guard_not_writable')
}

// A message that would land inside a person's unsent draft waits for them to submit or clear it,
// then types itself in. Returns the immediate reply when it deferred, or null to send right away.
export function deferSendWhileUserComposes(
  runtime: OrcaRuntimeService,
  params: {
    terminal: string
    text?: string
    enter?: unknown
    interrupt?: unknown
    agentPrompt?: true
    deferWhileUserTyping?: true
    inputKind?: string
    client?: { id: string; type?: string }
    waitSubmitMs?: number
    requireWriteSettlement?: true
    resolvedLaunchDraft?: unknown
    requireAgentStatus?: string
  },
  ptyId: string | null | undefined
): { send: RuntimeTerminalSend } | null {
  const { terminal, text } = params
  const enter = params.enter === true
  // Why: every programmatic sender waits for the person's draft, not only the ones that ask. A
  // person's own input (mobile), query replies, and callers that need a synchronous receipt go
  // straight on; agent prompts among those still wait inside the runtime before writing.
  const needsReceipt =
    params.waitSubmitMs !== undefined ||
    params.requireWriteSettlement === true ||
    params.resolvedLaunchDraft !== undefined ||
    params.requireAgentStatus !== undefined
  if (
    (!params.deferWhileUserTyping && needsReceipt) ||
    params.client?.type === 'mobile' ||
    params.inputKind === 'query-reply' ||
    params.interrupt === true ||
    !ptyId ||
    !isUserComposing(ptyId)
  ) {
    return null
  }
  void waitUntilUserStopsComposing(ptyId)
    .then(async () => {
      // Why: same paste-then-submit path an immediate send takes, so a queued message is sent, not left in the box.
      if (
        params.agentPrompt &&
        text &&
        enter &&
        (await runtime.isTerminalRunningSettledPromptAgent(terminal))
      ) {
        return runtime.sendTerminalAgentPrompt(terminal, text, { inputKind: 'driving' })
      }
      return runtime.sendTerminal(
        terminal,
        { text, enter, interrupt: false },
        { inputKind: 'driving' }
      )
    })
    .catch(() => undefined)
  return { send: { handle: terminal, accepted: true, bytesWritten: 0, queued: true } }
}

export function isInvalidTerminalQueryReply(
  params: {
    inputKind?: string
    text?: string
    enter?: unknown
    interrupt?: unknown
    agentPrompt?: unknown
    requireAgentStatus?: unknown
    client?: { id: string; type?: string }
  },
  clientId: string | undefined,
  queryReplyClientId: string | undefined
): boolean {
  return (
    params.inputKind === 'query-reply' &&
    (!params.text ||
      !isTerminalQueryReply(params.text) ||
      params.enter === true ||
      params.interrupt === true ||
      params.agentPrompt === true ||
      params.requireAgentStatus !== undefined ||
      params.client?.type !== 'mobile' ||
      !queryReplyClientId ||
      (clientId !== undefined && params.client.id !== clientId))
  )
}
