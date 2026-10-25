import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORK_BUILD_MARKER_FILE, isForkBuild } from './fork-build-marker'

describe('isForkBuild', () => {
  it('is false without a resources path', () => {
    expect(isForkBuild(undefined)).toBe(false)
  })

  it('is false when the resources folder has no marker', () => {
    expect(isForkBuild(mkdtempSync(join(tmpdir(), 'orca-resources-')))).toBe(false)
  })

  it('is true when the resources folder carries the marker', () => {
    const resources = mkdtempSync(join(tmpdir(), 'orca-resources-'))
    writeFileSync(join(resources, FORK_BUILD_MARKER_FILE), '')
    expect(isForkBuild(resources)).toBe(true)
  })
})
