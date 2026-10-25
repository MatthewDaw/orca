import React from 'react'
import { Boxes, Network } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { createWorkspaceContainerOnWorktree } from './WorktreeContainerRows'

export function WorktreeContainerMenuItems({
  worktreeId,
  disabled
}: {
  worktreeId: string
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
      <DropdownMenuItem onSelect={() => useAppStore.getState().setContainerGraphOpen(true)}>
        <Network className="size-3.5" />
        Open Container Graph
      </DropdownMenuItem>
    </>
  )
}
