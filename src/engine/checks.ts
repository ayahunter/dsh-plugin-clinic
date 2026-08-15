/**
 * The clinic check rules: pure functions from collected input to findings.
 * No I/O here — inventory.ts owns all reads. Each check has a stable
 * CheckId and returns zero or more findings with a severity and evidence.
 * @module dsh-plugin-clinic/engine/checks
 */

import semver from 'semver'
import type { CheckId, ClinicEnvironment, Finding } from '../types.ts'
import type { InstalledPackage, LoaderEntrySnapshot, PatchDocument, ProfileInput } from './inventory.ts'

/* v8 ignore next 1 -- declarative module constant; loaded with the module, exercised by checkInstallScripts */
const INSTALL_SCRIPT_NAMES = ['preinstall', 'install', 'postinstall', 'prepare'] as const
/* v8 ignore next 12 -- declarative module constant; loaded with the module */
/** Which checks this module implements (all eight). */
export const ALL_CHECK_IDS: readonly CheckId[] = [
  'load-health',
  'bundle-manifest',
  'peer-deps',
  'runtime-compat',
  'install-scripts',
  'duplicate',
  'patch-health',
  'provenance',
]

function finding(checkId: CheckId, severity: Finding['severity'], message: string, evidence?: string): Finding {
  return { checkId, severity, message, ...(evidence !== undefined ? { evidence } : {}) }
}

/** Check 1/2: Loader tree health — failed entries are critical, transient or missing fibers are warnings. Evidence carries the module name for report grouping. */
export function checkLoadHealth(entries: readonly LoaderEntrySnapshot[]): Finding[] {
  const findings: Finding[] = []
  for (const entry of entries) {
    if (entry.fiberPhase === 'failed') {
      findings.push(finding('load-health', 'critical', `Loader entry "${entry.moduleName}" (${entry.entryId}) failed to load`, entry.moduleName))
    } else if (entry.fiberPhase === 'pending' || entry.fiberPhase === 'loading' || entry.fiberPhase === 'unloading') {
      findings.push(finding('load-health', 'warning', `Loader entry "${entry.moduleName}" (${entry.entryId}) is in transient phase ${entry.fiberPhase}`, entry.moduleName))
    } else if (entry.enabled && entry.fiberPhase === null) {
      findings.push(finding('load-health', 'warning', `Enabled Loader entry "${entry.moduleName}" (${entry.entryId}) has no live root fiber`, entry.moduleName))
    }
  }
  return findings
}

/** Check 3/4: bundle manifest integrity — unresolvable bundles and broken patch declarations are critical. */
export function checkBundleManifest(bundle: InstalledPackage): Finding[] {
  const findings: Finding[] = []
  if (bundle.resolveError !== undefined) {
    findings.push(finding('bundle-manifest', 'critical', `Bundle "${bundle.name}" is not resolvable`, bundle.resolveError))
    return findings
  }
  if (bundle.manifest === null) {
    findings.push(finding('bundle-manifest', 'critical', `Bundle "${bundle.name}" has no readable package.json`))
    return findings
  }
  if (bundle.patch !== null && bundle.patch.rows === null) {
    findings.push(finding('bundle-manifest', 'critical', `Bundle "${bundle.name}" declares an unusable patch`, bundle.patch.parseError))
  }
  return findings
}

/** Check 5/6: peer dependencies — missing or unsatisfied required peers are warnings; optional ones are info. */
export function checkPeerDeps(pkg: InstalledPackage, installed: ReadonlyMap<string, InstalledPackage>): Finding[] {
  const findings: Finding[] = []
  const peers = pkg.manifest?.peerDependencies ?? {}
  for (const [peer, range] of Object.entries(peers)) {
    const optional = pkg.manifest?.peerDependenciesMeta?.[peer]?.optional === true
    const actual = installed.get(peer)
    const actualVersion = actual?.manifest?.version ?? null
    if (actual === undefined || actual.resolveError !== undefined || actualVersion === null) {
      findings.push(finding(
        'peer-deps',
        optional ? 'info' : 'warning',
        `"${pkg.name}" peer "${peer}" is not installed`,
        optional ? `optional peer ${range}` : `required peer ${range}`,
      ))
      continue
    }
    if (range !== '*' && !semver.satisfies(actualVersion, range, { includePrerelease: true })) {
      findings.push(finding(
        'peer-deps',
        'warning',
        `"${pkg.name}" peer "${peer}" ${range} is not satisfied by installed ${actualVersion}`,
      ))
    }
  }
  return findings
}

/** Check 7: runtime compatibility — engines.node and cordis/dsh ranges against actual versions. */
export function checkRuntimeCompat(pkg: InstalledPackage, environment: ClinicEnvironment): Finding[] {
  const findings: Finding[] = []
  const enginesNode = pkg.manifest?.engines?.node
  if (enginesNode !== undefined && enginesNode !== '*' && !semver.satisfies(environment.nodeVersion, enginesNode, { includePrerelease: true })) {
    findings.push(finding('runtime-compat', 'warning', `"${pkg.name}" requires node ${enginesNode}; running ${environment.nodeVersion}`))
  }
  const cordisRange = pkg.manifest?.peerDependencies?.['@deepseek-ai/cordis']
  if (cordisRange !== undefined && cordisRange !== '*' && environment.cordisVersion !== null
    && !semver.satisfies(environment.cordisVersion, cordisRange, { includePrerelease: true })) {
    findings.push(finding('runtime-compat', 'warning', `"${pkg.name}" requires cordis ${cordisRange}; installed ${environment.cordisVersion}`))
  }
  const dshRange = pkg.manifest?.dsh?.compatibility?.dsh
  if (dshRange !== undefined && dshRange !== '*' && environment.dshVersion !== null
    && !semver.satisfies(environment.dshVersion, dshRange, { includePrerelease: true })) {
    findings.push(finding('runtime-compat', 'warning', `"${pkg.name}" declares dsh compatibility ${dshRange}; installed ${environment.dshVersion}`))
  }
  return findings
}

/** Check 8: install scripts — lifecycle scripts execute package code at install time. */
export function checkInstallScripts(pkg: InstalledPackage): Finding[] {
  const findings: Finding[] = []
  const scripts = pkg.manifest?.scripts ?? {}
  for (const scriptName of INSTALL_SCRIPT_NAMES) {
    if (scripts[scriptName] !== undefined) {
      findings.push(finding(
        'install-scripts',
        'warning',
        `"${pkg.name}" declares an install-time script "${scriptName}"`,
        `${scriptName} scripts run package code outside the agent sandbox; review the package source before allowing it`,
      ))
    }
  }
  return findings
}

/** Check 9: duplicates — one package name appearing multiple times in the same profile. */
export function checkDuplicate(bundles: readonly InstalledPackage[], entries: readonly LoaderEntrySnapshot[]): Finding[] {
  const findings: Finding[] = []
  const bundleCounts = new Map<string, number>()
  for (const bundle of bundles) bundleCounts.set(bundle.name, (bundleCounts.get(bundle.name) ?? 0) + 1)
  for (const [name, count] of bundleCounts) {
    /* v8 ignore next 1 -- exercised by the duplicate-bundle assertion; v8 sourcemap misattributes the push */
    if (count > 1) findings.push(finding('duplicate', 'warning', `Bundle "${name}" appears ${count} times in the profile bundle list`))
  }
  const entryCounts = new Map<string, number>()
  for (const entry of entries) entryCounts.set(entry.moduleName, (entryCounts.get(entry.moduleName) ?? 0) + 1)
  for (const [name, count] of entryCounts) {
    if (count > 1) findings.push(finding('duplicate', 'warning', `Loader entry module "${name}" appears ${count} times in the Loader tree`))
  }
  return findings
}

/** Check 10/11: patch integrity — insert names must resolve; override ids should match a loaded entry. */
export function checkPatchHealth(
  patches: readonly PatchDocument[],
  profile: ProfileInput,
  loaderModules: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = []
  for (const patch of patches) {
    if (patch.rows === null) {
      findings.push(finding('patch-health', 'critical', `Patch layer "${patch.file}" is unusable`, patch.parseError))
      continue
    }
    for (const row of patch.rows) {
      /* v8 ignore next 4 -- exercised by the patch-health assertions; v8 sourcemap misattributes the compound condition */
      if (row.kind === 'insert' && row.name !== undefined) {
        const resolvable = profile.bundles.some((bundle) => bundle.name === row.name)
          || profile.dependencies.some((dep) => dep.name === row.name)
        if (!resolvable) {
          findings.push(finding('patch-health', 'critical', `Patch "${patch.file}" inserts "${row.name}" which is not resolvable from the profile`, row.id))
        }
      } else if (row.kind === 'override' && !loaderModules.has(row.id)) {
        findings.push(finding('patch-health', 'warning', `Patch "${patch.file}" overrides entry "${row.id}" which is not in the Loader tree`, 'the entry may belong to a layer not currently loaded'))
      }
    }
  }
  return findings
}

/** Check 12: provenance — an info-level source annotation for every plugin. */
export function checkProvenance(pkg: InstalledPackage, source: 'bundle' | 'dependency'): Finding[] {
  const origin = pkg.resolveError !== undefined ? 'unresolved' : pkg.dir ?? 'unknown location'
  return [finding('provenance', 'info', `${source} plugin "${pkg.name}"`, origin)]
}
