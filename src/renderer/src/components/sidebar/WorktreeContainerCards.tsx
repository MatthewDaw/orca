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
import { createWorkspaceContainerOnWorktree } from './WorktreeContainerRows'
import {
  buildWorkspaceContainerTree,
  type WorkspaceContainerNode
} from './workspace-container-tree'

const NO_CONTAINERS: readonly WorkspaceContainer[] = []
const NO_WORKTREES: readonly Worktree[] = []

let draggedContainerId: string | null = null

// Why: dropping a card on another nests it; a different worktree retargets it first, and a
// rejected drop (cycle) is simply ignored.
async function nestContainer(id: string, parentId: string | null): Promise<void> {
  const { workspaceContainers, updateWorkspaceContainer } = useAppStore.getState()
  const parent = parentId ? workspaceContainers.find((c) => c.id === parentId) : undefined
  const dragged = workspaceContainers.find((c) => c.id === id)
  if (!dragged || id === parentId || (parentId && !parent)) {
    return
  }
  try {
    if (parent && parent.worktreeId !== dragged.worktreeId) {
      await updateWorkspaceContainer(id, { worktreeId: parent.worktreeId })
    }
    await updateWorkspaceContainer(id, { parentContainerId: parentId })
  } catch {
    // Invalid nesting (e.g. into its own descendant): leave the tree unchanged.
  }
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
  const [draftName, setDraftName] = useState(container.name)
  const active = useAppStore(
    (s) =>
      s.activeWorktreeId === container.worktreeId &&
      s.activeContainerIdByWorktree?.[container.worktreeId] === container.id
  )
  const setActive = useAppStore((s) => s.setActiveWorkspaceContainer)
  const activateTab = useAppStore((s) => s.activateTab)
  const update = useAppStore((s) => s.updateWorkspaceContainer)
  const remove = useAppStore((s) => s.removeWorkspaceContainer)
  const target = repoWorktrees.find((w) => w.id === container.worktreeId)
  const targetLabel = target?.displayName || target?.branch?.replace(/^refs\/heads\//, '') || 'main'

  const select = (): void => {
    setActive(container.worktreeId, container.id)
    void activateWorktreeFromSidebar(container.worktreeId)
    const firstTabId = container.tabIds[0]
    if (firstTabId) {
      activateTab(firstTabId)
    }
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
        depth === 0 &&
          node.children.length > 0 &&
          'rounded-lg border border-border/60 bg-accent/20 p-1'
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
              }
            }}
            onDrop={(event) => {
              if (draggedContainerId && draggedContainerId !== container.id) {
                event.preventDefault()
                event.stopPropagation()
                void nestContainer(draggedContainerId, container.id)
                draggedContainerId = null
              }
            }}
            data-workspace-container-id={container.id}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex cursor-pointer flex-col rounded-lg border py-1.5 pr-1.5 pl-3 select-none',
              depth > 0 ? 'border-border bg-accent/40' : 'border-transparent',
              active ? 'bg-accent text-accent-foreground' : 'worktree-sidebar-card-hover'
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
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {container.tabIds.length}
              </span>
            </div>
            <span className="truncate pl-3.5 text-xs text-muted-foreground">on {targetLabel}</span>
            {node.children.length > 0 ? (
              <span className="mt-1 ml-3.5 w-fit rounded border border-border px-1 text-[10px] text-muted-foreground">
                {node.children.length} child{node.children.length > 1 ? 'ren' : ''}
              </span>
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
      {node.children.length > 0 ? (
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

// Why: containers read as sibling cards of the worktree they point at, not rows inside its card.
export function WorktreeContainerCards({
  worktree
}: {
  worktree: Worktree
}): React.JSX.Element | null {
  const containers = useAppStore((s) => s.workspaceContainers ?? NO_CONTAINERS)
  const repoWorktrees = useAppStore((s) => s.worktreesByRepo?.[worktree.repoId] ?? NO_WORKTREES)
  const tree = useMemo(
    () => buildWorkspaceContainerTree(containers, worktree.id),
    [containers, worktree.id]
  )
  if (tree.length === 0) {
    return null
  }
  return (
    <div
      className="mt-1 space-y-1"
      data-worktree-container-cards=""
      onDragOver={(event) => draggedContainerId && event.preventDefault()}
      onDrop={(event) => {
        // Why: dropping on empty space between cards moves a nested container back to the top level.
        if (draggedContainerId) {
          event.preventDefault()
          void nestContainer(draggedContainerId, null)
          draggedContainerId = null
        }
      }}
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
  )
}
