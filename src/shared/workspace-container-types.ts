export type WorkspaceContainerConnection = {
  targetContainerId: string
  description: string
}

export type WorkspaceContainerPosition = { x: number; y: number }

export type WorkspaceContainer = {
  id: string
  worktreeId: string
  name: string
  parentContainerId: string | null
  tabIds: string[]
  focus: string
  connections: WorkspaceContainerConnection[]
  position: WorkspaceContainerPosition
  createdAt: number
  updatedAt: number
}

export type WorkspaceContainerCatalog = {
  version: 1
  containers: WorkspaceContainer[]
}

export type WorkspaceContainerCreateInput = {
  worktreeId: string
  name: string
  parentContainerId?: string | null
  position?: WorkspaceContainerPosition
}

export type WorkspaceContainerPatch = Partial<
  Pick<
    WorkspaceContainer,
    'name' | 'parentContainerId' | 'tabIds' | 'focus' | 'connections' | 'position'
  >
>

export const EMPTY_WORKSPACE_CONTAINER_CATALOG: WorkspaceContainerCatalog = {
  version: 1,
  containers: []
}
