/**
 * Unit tests for the inventory layer: patch parsing, loader snapshots,
 * manifest reading, and end-to-end collection against a fixture DSH_HOME.
 * @module dsh-plugin-clinic/tests/engine.inventory
 */

import { describe, expect, it } from 'vitest'
import {
  collectInput, listProfileNames, parsePatchRows, readPatchFile,
  readProfileManifest, resolveInstalledVersion, snapshotLoaderEntries,
} from '../src/engine/inventory.ts'
import { createFixtureHome, entries, fixtureEnvironment } from './helpers/fixtures.ts'
import { join } from 'node:path'

describe('parsePatchRows', () => {
  it('parses insert and override rows', () => {
    const rows = parsePatchRows('- insert:\n    - id: a\n      name: pkg-a\n- id: b\n  config:\n    x: 1\n')
    expect(rows).toEqual([
      { kind: 'insert', id: 'a', name: 'pkg-a' },
      { kind: 'override', id: 'b' },
    ])
  })

  it('rejects non-array documents and malformed rows', () => {
    expect(parsePatchRows('just: a: map')).toBeNull()
    expect(parsePatchRows('- insert:\n    - nope\n')).toBeNull()
    expect(parsePatchRows('- [1, 2]\n')).toBeNull()
  })
})

describe('snapshotLoaderEntries', () => {
  it('skips group rows and projects the remaining fields', () => {
    const snapshots = snapshotLoaderEntries([
      { id: 'group', options: { group: true, name: 'g' } },
      { id: 'e1', options: { name: 'pkg-a' }, disabled: false, fiber: { state: 'active' } },
      { id: 'e2', options: { name: 'pkg-b' }, disabled: true, fiber: undefined },
    ])
    expect(snapshots).toEqual([
      { entryId: 'e1', moduleName: 'pkg-a', enabled: true, fiberPhase: 'active' },
      { entryId: 'e2', moduleName: 'pkg-b', enabled: false, fiberPhase: null },
    ])
  })

  it('falls back to the entry id as module name', () => {
    const snapshots = snapshotLoaderEntries([{ id: 'bare', options: {} }])
    expect(snapshots[0]?.moduleName).toBe('bare')
  })
})

describe('readProfileManifest', () => {
  it('reads bundles and dependencies', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { manifest } = await readProfileManifest(`${dshHome}/profiles/web`)
      expect(manifest?.bundles).toEqual(['@deepseek-ai/dsh-base', 'dsh-plugin-ok'])
      expect(manifest?.dependencies.get('dsh-plugin-ok')).toBe('0.1.0')
    } finally {
      await cleanup()
    }
  })

  it('reports unreadable manifests', async () => {
    const { manifest, error } = await readProfileManifest('/nonexistent/profile')
    expect(manifest).toBeNull()
    expect(error).toContain('no such file')
  })

  it('reports invalid JSON manifests', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const dir = join(dshHome, 'profiles', 'corrupt')
      const { mkdir } = await import('node:fs/promises')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), '{ not json')
      const { manifest, error } = await readProfileManifest(dir)
      expect(manifest).toBeNull()
      expect(error).toContain('invalid JSON')
    } finally {
      await cleanup()
    }
  })

  it('rejects manifests without the dsh.profile.bundles list', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const dir = join(dshHome, 'profiles', 'nobundles')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: {} }))
      const { manifest, error } = await readProfileManifest(dir)
      expect(manifest).toBeNull()
      expect(error).toContain('dsh.profile.bundles')
    } finally {
      await cleanup()
    }
  })

  it('rejects non-object manifests and non-object manifest fields', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')
      for (const [name, content] of [
        ['array-json', '[1, 2]'],
        ['string-dsh', JSON.stringify({ dsh: 'nope', dependencies: {} })],
        ['missing-deps', JSON.stringify({ dsh: { profile: { bundles: [] } } })],
        ['numeric-deps', JSON.stringify({ dsh: { profile: { bundles: [] } }, dependencies: { a: 1 } })],
      ] as const) {
        const dir = join(dshHome, 'profiles', name)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'package.json'), content)
        const { manifest, error } = await readProfileManifest(dir)
        expect(manifest).toBeNull()
        expect(error).toBeDefined()
      }
    } finally {
      await cleanup()
    }
  })
})

describe('listProfileNames', () => {
  it('lists profile directories', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      expect((await listProfileNames(dshHome)).sort()).toEqual(['broken', 'web'])
    } finally {
      await cleanup()
    }
  })

  it('returns an empty list for a missing home', async () => {
    expect(await listProfileNames('/nonexistent/dsh')).toEqual([])
  })
})

describe('collectInput', () => {
  it('collects both fixture profiles with findings-relevant data', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), entries({ moduleName: 'dsh-plugin-ok' }))
      expect(input.profiles).toHaveLength(2)
      const web = input.profiles.find((profile) => profile.profile === 'web')
      const broken = input.profiles.find((profile) => profile.profile === 'broken')
      expect(web?.bundles).toHaveLength(2)
      const missing = broken?.bundles.find((bundle) => bundle.name === 'dsh-plugin-missing')
      expect(missing?.resolveError).toBeDefined()
      const risky = broken?.bundles.find((bundle) => bundle.name === 'dsh-plugin-risky')
      expect(risky?.manifest?.scripts?.postinstall).toBeDefined()
      expect(broken?.patches.some((patch) => patch.parseError !== undefined)).toBe(true)
    } finally {
      await cleanup()
    }
  })

  it('filters profiles by name and reads the home patch', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), [], { profiles: ['web'] })
      expect(input.profiles).toHaveLength(1)
      expect(input.profiles[0]?.profile).toBe('web')
      // No home-level patch exists in the fixture; includeHomePatches stays empty.
      expect(input.homePatches).toEqual([])
    } finally {
      await cleanup()
    }
  })

  it('collects a profile whose manifest is valid but empty of bundles and dependencies', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const emptyDir = join(dshHome, 'profiles', 'empty')
      await mkdir(emptyDir, { recursive: true })
      await writeFile(join(emptyDir, 'package.json'), JSON.stringify({
        name: 'dsh-profile-empty',
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: [] } },
      }))
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), [], { profiles: ['empty'] })
      const empty = input.profiles[0]
      expect(empty?.manifest?.bundles).toEqual([])
      expect(empty?.bundles).toEqual([])
      expect(empty?.dependencies).toEqual([])
    } finally {
      await cleanup()
    }
  })

  it('collects a profile with an unreadable manifest as a manifest-error profile', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const corruptDir = join(dshHome, 'profiles', 'corrupt')
      await mkdir(corruptDir, { recursive: true })
      await writeFile(join(corruptDir, 'package.json'), '{ not json')
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), [], { profiles: ['corrupt'] })
      expect(input.profiles[0]?.manifest).toBeNull()
      expect(input.profiles[0]?.manifestError).toContain('invalid JSON')
      expect(input.profiles[0]?.bundles).toEqual([])
    } finally {
      await cleanup()
    }
  })

  it('collects dependencies that are not bundles and reports unparsable package.json as manifestless', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const extraDir = join(dshHome, 'profiles', 'extra')
      await mkdir(join(extraDir, 'node_modules', 'dsh-extra'), { recursive: true })
      await mkdir(join(extraDir, 'node_modules', 'dsh-broken-json'), { recursive: true })
      await writeFile(join(extraDir, 'package.json'), JSON.stringify({
        name: 'dsh-profile-extra',
        private: true,
        dependencies: { 'dsh-extra': '1.0.0', 'dsh-broken-json': '1.0.0' },
        dsh: { profile: { bundles: [] } },
      }))
      await writeFile(join(extraDir, 'node_modules', 'dsh-extra', 'package.json'), JSON.stringify({ name: 'dsh-extra', version: '1.0.0' }))
      await writeFile(join(extraDir, 'node_modules', 'dsh-broken-json', 'package.json'), '{ not json')
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), [], { profiles: ['extra'] })
      const extra = input.profiles[0]
      expect(extra?.dependencies.map((dep) => dep.name).sort()).toEqual(['dsh-broken-json', 'dsh-extra'])
      // Node's resolver reads the target package.json, so an invalid JSON
      // manifest fails resolution itself rather than parsing later.
      const broken = extra?.dependencies.find((dep) => dep.name === 'dsh-broken-json')
      expect(broken?.manifest).toBeNull()
      expect(broken?.patch).toBeNull()
      expect(broken?.resolveError).toContain('not resolvable')
    } finally {
      await cleanup()
    }
  })

  it('reads an unreadable home patch as a parse error document', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      await writeFile(join(dshHome, 'cordis.patch.yml'), 'not: [valid\n')
      const input = await collectInput(dshHome, fixtureEnvironment(dshHome), [], { profiles: [] })
      expect(input.homePatches.some((patch) => patch.parseError !== undefined)).toBe(true)
    } finally {
      await cleanup()
    }
  })
})

describe('readPatchFile', () => {
  it('treats an absent file as an absent document', async () => {
    const patch = await readPatchFile('/nonexistent/patch.yml')
    expect(patch.rows).toBeNull()
    expect(patch.parseError).toBeUndefined()
  })

  it('reports non-ENOENT read failures', async () => {
    const { dshHome, cleanup } = await createFixtureHome()
    try {
      // A directory is not readable as a file (EISDIR on Windows, EPERM elsewhere).
      const patch = await readPatchFile(join(dshHome, 'profiles'))
      expect(patch.rows).toBeNull()
      expect(patch.parseError).toBeDefined()
    } finally {
      await cleanup()
    }
  })
})

describe('parsePatchRows edge rows', () => {
  it('rejects a row that is neither an insert list nor an id override', () => {
    expect(parsePatchRows('- config:\n    x: 1\n')).toBeNull()
  })
})

describe('resolveInstalledVersion', () => {
  it('resolves an installed package version from a real file URL', () => {
    const version = resolveInstalledVersion('@deepseek-ai/cordis', import.meta.url)
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('returns null for unresolvable packages', () => {
    expect(resolveInstalledVersion('@deepseek-ai/definitely-not-a-package', import.meta.url)).toBeNull()
  })
})
