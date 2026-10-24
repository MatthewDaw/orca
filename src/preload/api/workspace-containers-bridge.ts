import { ipcRenderer } from 'electron'
import type {
  WorkspaceContainerCatalog,
  WorkspaceContainerCreateInput,
  WorkspaceContainerPatch
} from '../../shared/workspace-container-types'

export const workspaceContainersApi = {
  list: () => ipcRenderer.invoke('workspaceContainers:list'),
  create: (input: WorkspaceContainerCreateInput) =>
    ipcRenderer.invoke('workspaceContainers:create', input),
  update: (id: string, patch: WorkspaceContainerPatch) =>
    ipcRenderer.invoke('workspaceContainers:update', id, patch),
  assignTabs: (id: string, tabIds: string[]) =>
    ipcRenderer.invoke('workspaceContainers:assignTabs', id, tabIds),
  remove: (id: string) => ipcRenderer.invoke('workspaceContainers:remove', id),
  releaseTab: (tabId: string) => ipcRenderer.invoke('workspaceContainers:releaseTab', tabId),
  getContextPagePath: (id: string) =>
    ipcRenderer.invoke('workspaceContainers:getContextPagePath', id),
  onChanged: (callback: (catalog: WorkspaceContainerCatalog) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      catalog: WorkspaceContainerCatalog
    ): void => callback(catalog)
    ipcRenderer.on('workspaceContainers:changed', listener)
    return () => ipcRenderer.removeListener('workspaceContainers:changed', listener)
  }
}
