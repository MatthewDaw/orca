import { BrowserWindow, ipcMain } from 'electron'
import { WorkspaceContainerStore } from '../containers/workspace-container-store'
import type {
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
    'workspaceContainers:releaseTab',
    'workspaceContainers:getContextPagePath'
  ]) {
    ipcMain.removeHandler(channel)
  }

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
