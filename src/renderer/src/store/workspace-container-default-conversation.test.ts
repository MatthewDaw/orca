import { describe, expect, it } from 'vitest'
import { planDefaultConversation } from './workspace-container-default-conversation'

const claude = (id: string) =>
  ({ agent: 'claude', providerSession: { key: 'session_id', id } }) as const

describe('planDefaultConversation', () => {
  it('makes the first conversation in tab order the default', () => {
    const conversations = new Map([
      ['t2', claude('s2')],
      ['t3', claude('s3')]
    ])
    expect(planDefaultConversation({}, ['t1', 't2', 't3'], conversations)).toEqual({
      tabId: 't2',
      ...claude('s2')
    })
  })

  it('returns null when nothing changed or there is no conversation', () => {
    const current = { tabId: 't1', ...claude('s1') }
    expect(
      planDefaultConversation(
        { defaultConversation: current },
        ['t1'],
        new Map([['t1', claude('s1')]])
      )
    ).toBeNull()
    expect(planDefaultConversation({}, ['t1'], new Map())).toBeNull()
  })

  it('keeps a closed default and follows its session into a new tab', () => {
    const current = { tabId: 'gone', ...claude('s1') }
    expect(
      planDefaultConversation(
        { defaultConversation: current },
        ['t9'],
        new Map([['t9', claude('other')]])
      )
    ).toBeNull()
    expect(
      planDefaultConversation(
        { defaultConversation: current },
        ['t9', 't4'],
        new Map([
          ['t9', claude('other')],
          ['t4', claude('s1')]
        ])
      )
    ).toEqual({ tabId: 't4', ...claude('s1') })
  })

  it('tracks a new session id in the default tab', () => {
    const current = { tabId: 't1', ...claude('s1') }
    expect(
      planDefaultConversation(
        { defaultConversation: current },
        ['t1'],
        new Map([['t1', claude('s2')]])
      )
    ).toEqual({ tabId: 't1', ...claude('s2') })
  })
})
