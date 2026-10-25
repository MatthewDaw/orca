import React from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTAINER_GROUP_HEADER_HEIGHT, type ContainerNodeData } from './container-graph-model'

export function ContainerNodeCard({
  data,
  selected
}: NodeProps<Node<ContainerNodeData>>): React.JSX.Element {
  const { container, worktreeName, isGroup } = data
  return (
    <div
      className={cn(
        'size-full rounded-lg border bg-card text-card-foreground shadow-xs',
        isGroup && 'bg-card/40',
        selected ? 'border-ring ring-1 ring-ring/60' : 'border-border'
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div
        className="flex flex-col justify-center gap-0.5 px-3"
        style={{ height: isGroup ? CONTAINER_GROUP_HEADER_HEIGHT : undefined, minHeight: 56 }}
      >
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{container.name}</span>
          <span className="ml-auto shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground">
            {container.tabIds.length} tabs
          </span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{worktreeName}</div>
        {!isGroup && container.focus.trim() ? (
          <div className="line-clamp-2 text-[11px] text-muted-foreground/90">
            {container.focus.trim()}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
