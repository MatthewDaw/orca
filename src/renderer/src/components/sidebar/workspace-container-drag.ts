import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'

const EDGE_PX = 64
const MIN_STEP_PX = 3
const MAX_STEP_PX = 26

// Why: a running session's tabs and terminal belong to one worktree and cannot follow a
// container elsewhere, so a container (and everything nested in it) may only be pointed at another
// worktree while none of them own tabs; otherwise the sessions would be orphaned and vanish.
export function canRetargetContainer(
  containers: readonly WorkspaceContainer[],
  id: string,
  worktreeId: string
): boolean {
  const dragged = containers.find((c) => c.id === id)
  if (!dragged) {
    return false
  }
  if (dragged.worktreeId === worktreeId) {
    return true
  }
  const subtree = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const c of containers) {
      if (c.parentContainerId && subtree.has(c.parentContainerId) && !subtree.has(c.id)) {
        subtree.add(c.id)
        grew = true
      }
    }
  }
  return !containers.some((c) => subtree.has(c.id) && c.tabIds.length > 0)
}

function scrollerFrom(target: EventTarget | null): HTMLElement | null {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el instanceof HTMLElement) {
      const overflowY = getComputedStyle(el).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el
      }
    }
  }
  return null
}

// The closer the pointer is to an edge (or beyond it), the faster the list scrolls.
function stepFor(distanceToEdge: number): number {
  const closeness = 1 - Math.max(distanceToEdge, 0) / EDGE_PX
  return Math.max(MIN_STEP_PX, Math.round(MAX_STEP_PX * closeness))
}

// Native drag only nudges a scroller slowly, so while a container is dragged the list under
// the pointer scrolls itself when the pointer nears its top or bottom edge. Stops on its own at
// drop or drag end, and the returned function stops it early.
export function startContainerDragAutoScroll(): () => void {
  let pointerY = 0
  let scroller: HTMLElement | null = null
  let frame = 0
  const onOver = (event: DragEvent): void => {
    pointerY = event.clientY
    scroller = scrollerFrom(event.target)
  }
  const tick = (): void => {
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      if (pointerY - rect.top < EDGE_PX) {
        scroller.scrollTop -= stepFor(pointerY - rect.top)
      } else if (rect.bottom - pointerY < EDGE_PX) {
        scroller.scrollTop += stepFor(rect.bottom - pointerY)
      }
    }
    frame = requestAnimationFrame(tick)
  }
  const stop = (): void => {
    cancelAnimationFrame(frame)
    document.removeEventListener('dragover', onOver, true)
    document.removeEventListener('dragend', stop, true)
    document.removeEventListener('drop', stop, true)
  }
  document.addEventListener('dragover', onOver, true)
  document.addEventListener('dragend', stop, true)
  document.addEventListener('drop', stop, true)
  frame = requestAnimationFrame(tick)
  return stop
}
