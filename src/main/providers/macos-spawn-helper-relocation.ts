import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getNodePtySpawnHelperCandidates } from './local-pty-utils'

// Read by the patched node-pty at fork time (config/patches/node-pty@1.1.0.patch).
export const SPAWN_HELPER_OVERRIDE_ENV = 'ORCA_NODE_PTY_SPAWN_HELPER'

let relocated: { source: string; target: string } | null = null

function relocationRoot(): string {
  return join(homedir(), 'Library', 'Caches', 'Orca', 'spawn-helper')
}

// Why: macOS can hold every launch from inside an app bundle at its first instruction (a stuck
// code-signing check on the bundle) while the same binary runs fine from a plain folder, so the
// helper is run from a content-addressed copy outside the bundle.
export function ensureRelocatedSpawnHelper(root: string = relocationRoot()): string | null {
  const source = getNodePtySpawnHelperCandidates().find((candidate) => existsSync(candidate))
  if (!source) {
    return null
  }
  if (relocated?.source === source && existsSync(relocated.target)) {
    return relocated.target
  }
  try {
    const digest = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16)
    const target = join(root, digest, 'spawn-helper')
    if (!existsSync(target) || statSync(target).size !== statSync(source).size) {
      mkdirSync(dirname(target), { recursive: true })
      const staging = `${target}.${process.pid}.tmp`
      copyFileSync(source, staging)
      chmodSync(staging, 0o755)
      renameSync(staging, target)
    }
    relocated = { source, target }
    return target
  } catch {
    return null
  }
}

export function applySpawnHelperRelocation(): void {
  if (process.platform !== 'darwin') {
    return
  }
  const target = ensureRelocatedSpawnHelper()
  if (target) {
    process.env[SPAWN_HELPER_OVERRIDE_ENV] = target
  } else {
    delete process.env[SPAWN_HELPER_OVERRIDE_ENV]
  }
}
