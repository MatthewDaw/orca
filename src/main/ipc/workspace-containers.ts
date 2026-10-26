import { BrowserWindow, ipcMain } from 'electron'
import { startContainerBriefInbox } from '../containers/workspace-container-brief-inbox'
import { WorkspaceContainerStore } from '../containers/workspace-container-store'
import {
  readContainerBlueprint,
  writeContainerBlueprint
} from '../containers/workspace-container-blueprint-file'
import type { WorkspaceContainerBlueprint } from '../../shared/workspace-container-blueprint'
import type {
  WorkspaceContainer,
  WorkspaceContainerCatalog,
  WorkspaceContainerCreateInput,
  WorkspaceContainerPatch
} from '../../shared/workspace-container-types'

export const workspaceContainerStore = new WorkspaceContainerStore()

export function registerWorkspaceContainerHandlers(
  store: WorkspaceContainerStore = workspaceContainerStore
): void {
  const broadcast = (catalog: WorkspaceContainerCatalog): WorkspaceContainerCatalog => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('workspaceContainers:changed', catalog)
    }
    return catalog
  }

  for (const channel of [
    'workspaceContainers:list',
    'workspaceContainers:create',
    'workspaceContainers:update',
    'workspaceContainers:remove',
    'workspaceContainers:assignTabs',
    'workspaceContainers:readBlueprint',
    'workspaceContainers:writeBlueprint',
    'workspaceContainers:importContainers',
    'workspaceContainers:releaseTab',
    'workspaceContainers:getContextPagePath'
  ]) {
    ipcMain.removeHandler(channel)
  }

  startContainerBriefInbox(store, broadcast, (request) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('workspaceContainers:agentRequest', request)
    }
  })

  ipcMain.handle('workspaceContainers:list', () => store.list())
  ipcMain.handle(
    'workspaceContainers:create',
    async (_event, input: WorkspaceContainerCreateInput) => {
      const container = await store.create(input)
      broadcast(await store.list())
      return container
    }
  )
  ipcMain.handle(
    'workspaceContainers:update',
    async (_event, id: string, patch: WorkspaceContainerPatch) =>
      broadcast(await store.update(id, patch))
  )
  ipcMain.handle('workspaceContainers:assignTabs', async (_event, id: string, tabIds: string[]) =>
    broadcast(await store.assignTabs(id, tabIds))
  )
  ipcMain.handle('workspaceContainers:readBlueprint', (_event, projectPath: string) =>
    readContainerBlueprint(projectPath)
  )
  ipcMain.handle(
    'workspaceContainers:writeBlueprint',
    (_event, projectPath: string, blueprint: WorkspaceContainerBlueprint) =>
      writeContainerBlueprint(projectPath, blueprint)
  )
  ipcMain.handle(
    'workspaceContainers:importContainers',
    async (_event, containers: WorkspaceContainer[]) =>
      broadcast(await store.importContainers(containers))
  )
  ipcMain.handle('workspaceContainers:remove', async (_event, id: string) =>
    broadcast(await store.remove(id))
  )
  ipcMain.handle('workspaceContainers:releaseTab', async (_event, tabId: string) =>
    broadcast(await store.releaseTab(tabId))
  )
  ipcMain.handle('workspaceContainers:getContextPagePath', (_event, id: string) =>
    store.getContextPagePath(id)
  )
}
