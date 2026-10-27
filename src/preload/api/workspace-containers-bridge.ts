import { ipcRenderer } from 'electron'
import type { WorkspaceContainerBlueprint } from '../../shared/workspace-container-blueprint'
import type { ContainerAgentRequest } from '../../shared/workspace-container-agent-request'
import type {
  WorkspaceContainer,
  WorkspaceContainerCatalog,
  WorkspaceContainerCreateInput,
  WorkspaceContainerPatch
} from '../../shared/workspace-container-types'

export const workspaceContainersApi = {
  list: () => ipcRenderer.invoke('workspaceContainers:list'),
  agentPermissionArgs: (agent: string, sessionId: string) =>
    ipcRenderer.invoke('workspaceContainers:agentPermissionArgs', agent, sessionId),
  create: (input: WorkspaceContainerCreateInput) =>
    ipcRenderer.invoke('workspaceContainers:create', input),
  update: (id: string, patch: WorkspaceContainerPatch) =>
    ipcRenderer.invoke('workspaceContainers:update', id, patch),
  assignTabs: (id: string, tabIds: string[]) =>
    ipcRenderer.invoke('workspaceContainers:assignTabs', id, tabIds),
  readBlueprint: (projectPath: string) =>
    ipcRenderer.invoke('workspaceContainers:readBlueprint', projectPath),
  writeBlueprint: (projectPath: string, blueprint: WorkspaceContainerBlueprint) =>
    ipcRenderer.invoke('workspaceContainers:writeBlueprint', projectPath, blueprint),
  importContainers: (containers: WorkspaceContainer[]) =>
    ipcRenderer.invoke('workspaceContainers:importContainers', containers),
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
  },
  onAgentRequest: (callback: (request: ContainerAgentRequest) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: ContainerAgentRequest): void =>
      callback(request)
    ipcRenderer.on('workspaceContainers:agentRequest', listener)
    return () => ipcRenderer.removeListener('workspaceContainers:agentRequest', listener)
  }
}
