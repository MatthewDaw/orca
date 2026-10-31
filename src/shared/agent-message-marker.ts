// Every message one agent sends another starts with this marker, added by Orca itself rather than
// by the sending agent, so a person can tell them apart from what they typed with one pattern:
// /^\[Message from /. Container messages, launch prompts and `orca terminal send` all use it.
export const AGENT_MESSAGE_MARKER = '[Message from '

export function agentMessageHeader(from: string, detail?: string): string {
  return `${AGENT_MESSAGE_MARKER}${from}${detail ? ` — ${detail}` : ''}]`
}

export function hasAgentMessageMarker(text: string): boolean {
  return text.trimStart().startsWith(AGENT_MESSAGE_MARKER)
}

// Puts the header in front of the text unless the text already opens with the marker, so a message
// that was labelled by one layer is never labelled again by the next.
export function withAgentMessageHeader(header: string, text: string): string {
  return hasAgentMessageMarker(text) ? text : `${header}\n${text}`
}
