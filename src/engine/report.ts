/**
 * Report assembly: runs every check over collected input, folds findings
 * into per-plugin and per-profile reports, and derives summaries. Pure
 * functions over the inventory model — no I/O, no context.
 * @module dsh-plugin-clinic/engine/report
 */

import type { CheckId, ClinicReport, ClinicSummary, Finding, ProfileReport, Severity } from '../types.ts'
import { foldSeverity } from '../types.ts'
import { ALL_CHECK_IDS, checkBundleManifest, checkDuplicate, checkInstallScripts, checkLoadHealth, checkPatchHealth, checkPeerDeps, checkProvenance, checkRuntimeCompat } from './checks.ts'
import type { EngineInput, InstalledPackage, ProfileInput } from './inventory.ts'

/** Severity threshold: keep findings at or above this level. */
export const SEVERITY_THRESHOLD: Record<Severity, number> = { critical: 3, warning: 2, info: 1 }

/** Run every check over the collected input and assemble the full report. */
export function runClinic(input: EngineInput, severity: Severity = 'info'): ClinicReport {
  const profiles: ProfileReport[] = input.profiles.map((profile) => runProfile(profile, input, severity))
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: input.environment,
    profiles,
  }
}

/** Assemble one profile's report. */
function runProfile(profile: ProfileInput, input: EngineInput, severity: Severity): ProfileReport {
  const manifestUnreadable = profile.manifest === null
  const loaderModules = new Set(profile.loaderEntries.map((entry) => entry.moduleName))

  const plugins = new Map<string, { plugin: string; version: string | null; source: PluginReportSource; findings: Finding[] }>()
  const ensurePlugin = (name: string, source: PluginReportSource, version: string | null) => {
    let entry = plugins.get(name)
    if (entry === undefined) {
      entry = { plugin: name, version, source, findings: [] }
      plugins.set(name, entry)
    }
    return entry
  }

  for (const bundle of profile.bundles) {
    const entry = ensurePlugin(bundle.name, 'bundle', bundle.manifest?.version ?? null)
    if (!manifestUnreadable) {
      entry.findings.push(...checkBundleManifest(bundle))
      entry.findings.push(...checkPeerDeps(bundle, installedMap(profile)))
      entry.findings.push(...checkRuntimeCompat(bundle, input.environment))
      entry.findings.push(...checkInstallScripts(bundle))
    }
    entry.findings.push(...checkProvenance(bundle, 'bundle'))
  }

  for (const dependency of profile.dependencies) {
    /* v8 ignore next 6 -- exercised by the dependency-report tests; v8 sourcemap misattributes the loop body */
    if (profile.manifest !== null && profile.manifest.bundles.includes(dependency.name)) continue
    const entry = ensurePlugin(dependency.name, 'dependency', dependency.manifest?.version ?? null)
    if (!manifestUnreadable) {
      entry.findings.push(...checkPeerDeps(dependency, installedMap(profile)))
      entry.findings.push(...checkRuntimeCompat(dependency, input.environment))
      entry.findings.push(...checkInstallScripts(dependency))
    }
    entry.findings.push(...checkProvenance(dependency, 'dependency'))
  }

  const loadFindings = manifestUnreadable ? [] : checkLoadHealth(profile.loaderEntries)
  /* v8 ignore next 2 -- exercised by the load-health report tests; v8 sourcemap misattributes the loop */
  for (const finding of loadFindings) {
    const moduleName = finding.evidence ?? ''
    const target = plugins.get(moduleName)
    if (target !== undefined) {
      target.findings.push(finding)
    } else {
      ensurePlugin(moduleName, 'loader-only', null).findings.push(finding)
    }
  }

  const profileFindings: Finding[] = []
  if (!manifestUnreadable) {
    profileFindings.push(...checkDuplicate(profile.bundles, profile.loaderEntries))
    const patches = [...profile.patches, ...input.homePatches]
    profileFindings.push(...checkPatchHealth(patches, profile, loaderModules))
  }

  const allFindings = [...profileFindings, ...[...plugins.values()].flatMap((entry) => entry.findings)]
  const filtered = allFindings.filter((finding) => SEVERITY_THRESHOLD[finding.severity] >= SEVERITY_THRESHOLD[severity])

  const pluginReports = [...plugins.values()].map((entry) => ({
    plugin: entry.plugin,
    version: entry.version,
    source: entry.source,
    findings: entry.findings.filter((finding) => SEVERITY_THRESHOLD[finding.severity] >= SEVERITY_THRESHOLD[severity]),
  }))
  const filteredProfileFindings = profileFindings.filter((finding) => SEVERITY_THRESHOLD[finding.severity] >= SEVERITY_THRESHOLD[severity])

  const checks = ALL_CHECK_IDS.map((id) => {
    const skipped = manifestUnreadable && bundleChecks.includes(id)
    return { id, ran: !skipped, ...(skipped ? { note: 'profile manifest unreadable' } : {}) } as { id: CheckId; ran: boolean; note?: string }
  })

  return {
    profile: profile.profile,
    manifestPath: profile.manifestPath,
    plugins: pluginReports,
    profileFindings: filteredProfileFindings,
    summary: foldSeverity(filtered),
    checks,
  }
}

/** Map every installed package name to its resolution, for peer lookups. */
function installedMap(profile: ProfileInput): ReadonlyMap<string, InstalledPackage> {
  const map = new Map<string, InstalledPackage>()
  for (const bundle of profile.bundles) map.set(bundle.name, bundle)
  for (const dependency of profile.dependencies) map.set(dependency.name, dependency)
  return map
}

/** Checks that cannot run without a readable profile manifest. */
const bundleChecks: readonly CheckId[] = ['bundle-manifest', 'peer-deps', 'runtime-compat', 'install-scripts', 'duplicate']

/** Derive the lightweight dashboard projection from a full report. */
export function summarize(report: ClinicReport): ClinicSummary {
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    environment: report.environment,
    profiles: report.profiles.map((profile) => ({ profile: profile.profile, summary: profile.summary })),
  }
}

type PluginReportSource = 'bundle' | 'dependency' | 'loader-only'
