import React from 'react'
import { Boxes, Network, Plus } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { createWorkspaceContainerOnWorktree } from './WorktreeContainerRows'

export function WorktreeContainerMenuItems({
  worktreeId,
  repoId,
  disabled
}: {
  worktreeId: string
  repoId: string
  disabled: boolean
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem
        onSelect={() => void createWorkspaceContainerOnWorktree(worktreeId)}
        disabled={disabled}
      >
        <Boxes className="size-3.5" />
        New Container
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          useAppStore.getState().openModal('new-workspace-composer', {
            initialRepoId: repoId,
            telemetrySource: 'sidebar'
          })
        }
        disabled={disabled}
      >
        <Plus className="size-3.5" />
        New Container in New Worktree
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => useAppStore.getState().setContainerGraphOpen(true)}>
        <Network className="size-3.5" />
        Open Container Graph
      </DropdownMenuItem>
    </>
  )
}
