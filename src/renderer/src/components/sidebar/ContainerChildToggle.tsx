import React from 'react'
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChildToggle({
  count,
  collapsed,
  onToggle,
  className
}: {
  count: number
  collapsed: boolean
  onToggle: () => void
  className?: string
}): React.JSX.Element {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      className={cn(
        'flex w-fit items-center gap-1 rounded border border-border px-1 text-[10px] text-muted-foreground hover:text-foreground',
        className
      )}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <Boxes className="size-3" />
      {count} child{count > 1 ? 'ren' : ''}
      <Chevron className="size-3" />
    </button>
  )
}
