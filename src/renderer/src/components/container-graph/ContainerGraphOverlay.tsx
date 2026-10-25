import '@xyflow/react/dist/style.css'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { nextWorkspaceContainerName } from '../sidebar/workspace-container-tree'
import { ContainerContextEditor } from './ContainerContextEditor'
import { ContainerNodeCard } from './ContainerNodeCard'
import {
  absoluteContainerPosition,
  buildContainerGraph,
  CONTAINER_GROUP_HEADER_HEIGHT,
  CONTAINER_GROUP_PADDING,
  measureContainer,
  type ContainerNodeData
} from './container-graph-model'

const NODE_TYPES = { container: ContainerNodeCard }
const CHILD_ROW_GAP = 16

function GraphCanvas(): React.JSX.Element {
  const containers = useAppStore((s) => s.workspaceContainers)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const createContainer = useAppStore((s) => s.createWorkspaceContainer)
  const updateContainer = useAppStore((s) => s.updateWorkspaceContainer)
  const removeContainer = useAppStore((s) => s.removeWorkspaceContainer)
  const setOpen = useAppStore((s) => s.setContainerGraphOpen)

  const worktrees = useMemo(
    () =>
      Object.values(worktreesByRepo)
        .flat()
        .map((w) => ({ id: w.id, name: w.displayName })),
    [worktreesByRepo]
  )
  const worktreeNames = useMemo(() => new Map(worktrees.map((w) => [w.id, w.name])), [worktrees])
  const [newWorktreeId, setNewWorktreeId] = useState(activeWorktreeId ?? worktrees[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const model = useMemo(
    () => buildContainerGraph(containers, worktreeNames),
    [containers, worktreeNames]
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ContainerNodeData>>(model.nodes)
  useEffect(() => {
    setNodes(model.nodes.map((node) => ({ ...node, selected: node.id === selectedId })))
  }, [model.nodes, selectedId, setNodes])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const typing =
        event.target instanceof HTMLElement &&
        event.target.matches('input, textarea, select, [contenteditable="true"]')
      if (event.key === 'Escape' && !typing) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  const selected = containers.find((c) => c.id === selectedId) ?? null

  const handleConnect = useCallback(
    (connection: Connection) => {
      const source = containers.find((c) => c.id === connection.source)
      if (
        !source ||
        connection.source === connection.target ||
        source.connections.some((c) => c.targetContainerId === connection.target)
      ) {
        return
      }
      void updateContainer(source.id, {
        connections: [
          ...source.connections,
          { targetContainerId: connection.target, description: '' }
        ]
      })
      setSelectedId(source.id)
    },
    [containers, updateContainer]
  )

  const handleEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        const source = containers.find((c) => c.id === edge.source)
        if (source) {
          void updateContainer(source.id, {
            connections: source.connections.filter((c) => c.targetContainerId !== edge.target)
          })
        }
      }
    },
    [containers, updateContainer]
  )

  const reparent = (containerId: string, parentContainerId: string | null): void => {
    if (parentContainerId) {
      const siblings = containers.filter(
        (c) => c.parentContainerId === parentContainerId && c.id !== containerId
      )
      const y = siblings.reduce(
        (bottom, c) =>
          Math.max(bottom, c.position.y + measureContainer(containers, c).height + CHILD_ROW_GAP),
        CONTAINER_GROUP_HEADER_HEIGHT + CHILD_ROW_GAP
      )
      void updateContainer(containerId, {
        parentContainerId,
        position: { x: CONTAINER_GROUP_PADDING, y }
      })
      return
    }
    const absolute = absoluteContainerPosition(containers, containerId)
    void updateContainer(containerId, {
      parentContainerId: null,
      position: { x: absolute.x + 40, y: absolute.y + 40 }
    })
  }

  const createNew = async (): Promise<void> => {
    if (!newWorktreeId) {
      return
    }
    const topLevelCount = containers.filter((c) => !c.parentContainerId).length
    const created = await createContainer({
      worktreeId: newWorktreeId,
      name: nextWorkspaceContainerName(containers, newWorktreeId),
      position: { x: 40 + topLevelCount * 32, y: 40 + topLevelCount * 32 }
    })
    setSelectedId(created.id)
  }

  const colorMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-9" data-container-graph="">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h1 className="text-sm font-semibold">Container graph</h1>
        <select
          aria-label="Worktree for new container"
          className="ml-4 h-7 max-w-56 rounded-md border border-border bg-input/50 px-2 text-xs"
          value={newWorktreeId}
          onChange={(event) => setNewWorktreeId(event.target.value)}
        >
          {worktrees.map((worktree) => (
            <option key={worktree.id} value={worktree.id}>
              {worktree.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!newWorktreeId}
          onClick={() => void createNew()}
        >
          <Plus className="size-3.5" />
          New container
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Close container graph"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={model.edges}
            nodeTypes={NODE_TYPES}
            colorMode={colorMode}
            onNodesChange={onNodesChange}
            onConnect={handleConnect}
            onNodeClick={(_event, node) => setSelectedId(node.id)}
            onEdgeClick={(_event, edge) => setSelectedId(edge.source)}
            onPaneClick={() => setSelectedId(null)}
            onNodeDragStop={(_event, node) =>
              void updateContainer(node.id, {
                position: { x: Math.round(node.position.x), y: Math.round(node.position.y) }
              })
            }
            onBeforeDelete={async ({ edges }) => ({ nodes: [], edges })}
            onEdgesDelete={handleEdgesDelete}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected ? (
          <ContainerContextEditor
            container={selected}
            containers={containers}
            onPatch={(patch) => void updateContainer(selected.id, patch)}
            onReparent={(parentId) => reparent(selected.id, parentId)}
            onRemove={() => {
              setSelectedId(null)
              void removeContainer(selected.id)
            }}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </div>
  )
}

export default function ContainerGraphOverlay(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  )
}
