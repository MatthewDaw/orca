import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const FORK_BUILD_MARKER_FILE = 'fork-build'

// Why a marker file: a fork ships it in resources, so stock Orca and mocked test apps never match.
export function isForkBuild(resourcesPath: string | undefined = process.resourcesPath): boolean {
  return (
    typeof resourcesPath === 'string' && existsSync(join(resourcesPath, FORK_BUILD_MARKER_FILE))
  )
}
