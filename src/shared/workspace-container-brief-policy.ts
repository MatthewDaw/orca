import type { WorkspaceContainer } from './workspace-container-types'

// Briefs are read by every nested agent on every launch, so they must stay small and change
// slowly: a hard size cap, and a cooldown between agent-made edits. The owner editing in the UI
// is never rate-limited.
export const BRIEF_MAX_CHARS = 2000
export const BRIEF_AGENT_COOLDOWN_MS = 60 * 60 * 1000

export type BriefUpdateCheck = { ok: true } | { ok: false; reason: string }

export function checkAgentBriefUpdate(
  container: Pick<WorkspaceContainer, 'brief' | 'briefAgentUpdatedAt'>,
  text: string,
  now: number
): BriefUpdateCheck {
  const length = text.trim().length
  if (length > BRIEF_MAX_CHARS) {
    return {
      ok: false,
      reason: `The brief is ${length} characters; the limit is ${BRIEF_MAX_CHARS}. Condense it: drop stale or task-specific detail and keep only durable conventions and decisions.`
    }
  }
  if (text.trim() === (container.brief ?? '').trim()) {
    return { ok: false, reason: 'The brief is unchanged.' }
  }
  const waitMs = (container.briefAgentUpdatedAt ?? 0) + BRIEF_AGENT_COOLDOWN_MS - now
  if (waitMs > 0) {
    return {
      ok: false,
      reason: `The brief was updated by an agent recently. It changes slowly on purpose; try again in ${Math.ceil(waitMs / 60000)} minutes, and only if the change is still needed.`
    }
  }
  return { ok: true }
}

export const BRIEF_MAINTENANCE_RULES = [
  `Update your brief only for durable decisions or conventions that the containers nested under you need — not for task progress, one-off requests, or anything you could say in a message. Most user messages should NOT change it.`,
  `Keep it under ${BRIEF_MAX_CHARS} characters by rewriting, not appending: remove anything stale or obvious while adding new points.`,
  'Replace it with `orca container brief --set "<full new brief>"`; agent edits are limited to one per hour.'
]
