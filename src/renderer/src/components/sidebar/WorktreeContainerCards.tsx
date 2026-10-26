import React, { useMemo, useState } from 'react'
import { Boxes, Network, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ImeInput } from '@/lib/ime-text-field'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { ChildToggle } from './ContainerChildToggle'
import { ContainerUnreadBell } from './ContainerUnreadBell'
import { depthStripeClass } from './workspace-container-depth-stripes'
import { createWorkspaceContainerOnWorktree } from './WorktreeContainerRows'
import {
  buildWorkspaceContainerTree,
  containerSortKey,
  type WorkspaceContainerNode
} from './workspace-container-tree'

const NO_CONTAINERS: readonly WorkspaceContainer[] = []
const NO_WORKTREES: readonly Worktree[] = []

let draggedContainerId: string | null = null

type DropZone = 'before' | 'after' | 'child'

// Why: wide bands (top/bottom quarter = reorder, middle half = nest) so a drop never needs
// pixel precision, and the same zone drives the live preview before release.
function dropZoneFor(event: React.DragEvent<HTMLElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'child'
}

// A dropped container lands beside or inside the target; a different worktree retargets it
// first, and a rejected drop (cycle) is simply ignored.
async function placeContainer(id: string, targetId: string, zone: DropZone): Promise<void> {
  const { workspaceContainers, updateWorkspaceContainer } = useAppStore.getState()
  const dragged = workspaceContainers.find((c) => c.id === id)
  const target = workspaceContainers.find((c) => c.id === targetId)
  if (!dragged || !target || id === targetId) {
    return
  }
  try {
    if (dragged.worktreeId !== target.worktreeId) {
      await updateWorkspaceContainer(id, { worktreeId: target.worktreeId })
    }
    if (zone === 'child') {
      await updateWorkspaceContainer(id, {
        parentContainerId: target.id,
        sortOrder: Date.now()
      })
      return
    }
    const siblings = workspaceContainers
      .filter(
        (c) =>
          c.id !== id &&
          c.worktreeId === target.worktreeId &&
          c.parentContainerId === target.parentContainerId
      )
      .sort((a, b) => containerSortKey(a) - containerSortKey(b))
    const at = siblings.findIndex((c) => c.id === target.id)
    const targetKey = containerSortKey(target)
    const neighbor = siblings[zone === 'before' ? at - 1 : at + 1]
    const neighborKey = neighbor
      ? containerSortKey(neighbor)
      : targetKey + (zone === 'before' ? -1000 : 1000)
    await updateWorkspaceContainer(id, {
      parentContainerId: target.parentContainerId,
      sortOrder: (targetKey + neighborKey) / 2
    })
  } catch {
    // Invalid placement (e.g. into its own descendant): leave the tree unchanged.
  }
}

async function moveContainerToWorktree(id: string, worktreeId: string): Promise<void> {
  const { workspaceContainers, updateWorkspaceContainer } = useAppStore.getState()
  const dragged = workspaceContainers.find((c) => c.id === id)
  if (!dragged) {
    return
  }
  // Same worktree: dropping on the box un-nests; another worktree: retarget (releases its tabs).
  await updateWorkspaceContainer(
    id,
    dragged.worktreeId === worktreeId ? { parentContainerId: null } : { worktreeId }
  )
}

const stopBubble = (event: React.SyntheticEvent): void => event.stopPropagation()

function ContainerCard({
  node,
  depth,
  repoWorktrees
}: {
  node: WorkspaceContainerNode
  depth: number
  repoWorktrees: readonly Worktree[]
}): React.JSX.Element {
  const { container } = node
  const [renaming, setRenaming] = useState(false)
  const childrenCollapsed = useAppStore((s) => s.collapsedContainerIds[container.id] === true)
  const setContainersCollapsed = useAppStore((s) => s.setContainersCollapsed)
  const [draftName, setDraftName] = useState(container.name)
  const active = useAppStore(
    (s) =>
      s.activeWorktreeId === container.worktreeId &&
      s.activeContainerIdByWorktree?.[container.worktreeId] === container.id
  )
  const setActive = useAppStore((s) => s.setActiveWorkspaceContainer)
  const update = useAppStore((s) => s.updateWorkspaceContainer)
  const remove = useAppStore((s) => s.removeWorkspaceContainer)
  const target = repoWorktrees.find((w) => w.id === container.worktreeId)
  const targetLabel = target?.displayName || target?.branch?.replace(/^refs\/heads\//, '') || 'main'

  const select = (): void => {
    setActive(container.worktreeId, container.id)
    // Why: opening a container is looking at it, so its finished-agent markers are read.
    useAppStore.getState().readOnScreenAttention(
      {
        workspaceIds: [],
        targets: [...container.tabIds, ...(container.terminalTabIds ?? [])].map((tabId) => ({
          worktreeId: container.worktreeId,
          tabId
        }))
      },
      { screenArrived: false }
    )
    // Why: which tab shows is decided by the container's remembered (or leftmost) tab, not here.
    void activateWorktreeFromSidebar(container.worktreeId)
  }

  const commitRename = (): void => {
    setRenaming(false)
    const name = draftName.trim()
    if (name && name !== container.name) {
      void update(container.id, { name })
    }
  }

  return (
    <div
      onContextMenu={stopBubble}
      onDoubleClick={stopBubble}
      className={cn(
        depth === 0 && 'ml-1',
        // Why: a parent with children wraps them in its own outlined surface, like worktree lineage.
        node.children.length > 0 && 'rounded-lg border border-border/60 bg-accent/20 p-1'
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            draggable={!renaming}
            onDragStart={(event) => {
              draggedContainerId = container.id
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', container.id)
            }}
            onDragEnd={() => {
              draggedContainerId = null
            }}
            onDragOver={(event) => {
              if (draggedContainerId && draggedContainerId !== container.id) {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.dataset.drop = dropZoneFor(event)
              }
            }}
            onDragLeave={(event) => {
              delete event.currentTarget.dataset.drop
            }}
            onDrop={(event) => {
              delete event.currentTarget.dataset.drop
              if (draggedContainerId && draggedContainerId !== container.id) {
                event.preventDefault()
                event.stopPropagation()
                void placeContainer(draggedContainerId, container.id, dropZoneFor(event))
                draggedContainerId = null
              }
            }}
            data-workspace-container-id={container.id}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'relative flex cursor-pointer flex-col rounded-lg border py-1.5 pr-1.5 pl-3 select-none',
              // Why: the drop preview — a line where it would land, or a ring on the new parent.
              'data-[drop=child]:bg-accent data-[drop=child]:ring-2 data-[drop=child]:ring-ring',
              "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-1 data-[drop=before]:before:h-0.5 data-[drop=before]:before:rounded data-[drop=before]:before:bg-ring data-[drop=before]:before:content-['']",
              "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-1 data-[drop=after]:after:h-0.5 data-[drop=after]:after:rounded data-[drop=after]:after:bg-ring data-[drop=after]:after:content-['']",
              'border-border bg-accent/40 border-l-[3px]',
              depthStripeClass(depth, active),
              // Why: the selected container must stand out at a glance, so it gets a full ring and a tinted fill.
              active
                ? 'bg-primary/15 text-accent-foreground ring-2 ring-primary'
                : 'worktree-sidebar-card-hover'
            )}
            onClick={select}
            onKeyDown={(event) => event.key === 'Enter' && select()}
            onDoubleClick={() => {
              setDraftName(container.name)
              setRenaming(true)
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-git-graph-lane-4" />
              {renaming ? (
                <ImeInput
                  autoFocus
                  className="min-w-0 flex-1 rounded bg-background px-1 text-sm text-foreground outline-none"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitRename}
                  onClick={stopBubble}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') {
                      commitRename()
                    } else if (event.key === 'Escape') {
                      setRenaming(false)
                    }
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {container.name}
                </span>
              )}
              <ContainerUnreadBell
                own={container}
                containers={childrenCollapsed ? flattenNode(node) : [container]}
              />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {container.tabIds.length}
              </span>
            </div>
            <span className="truncate pl-3.5 text-xs text-muted-foreground">on {targetLabel}</span>
            {node.children.length > 0 ? (
              <ChildToggle
                className="mt-1 ml-3.5"
                count={node.children.length}
                collapsed={childrenCollapsed}
                onToggle={() =>
                  // Why: collapsing a parent folds everything nested in it too; expanding opens one level.
                  setContainersCollapsed(
                    childrenCollapsed ? [container.id] : flattenNode(node).map((c) => c.id),
                    !childrenCollapsed
                  )
                }
              />
            ) : null}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() =>
              void createWorkspaceContainerOnWorktree(container.worktreeId, container.id)
            }
          >
            <Plus className="size-3.5" />
            New nested container
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Boxes className="size-3.5" />
              Point at worktree
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {repoWorktrees.map((w) => (
                <ContextMenuItem
                  key={w.id}
                  disabled={w.id === container.worktreeId}
                  onSelect={() => void update(container.id, { worktreeId: w.id })}
                >
                  {w.displayName || w.branch?.replace(/^refs\/heads\//, '') || w.path}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={() => useAppStore.getState().setContainerGraphOpen(true)}>
            <Network className="size-3.5" />
            Open container graph
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => void remove(container.id)}>
            <Trash2 className="size-3.5" />
            Delete container
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {node.children.length > 0 && !childrenCollapsed ? (
        <div className="mt-1 ml-3 space-y-1">
          {node.children.map((child) => (
            <ContainerCard
              key={child.container.id}
              node={child}
              depth={depth + 1}
              repoWorktrees={repoWorktrees}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Why: a worktree with containers draws one outlined box around its card and its container
// children; dropping a dragged container anywhere on the box points it at this worktree.
export function WorktreeContainerBox({
  worktree,
  children
}: {
  worktree: Worktree
  children: React.ReactNode
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const containers = useAppStore((s) => s.workspaceContainers ?? NO_CONTAINERS)
  const repoWorktrees = useAppStore((s) => s.worktreesByRepo?.[worktree.repoId] ?? NO_WORKTREES)
  const tree = useMemo(
    () => buildWorkspaceContainerTree(containers, worktree.id),
    [containers, worktree.id]
  )
  return (
    <div
      className={cn(
        tree.length > 0 && 'mx-1 rounded-lg border border-border bg-accent/30 pb-1',
        'data-[drop=worktree]:ring-2 data-[drop=worktree]:ring-ring'
      )}
      onDragOver={(event) => {
        if (draggedContainerId) {
          event.preventDefault()
          event.currentTarget.dataset.drop = 'worktree'
        }
      }}
      onDragLeave={(event) => {
        if (
          !(
            event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
          )
        ) {
          delete event.currentTarget.dataset.drop
        }
      }}
      onDrop={(event) => {
        delete event.currentTarget.dataset.drop
        if (draggedContainerId) {
          event.preventDefault()
          void moveContainerToWorktree(draggedContainerId, worktree.id)
          draggedContainerId = null
        }
      }}
    >
      {/* Why: the worktree card is a space of its own, so selecting it leaves any container. */}
      <div
        onClickCapture={(event) => {
          const owner =
            event.target instanceof Element ? event.target.closest('[data-worktree-id]') : null
          if (owner instanceof HTMLElement && owner.dataset.worktreeId === worktree.id) {
            useAppStore.getState().setActiveWorkspaceContainer(worktree.id, null)
          }
        }}
      >
        {children}
      </div>
      {tree.length > 0 ? (
        <ChildToggle
          className="mt-1 ml-5"
          count={tree.length}
          collapsed={collapsed}
          onToggle={() => {
            // Why: folding the worktree folds every container under it, so reopening starts tidy.
            if (!collapsed) {
              useAppStore.getState().setContainersCollapsed(
                tree.flatMap(flattenNode).map((c) => c.id),
                true
              )
            }
            setCollapsed((value) => !value)
          }}
        />
      ) : null}
      {tree.length > 0 && !collapsed ? (
        <div
          className="mt-1 space-y-1 px-1"
          data-worktree-container-cards=""
          onPointerDown={stopBubble}
          onClick={stopBubble}
        >
          {tree.map((node) => (
            <ContainerCard
              key={node.container.id}
              node={node}
              depth={0}
              repoWorktrees={repoWorktrees}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function flattenNode(node: WorkspaceContainerNode): WorkspaceContainer[] {
  return [node.container, ...node.children.flatMap(flattenNode)]
}
