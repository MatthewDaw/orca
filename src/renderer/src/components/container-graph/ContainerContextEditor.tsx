import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type {
  WorkspaceContainer,
  WorkspaceContainerConnection,
  WorkspaceContainerPatch
} from '../../../../shared/workspace-container-types'

const FIELD_LABEL = 'text-[11px] font-medium text-muted-foreground'

export function collectContainerDescendantIds(
  containers: readonly WorkspaceContainer[],
  id: string
): Set<string> {
  const found = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const container of containers) {
      if (container.parentContainerId === current && !found.has(container.id)) {
        found.add(container.id)
        queue.push(container.id)
      }
    }
  }
  return found
}

export function ContainerContextEditor({
  container,
  containers,
  onPatch,
  onReparent,
  onRemove,
  onClose
}: {
  container: WorkspaceContainer
  containers: readonly WorkspaceContainer[]
  onPatch: (patch: WorkspaceContainerPatch) => void
  onReparent: (parentContainerId: string | null) => void
  onRemove: () => void
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(container.name)
  const [focus, setFocus] = useState(container.focus)
  useEffect(() => {
    setName(container.name)
    setFocus(container.focus)
  }, [container.id, container.name, container.focus])

  const byId = new Map(containers.map((c) => [c.id, c]))
  const blockedParents = collectContainerDescendantIds(containers, container.id).add(container.id)
  const parentOptions = containers.filter(
    (c) => c.worktreeId === container.worktreeId && !blockedParents.has(c.id)
  )

  const patchConnection = (index: number, patch: Partial<WorkspaceContainerConnection>): void =>
    onPatch({
      connections: container.connections.map((connection, i) =>
        i === index ? { ...connection, ...patch } : connection
      )
    })

  return (
    <aside className="flex h-full w-80 shrink-0 scrollbar-sleek flex-col gap-3 overflow-y-auto border-l border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Context page</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close editor"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Name</span>
        <Input
          density="compact"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name.trim() && name !== container.name && onPatch({ name: name.trim() })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Nested in</span>
        <select
          className="h-7 rounded-md border border-border bg-input/50 px-2 text-xs"
          value={container.parentContainerId ?? ''}
          onChange={(event) => onReparent(event.target.value || null)}
        >
          <option value="">Nothing (top level)</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Main focus</span>
        <Textarea
          rows={5}
          placeholder="What is this agent's main job?"
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
          onBlur={() => focus !== container.focus && onPatch({ focus })}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>Connections</span>
        {container.connections.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Drag from this node&apos;s right handle to another container to connect them.
          </p>
        ) : null}
        {container.connections.map((connection, index) => (
          <ConnectionField
            key={connection.targetContainerId}
            targetName={byId.get(connection.targetContainerId)?.name ?? 'Missing container'}
            description={connection.description}
            onCommit={(description) => patchConnection(index, { description })}
            onRemove={() =>
              onPatch({ connections: container.connections.filter((_, i) => i !== index) })
            }
          />
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" className="mt-auto" onClick={onRemove}>
        Delete container
      </Button>
    </aside>
  )
}

function ConnectionField({
  targetName,
  description,
  onCommit,
  onRemove
}: {
  targetName: string
  description: string
  onCommit: (description: string) => void
  onRemove: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(description)
  useEffect(() => setDraft(description), [description])
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="truncate">{targetName}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove connection"
          onClick={onRemove}
        >
          <X className="size-3" />
        </Button>
      </div>
      <Textarea
        rows={3}
        placeholder="How do you reach this agent, and when?"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== description && onCommit(draft)}
      />
    </div>
  )
}
