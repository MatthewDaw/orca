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
  // Code the agent should stay within (paths, globs, modules); inherited by nested containers.
  codeScope?: string
  // Markdown the container's owner writes for everything nested under it; children must read it.
  brief?: string
  // Terminal tab ids (not unified tab ids) of this container's terminals, kept current by the
  // renderer so the CLI can find which live terminals belong here.
  terminalTabIds?: string[]
  // Display name of the worktree, kept current by the renderer so paths read the way the sidebar does.
  worktreeLabel?: string
  // Sidebar order among siblings; containers without one sort by creation time.
  sortOrder?: number
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
    | 'name'
    | 'worktreeId'
    | 'parentContainerId'
    | 'tabIds'
    | 'focus'
    | 'connections'
    | 'position'
    | 'sortOrder'
    | 'codeScope'
    | 'brief'
    | 'terminalTabIds'
    | 'worktreeLabel'
  >
>

export const EMPTY_WORKSPACE_CONTAINER_CATALOG: WorkspaceContainerCatalog = {
  version: 1,
  containers: []
}
