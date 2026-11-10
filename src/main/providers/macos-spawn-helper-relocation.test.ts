import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const source = join(mkdtempSync(join(tmpdir(), 'helper-src-')), 'spawn-helper')
writeFileSync(source, 'binary-bytes')
vi.mock('./local-pty-utils', () => ({
  getNodePtySpawnHelperCandidates: () => [source]
}))

import { ensureRelocatedSpawnHelper } from './macos-spawn-helper-relocation'

describe('ensureRelocatedSpawnHelper', () => {
  it('copies the helper to an executable file outside its bundle and reuses it', () => {
    const root = mkdtempSync(join(tmpdir(), 'helper-root-'))
    const target = ensureRelocatedSpawnHelper(root)
    expect(target?.startsWith(root)).toBe(true)
    expect(readFileSync(target!, 'utf8')).toBe('binary-bytes')
    expect(statSync(target!).mode & 0o111).not.toBe(0)
    expect(ensureRelocatedSpawnHelper(root)).toBe(target)
  })
})
