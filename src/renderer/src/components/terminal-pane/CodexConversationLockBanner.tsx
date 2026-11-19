import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { PaneTopWarningBanner } from './PaneTopWarningBanner'

const CHECK_EVERY_MS = 2_500
// Why: Codex needs a moment to release the conversation before R can take it.
const RETRY_AFTER_RELEASE_MS = 700

/** Asks while the pane is on screen; the answer is yes only while Codex shows its refusal. */
function usePaneConversationLocked(ptyId: string, enabled: boolean): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    const check = (): void => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void window.api.pty
        .codexConversationLock(ptyId)
        .catch(() => ({ locked: false, holders: 0 }))
        .then((status) => {
          if (!cancelled) {
            setLocked(status.locked)
          }
        })
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      setLocked(false)
    }
  }, [ptyId, enabled])
  return locked
}

/** For a Codex pane refused with "This conversation is open in another app": one click closes the other copy. */
export function CodexConversationLockBanner({
  ptyId,
  tabId,
  leafId
}: {
  ptyId: string
  tabId: string
  leafId: string
}): React.JSX.Element | null {
  const paneKey = makePaneKey(tabId, leafId)
  const codexInPane = useAppStore(
    (state) =>
      state.paneForegroundAgentByPaneKey[paneKey]?.agent === 'codex' ||
      state.agentStatusByPaneKey[paneKey]?.agentType === 'codex'
  )
  const locked = usePaneConversationLocked(ptyId, codexInPane)
  const [releasing, setReleasing] = useState(false)
  if (!locked) {
    return null
  }
  const release = (): void => {
    setReleasing(true)
    void window.api.pty
      .codexConversationLock(ptyId, true)
      .then(() => {
        // Why: Codex's own prompt is "press R to continue here"; the click answers it.
        setTimeout(() => window.api.pty.write(ptyId, 'r', 'driving'), RETRY_AFTER_RELEASE_MS)
      })
      .finally(() => setReleasing(false))
  }
  return (
    <PaneTopWarningBanner
      title={translate(
        'terminal.codexConversationLockBanner.title',
        'This conversation is open in another tab'
      )}
      body={translate(
        'terminal.codexConversationLockBanner.body',
        'Close it there to continue here. Anything it is running stops.'
      )}
      primaryAction={
        <Button type="button" size="xs" disabled={releasing} onClick={release}>
          {translate(
            'terminal.codexConversationLockBanner.closeOther',
            'Close it in the other tab and continue here'
          )}
        </Button>
      }
    />
  )
}
