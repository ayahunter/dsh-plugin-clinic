/**
 * Unit tests for report assembly: severity folding, profile reports, the
 * summary projection, and severity filtering.
 * @module dsh-plugin-clinic/tests/engine.report
 */

import { describe, expect, it } from 'vitest'
import { runClinic, summarize } from '../src/engine/report.ts'
import { highestSeverity } from '../src/types.ts'
import type { EngineInput, InstalledPackage, PatchDocument, ProfileInput } from '../src/engine/inventory.ts'
import { entries, fixtureEnvironment } from './helpers/fixtures.ts'

function pkg(name: string, manifest: InstalledPackage['manifest'], extra: Partial<InstalledPackage> = {}): InstalledPackage {
  return { name, manifest, dir: `/fake/${name}`, patch: null, ...extra }
}

function profileInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    profile: 'web',
    dir: '/fake/web',
    manifestPath: '/fake/web/package.json',
    manifest: { bundles: ['dsh-plugin-ok'], dependencies: new Map() },
    bundles: [],
    dependencies: [],
    patches: [],
    resolvableNames: new Set(['dsh-plugin-ok']),
    loaderEntries: [],
    ...overrides,
  }
}

function input(profiles: ProfileInput[], homePatches: PatchDocument[] = []): EngineInput {
  return { environment: fixtureEnvironment('/tmp'), profiles, homePatches }
}

describe('runClinic', () => {
  it('folds findings into per-plugin reports and severity counts', () => {
    const profiles = [profileInput({
      bundles: [pkg('dsh-plugin-ok', { version: '0.1.0', scripts: { postinstall: 'x' } })],
      loaderEntries: entries({ moduleName: 'dsh-plugin-ok' }, { moduleName: 'broken-entry', fiberPhase: 'failed' }),
    })]
    const report = runClinic(input(profiles))
    expect(report.schemaVersion).toBe(1)
    const profile = report.profiles[0]
    expect(profile).toBeDefined()
    const ok = profile?.plugins.find((plugin) => plugin.plugin === 'dsh-plugin-ok')
    expect(ok?.source).toBe('bundle')
    expect(ok?.findings.some((finding) => finding.checkId === 'install-scripts')).toBe(true)
    const broken = profile?.plugins.find((plugin) => plugin.plugin === 'broken-entry')
    expect(broken?.source).toBe('loader-only')
    expect(broken?.findings).toContainEqual(expect.objectContaining({ severity: 'critical' }))
    expect(profile?.summary.critical).toBe(1)
    expect(profile?.summary.warning).toBeGreaterThan(0)
  })

  it('records provenance for dependency plugins', () => {
    const profiles = [profileInput({
      dependencies: [pkg('dsh-dep', { version: '0.2.0' })],
    })]
    const report = runClinic(input(profiles))
    const dep = report.profiles[0]?.plugins.find((plugin) => plugin.plugin === 'dsh-dep')
    expect(dep?.source).toBe('dependency')
    expect(dep?.findings.some((finding) => finding.checkId === 'provenance')).toBe(true)
  })

  it('skips a dependency that is also a bundle', () => {
    const profiles = [profileInput({
      bundles: [pkg('shared', { version: '1.0.0' })],
      dependencies: [pkg('shared', { version: '1.0.0' })],
    })]
    const report = runClinic(input(profiles))
    const plugins = report.profiles[0]?.plugins
    expect(plugins?.filter((plugin) => plugin.plugin === 'shared')).toHaveLength(1)
    expect(plugins?.find((plugin) => plugin.plugin === 'shared')?.source).toBe('bundle')
  })

  it('attaches load-health findings to the matching bundle plugin', () => {
    const profiles = [profileInput({
      bundles: [pkg('dsh-plugin-ok', { version: '0.1.0' })],
      loaderEntries: entries({ moduleName: 'dsh-plugin-ok', fiberPhase: 'failed' }),
    })]
    const report = runClinic(input(profiles))
    const ok = report.profiles[0]?.plugins.find((plugin) => plugin.plugin === 'dsh-plugin-ok')
    expect(ok?.findings).toContainEqual(expect.objectContaining({ checkId: 'load-health', severity: 'critical' }))
    // The plugin keeps its bundle provenance when the finding matches.
    expect(ok?.source).toBe('bundle')
  })

  it('keeps profile-level findings (patch-health) separate from plugin findings', () => {
    const profiles = [profileInput({
      patches: [{ file: 'bad.yml', rows: null, parseError: 'boom' }],
    })]
    const report = runClinic(input(profiles))
    const profile = report.profiles[0]
    expect(profile?.profileFindings).toContainEqual(expect.objectContaining({ checkId: 'patch-health', severity: 'critical' }))
  })

  it('matches patch override rows against the raw row id of mounted entries', () => {
    // Mounted entry ids carry the tree prefix ('include:system-prompt'); the
    // override row targets the raw id and must not be flagged.
    const profiles = [profileInput({
      patches: [{ file: 'base.yml', rows: [{ kind: 'override', id: 'system-prompt' }] }],
      loaderEntries: entries({ entryId: 'include:system-prompt', rawId: 'system-prompt', moduleName: '@deepseek-ai/dsh-system-prompt' }),
    })]
    const report = runClinic(input(profiles))
    const profile = report.profiles[0]
    expect(profile?.profileFindings.some((finding) => finding.checkId === 'patch-health')).toBe(false)
  })

  it('skips bundle checks and records the note when the manifest is unreadable', () => {
    const profiles = [profileInput({
      manifest: null,
      manifestError: 'invalid JSON',
    })]
    const report = runClinic(input(profiles))
    const profile = report.profiles[0]
    expect(profile?.checks.find((check) => check.id === 'bundle-manifest')?.ran).toBe(false)
    expect(profile?.checks.find((check) => check.id === 'bundle-manifest')?.note).toBe('profile manifest unreadable')
    expect(profile?.checks.find((check) => check.id === 'load-health')?.ran).toBe(true)
  })

  it('filters findings by severity threshold', () => {
    const profiles = [profileInput({
      bundles: [pkg('dsh-plugin-ok', { version: '0.1.0', scripts: { postinstall: 'x' } })],
    })]
    const full = runClinic(input(profiles))
    const criticalOnly = runClinic(input(profiles), 'critical')
    expect(criticalOnly.profiles[0]?.summary.warning).toBe(0)
    expect(criticalOnly.profiles[0]?.summary.info).toBe(0)
    expect(full.profiles[0]?.summary.warning).toBeGreaterThan(0)
  })

  it('applies home patches to every profile', () => {
    const profiles = [profileInput()]
    const report = runClinic(input(profiles, [{ file: 'home.yml', rows: null, parseError: 'boom' }]))
    expect(report.profiles[0]?.profileFindings).toContainEqual(expect.objectContaining({ checkId: 'patch-health', severity: 'critical' }))
  })

  it('emits an empty report for no profiles', () => {
    const report = runClinic(input([]))
    expect(report.profiles).toEqual([])
    expect(summarize(report).profiles).toEqual([])
  })
})

describe('summarize', () => {
  it('projects profiles and counts without findings', () => {
    const profiles = [profileInput({ bundles: [pkg('a', { scripts: { postinstall: 'x' } })] })]
    const report = runClinic(input(profiles))
    const summary = summarize(report)
    expect(summary.schemaVersion).toBe(1)
    expect(summary.profiles).toEqual([{ profile: 'web', summary: report.profiles[0]?.summary }])
    expect(JSON.stringify(summary)).not.toContain('findings')
  })
})

describe('highestSeverity', () => {
  it('returns the highest severity present and info for a clean bill', () => {
    expect(highestSeverity([{ checkId: 'provenance', severity: 'info', message: 'x' }])).toBe('info')
    expect(highestSeverity([{ checkId: 'peer-deps', severity: 'warning', message: 'x' }, { checkId: 'load-health', severity: 'critical', message: 'x' }])).toBe('critical')
    expect(highestSeverity([])).toBe('info')
  })
})
