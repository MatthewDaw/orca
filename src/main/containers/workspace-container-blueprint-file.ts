import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  CONTAINER_BLUEPRINT_RELATIVE_PATH,
  parseContainerBlueprint,
  serializeContainerBlueprint,
  type WorkspaceContainerBlueprint
} from '../../shared/workspace-container-blueprint'

const blueprintPath = (projectPath: string): string =>
  join(projectPath, CONTAINER_BLUEPRINT_RELATIVE_PATH)

export async function readContainerBlueprint(
  projectPath: string
): Promise<WorkspaceContainerBlueprint | null> {
  try {
    return parseContainerBlueprint(await readFile(blueprintPath(projectPath), 'utf8'))
  } catch {
    return null
  }
}

// Skips identical content so syncing never touches the project's file timestamps or git status needlessly.
export async function writeContainerBlueprint(
  projectPath: string,
  blueprint: WorkspaceContainerBlueprint
): Promise<void> {
  const path = blueprintPath(projectPath)
  const next = serializeContainerBlueprint(blueprint)
  const current = await readFile(path, 'utf8').catch(() => null)
  if (current === next || (current === null && blueprint.containers.length === 0)) {
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next)
}
