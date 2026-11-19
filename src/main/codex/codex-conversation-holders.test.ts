import { describe, expect, it } from 'vitest'
import {
  conversationIdsNamed,
  conversationNameFromTerminalTitle,
  screenShowsConversationLock
} from './codex-conversation-holders'

describe('codex conversation holders', () => {
  it('finds every id indexed under a conversation name', () => {
    const index = [
      '{"id":"a","thread_name":"Fix login"}',
      '{"id":"b","thread_name":"Other"}',
      '{"id":"c","thread_name":"Fix login"}',
      '{"id":"d","thread_na'
    ].join('\n')
    expect(conversationIdsNamed(index, 'Fix login')).toEqual(['a', 'c'])
  })

  it('takes the conversation name from an Orca terminal title', () => {
    expect(conversationNameFromTerminalTitle('Continue handoff implementation | website-2')).toBe(
      'Continue handoff implementation'
    )
  })

  it('recognises the refusal on screen', () => {
    expect(screenShowsConversationLock('This conversation is open in another app.')).toBe(true)
    expect(screenShowsConversationLock('all good')).toBe(false)
  })
})
