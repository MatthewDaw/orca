import React, { useMemo, useState } from 'react'
import { Boxes, Layers, Network, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ImeInput } from '@/lib/ime-text-field'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { WorkspaceContainer } from '../../../../shared/workspace-container-types'
import {
  buildWorkspaceContainerTree,
  nextWorkspaceContainerName,
  type WorkspaceContainerNode
} from './workspace-container-tree'

// Why: card tests and embedded surfaces mount with partial stores that lack the containers slice.
const NO_CONTAINERS: readonly WorkspaceContainer[] = []

const stopBubbleToCard = (event: React.SyntheticEvent): void => event.stopPropagation()

export function createWorkspaceContainerOnWorktree(
  worktreeId: string,
  parentContainerId: string | null = null
): Promise<unknown> {
  const state = useAppStore.getState()
  return state.createWorkspaceContainer({
    worktreeId,
    parentContainerId,
    name: nextWorkspaceContainerName(state.workspaceContainers, worktreeId)
  })
}

function ContainerRow({
  node,
  depth,
  activeContainerId
}: {
  node: WorkspaceContainerNode
  depth: number
  activeContainerId: string | null
}): React.JSX.Element {
  const { container } = node
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(container.name)
  const setActive = useAppStore((s) => s.setActiveWorkspaceContainer)
  const activateTab = useAppStore((s) => s.activateTab)
  const update = useAppStore((s) => s.updateWorkspaceContainer)
  const remove = useAppStore((s) => s.removeWorkspaceContainer)

  const selectContainer = (): void => {
    setActive(container.worktreeId, container.id)
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
    <div onContextMenu={stopBubbleToCard} onDoubleClick={stopBubbleToCard}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            data-workspace-container-id={container.id}
            aria-current={activeContainerId === container.id ? 'true' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-xs text-muted-foreground',
              'hover:bg-accent/60 hover:text-foreground',
              activeContainerId === container.id && 'bg-accent text-foreground'
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={selectContainer}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                selectContainer()
              }
            }}
            onDoubleClick={() => {
              setDraftName(container.name)
              setRenaming(true)
            }}
          >
            <Boxes className="size-3 shrink-0" />
            {renaming ? (
              <ImeInput
                autoFocus
                className="min-w-0 flex-1 rounded bg-background px-1 text-foreground outline-none"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitRename}
                onClick={stopBubbleToCard}
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
              <span className="min-w-0 flex-1 truncate">{container.name}</span>
            )}
            <span className="shrink-0 tabular-nums opacity-70">{container.tabIds.length}</span>
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
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => void remove(container.id)}>
            <Trash2 className="size-3.5" />
            Delete container
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {node.children.map((child) => (
        <ContainerRow
          key={child.container.id}
          node={child}
          depth={depth + 1}
          activeContainerId={activeContainerId}
        />
      ))}
    </div>
  )
}

export function WorktreeContainerRows({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const containers = useAppStore((s) => s.workspaceContainers ?? NO_CONTAINERS)
  const activeContainerId = useAppStore((s) => s.activeContainerIdByWorktree?.[worktreeId] ?? null)
  const setActive = useAppStore((s) => s.setActiveWorkspaceContainer)
  const openGraph = (): void => useAppStore.getState().setContainerGraphOpen(true)
  const tree = useMemo(
    () => buildWorkspaceContainerTree(containers, worktreeId),
    [containers, worktreeId]
  )
  if (tree.length === 0) {
    return null
  }
  return (
    <div
      className="mt-1 space-y-0.5"
      data-worktree-container-rows=""
      data-worktree-native-context-menu=""
    >
      <div
        role="button"
        tabIndex={0}
        aria-current={activeContainerId === null ? 'true' : undefined}
        className={cn(
          'flex items-center gap-1.5 rounded-md py-1 pl-2 pr-1.5 text-xs text-muted-foreground',
          'hover:bg-accent/60 hover:text-foreground',
          activeContainerId === null && 'bg-accent text-foreground'
        )}
        onClick={() => setActive(worktreeId, null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setActive(worktreeId, null)
          }
        }}
      >
        <Layers className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">All tabs</span>
        <button
          type="button"
          aria-label="Open container graph"
          title="Open container graph"
          className="rounded p-0.5 hover:bg-background/60"
          onClick={(event) => {
            event.stopPropagation()
            openGraph()
          }}
        >
          <Network className="size-3" />
        </button>
      </div>
      {tree.map((node) => (
        <ContainerRow
          key={node.container.id}
          node={node}
          depth={0}
          activeContainerId={activeContainerId}
        />
      ))}
    </div>
  )
}
