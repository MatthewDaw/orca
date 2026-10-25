import type { StateCreator } from 'zustand'
import type {
  WorkspaceContainer,
  WorkspaceContainerCatalog,
  WorkspaceContainerCreateInput,
  WorkspaceContainerPatch
} from '../../../../shared/workspace-container-types'
import type { AppState } from '../types'

let unsubscribeFromCatalogChanges: (() => void) | null = null

export type WorkspaceContainersSlice = {
  workspaceContainers: WorkspaceContainer[]
  workspaceContainersLoaded: boolean
  activeContainerIdByWorktree: Record<string, string | null>
  containerGraphOpen: boolean
  setContainerGraphOpen: (open: boolean) => void
  loadWorkspaceContainers: () => Promise<void>
  applyWorkspaceContainerCatalog: (catalog: WorkspaceContainerCatalog) => void
  createWorkspaceContainer: (input: WorkspaceContainerCreateInput) => Promise<WorkspaceContainer>
  updateWorkspaceContainer: (id: string, patch: WorkspaceContainerPatch) => Promise<void>
  removeWorkspaceContainer: (id: string) => Promise<void>
  setActiveWorkspaceContainer: (worktreeId: string, containerId: string | null) => void
  assignTabToWorkspaceContainer: (tabId: string, containerId: string | null) => Promise<void>
}

export const createWorkspaceContainersSlice: StateCreator<
  AppState,
  [],
  [],
  WorkspaceContainersSlice
> = (set, get) => ({
  workspaceContainers: [],
  workspaceContainersLoaded: false,
  activeContainerIdByWorktree: {},
  containerGraphOpen: false,

  setContainerGraphOpen: (open) => set({ containerGraphOpen: open }),

  loadWorkspaceContainers: async () => {
    const api = window.api?.workspaceContainers
    if (!api) {
      return
    }
    get().applyWorkspaceContainerCatalog(await api.list())
    unsubscribeFromCatalogChanges ??= api.onChanged((catalog) =>
      get().applyWorkspaceContainerCatalog(catalog)
    )
  },

  applyWorkspaceContainerCatalog: (catalog) =>
    set((state) => {
      const liveIds = new Set(catalog.containers.map((c) => c.id))
      const activeContainerIdByWorktree = Object.fromEntries(
        Object.entries(state.activeContainerIdByWorktree).map(([worktreeId, id]) => [
          worktreeId,
          id && liveIds.has(id) ? id : null
        ])
      )
      return {
        workspaceContainers: catalog.containers,
        workspaceContainersLoaded: true,
        activeContainerIdByWorktree
      }
    }),

  createWorkspaceContainer: async (input) => {
    const container = await window.api.workspaceContainers.create(input)
    get().setActiveWorkspaceContainer(container.worktreeId, container.id)
    return container
  },

  updateWorkspaceContainer: async (id, patch) => {
    await window.api.workspaceContainers.update(id, patch)
  },

  removeWorkspaceContainer: async (id) => {
    await window.api.workspaceContainers.remove(id)
  },

  setActiveWorkspaceContainer: (worktreeId, containerId) =>
    set((state) => ({
      activeContainerIdByWorktree: {
        ...state.activeContainerIdByWorktree,
        [worktreeId]: containerId
      }
    })),

  assignTabToWorkspaceContainer: async (tabId, containerId) => {
    const api = window.api.workspaceContainers
    if (!containerId) {
      await api.releaseTab(tabId)
      return
    }
    await api.assignTabs(containerId, [tabId])
  }
})
