import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceContainerCatalog } from '../../shared/workspace-container-types'

export const containerDirectory = (): string => join(homedir(), '.orca', 'containers')

export async function readCatalog(): Promise<WorkspaceContainerCatalog> {
  try {
    return JSON.parse(await readFile(join(containerDirectory(), 'catalog.json'), 'utf8'))
  } catch {
    return { version: 1, containers: [] }
  }
}
