import { describe, expect, it } from 'vitest'
import {
  agentMessageHeader,
  hasAgentMessageMarker,
  withAgentMessageHeader
} from './agent-message-marker'

describe('agent message marker', () => {
  it('builds one detectable header with an optional detail', () => {
    expect(agentMessageHeader('site › api (container id c1)')).toBe(
      '[Message from site › api (container id c1)]'
    )
    expect(agentMessageHeader('x', 'exchange 1/8')).toBe('[Message from x — exchange 1/8]')
  })

  it('labels text once and never twice', () => {
    const header = agentMessageHeader('x')
    const labelled = withAgentMessageHeader(header, 'do the thing')
    expect(labelled).toBe('[Message from x]\ndo the thing')
    expect(withAgentMessageHeader(header, labelled)).toBe(labelled)
    expect(hasAgentMessageMarker('  [Message from y]\nhi')).toBe(true)
    expect(hasAgentMessageMarker('hello')).toBe(false)
  })
})
