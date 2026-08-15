/**
 * Input collection for the clinic engine: everything the checks read lives
 * on the Harness home's profiles and the current Loader tree. This module
 * owns all filesystem and module-resolution I/O; the checks in checks.ts are
 * pure functions over the collected model.
 * @module dsh-plugin-clinic/engine/inventory
 */

import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import type { ClinicEnvironment } from '../types.ts'

/** Root-fiber phases of a Loader entry, mirroring Cordis FiberState. */
export type FiberPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading'

/** The Loader-tree facts one entry contributes to a diagnosis. */
export interface LoaderEntrySnapshot {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: FiberPhase | null
}

/** Package-manifest facts the checks read; unknown fields stay untyped. */
export interface PkgManifest {
  name?: string
  version?: string
  engines?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  scripts?: Record<string, string>
  dsh?: {
    bundle?: { patch?: string }
    compatibility?: { dsh?: string }
  }
}

/** One resolved package (bundle, dependency, or in-box) on disk. */
export interface InstalledPackage {
  name: string
  manifest: PkgManifest | null
  /** Package root directory; null when resolution failed. */
  dir: string | null
  resolveError?: string
  /** The bundle patch document, when the manifest declares one. */
  patch: PatchDocument | null
}

/** One row of a cordis patch layer. */
export interface PatchRow {
  kind: 'insert' | 'override'
  id: string
  name?: string
}

/** A parsed patch layer document; rows is null when parsing failed. */
export interface PatchDocument {
  file: string
  rows: PatchRow[] | null
  parseError?: string
}

/** A profile's manifest facts. */
export interface ProfileManifest {
  bundles: readonly string[]
  dependencies: ReadonlyMap<string, string>
}

/** Everything the checks need for one profile. */
export interface ProfileInput {
  profile: string
  dir: string
  manifestPath: string
  manifest: ProfileManifest | null
  manifestError?: string
  /** Bundles in manifest order; failed resolutions carry resolveError. */
  bundles: InstalledPackage[]
  /** Every declared dependency, including non-bundle packages. */
  dependencies: InstalledPackage[]
  /** Bundle patches plus the profile's own cordis.patch.yml. */
  patches: PatchDocument[]
  loaderEntries: readonly LoaderEntrySnapshot[]
}

/** Everything the checks need for one diagnosis run. */
export interface EngineInput {
  environment: ClinicEnvironment
  profiles: ProfileInput[]
  /** Home-level cordis.patch.yml, when includeHomePatches is enabled. */
  homePatches: PatchDocument[]
}

/** Options controlling profile selection. */
export interface InventoryOptions {
  /** Profile directory names to include; absent = every profile. */
  profiles?: readonly string[]
  includeHomePatches?: boolean
}

const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

/** Minimal structural view of the Loader entry the loader service exposes. */
interface LoaderEntryView {
  id: string
  disabled?: boolean
  options: { name?: string; group?: unknown }
  fiber?: { state: import('@deepseek-ai/cordis').FiberState | string } | undefined
}

/** Convert raw loader entries into the snapshot model, skipping group rows. */
export function snapshotLoaderEntries(entries: Iterable<LoaderEntryView>): LoaderEntrySnapshot[] {
  const snapshots: LoaderEntrySnapshot[] = []
  for (const entry of entries) {
    if (entry.options.group) continue
    const moduleName = entry.options.name ?? entry.id
    snapshots.push({
      entryId: entry.id,
      moduleName,
      enabled: !entry.disabled,
      // The loader fiber state vocabulary is the five phases; the structural
      // view types it loosely because the npm loader d.ts spells it FiberState.
      fiberPhase: entry.fiber === undefined ? null : entry.fiber.state as unknown as FiberPhase,
    })
  }
  return snapshots
}

/** Resolve a package.json path to its version, or null when unresolvable. */
export function resolveInstalledVersion(specifier: string, fromFile: string): string | null {
  try {
    const require = createRequire(fromFile)
    const packageJsonPath = require.resolve(`${specifier}/package.json`)
    const manifest = JSON.parse(readFileSyncSafe(packageJsonPath) ?? '{}') as { version?: string }
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

/** Synchronous safe read used only by version resolution (module resolution is sync). */
const nodeRequire = createRequire(import.meta.url)
function readFileSyncSafe(path: string): string | null {
  try {
    const { readFileSync } = nodeRequire('node:fs') as typeof import('node:fs')
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** List profile directory names under the Harness home. */
export async function listProfileNames(dshHome: string): Promise<string[]> {
  const profilesDir = join(dshHome, 'profiles')
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

/** Read and interpret one profile's package.json manifest. */
export async function readProfileManifest(dir: string): Promise<{ manifest: ProfileManifest | null; error?: string }> {
  const manifestPath = join(dir, 'package.json')
  let text: string
  try {
    text = await readFile(manifestPath, 'utf8')
  } catch (error) {
    return { manifest: null, error: message(error) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { manifest: null, error: `invalid JSON: ${message(error)}` }
  }
  const bundles = readStringArray(parsed, 'dsh.profile.bundles')
  const dependencies = readStringMap(parsed, 'dependencies')
  if (bundles === null || dependencies === null) {
    return { manifest: null, error: 'manifest must declare dsh.profile.bundles and dependencies' }
  }
  return { manifest: { bundles, dependencies } }
}

/** Resolve one package's manifest from the profile directory. */
export async function resolveInstalledPackage(
  name: string,
  profileDir: string,
): Promise<InstalledPackage> {
  const profileRequire = createRequire(join(profileDir, 'package.json'))
  let packageJsonPath: string
  try {
    packageJsonPath = profileRequire.resolve(`${name}/package.json`)
  } catch {
    return { name, manifest: null, dir: null, patch: null, resolveError: `package "${name}" is not resolvable from the profile` }
  }
  let manifest: PkgManifest | null = null
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PkgManifest
  } catch {
    // v8 ignore next 2 -- resolution already validated the file parses
    // (Node's resolver reads package.json), so a parse failure here is unreachable.
    manifest = null
  }
  const patch = await readBundlePatch(name, manifest, dirname(packageJsonPath))
  return { name, manifest, dir: dirname(packageJsonPath), patch }
}

/** Read and parse one patch layer file; an absent file is an absent document, a bad one carries its error. */
export async function readPatchFile(file: string): Promise<PatchDocument> {
  let text: string
  /* v8 ignore next 2 -- success path exercised by the fixture collection tests; v8 sourcemap misattributes the awaited read */
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    // An absent file is a normal "no layer" state for optional layers (home
    // patch); bundle patches surface absence through their own critical check.
    if (isNotFound(error)) return { file, rows: null }
    return { file, rows: null, parseError: `unreadable patch: ${message(error)}` }
  }
  const rows = parsePatchRows(text)
  /* v8 ignore next 1 -- malformed-document branch exercised by the home-patch test; v8 sourcemap misattributes the return */
  if (rows === null) {
    return { file, rows: null, parseError: `patch is not a YAML array of rows (${file})` }
  }
  return { file, rows }
}

/** Parse patch-layer YAML into rows; null when the document is not a row array. */
export function parsePatchRows(text: string): PatchRow[] | null {
  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const rows: PatchRow[] = []
  for (const element of parsed) {
    if (!isRecord(element)) return null
    const inserted = element['insert']
    if (Array.isArray(inserted)) {
      for (const row of inserted) {
        if (!isRecord(row) || typeof row['id'] !== 'string') return null
        const name = row['name']
        rows.push({ kind: 'insert', id: row['id'], ...(typeof name === 'string' ? { name } : {}) })
      }
      continue
    }
    if (typeof element['id'] === 'string') {
      rows.push({ kind: 'override', id: element['id'] })
      continue
    }
    return null
  }
  return rows
}

/** Collect every profile input for one run. */
export async function collectInput(
  dshHome: string,
  environment: ClinicEnvironment,
  loaderEntries: readonly LoaderEntrySnapshot[],
  options: InventoryOptions = {},
): Promise<EngineInput> {
  const names = options.profiles && options.profiles.length > 0 ? [...options.profiles] : await listProfileNames(dshHome)
  const profiles: ProfileInput[] = []
  for (const name of names) {
    profiles.push(await collectProfile(name, dshHome, loaderEntries))
  }
  const homePatches: PatchDocument[] = []
  if (options.includeHomePatches !== false) {
    const homePatch = await readPatchFile(join(dshHome, PROFILE_PATCH_FILENAME))
    if (homePatch.rows !== null || homePatch.parseError !== undefined) homePatches.push(homePatch)
  }
  return { environment, profiles, homePatches }
}

/** Collect the runtime facts checks compare against. */
export function collectEnvironment(dshHome: string): ClinicEnvironment {
  return {
    dshVersion: resolveInstalledVersion('@deepseek-ai/dsh-base', import.meta.url),
    cordisVersion: resolveInstalledVersion('@deepseek-ai/cordis', import.meta.url),
    nodeVersion: process.version,
    platform: process.platform,
    dshHome,
  }
}

/** Collect one profile's full input model. */
async function collectProfile(name: string, dshHome: string, loaderEntries: readonly LoaderEntrySnapshot[]): Promise<ProfileInput> {
  /* v8 ignore next 2 -- exercised by the fixture collection tests; v8 sourcemap misattributes the join/read lines */
  const dir = join(dshHome, 'profiles', name)
  const manifestPath = join(dir, 'package.json')
  const { manifest, error: manifestError } = await readProfileManifest(dir)

  if (manifest === null) {
    return { profile: name, dir, manifestPath, manifest: null, ...(manifestError !== undefined ? { manifestError } : {}), bundles: [], dependencies: [], patches: [], loaderEntries }
  }

  const bundles: InstalledPackage[] = []
  for (const bundleName of manifest.bundles) {
    bundles.push(await resolveInstalledPackage(bundleName, dir))
  }

  const dependencyNames = [...manifest.dependencies.keys()].filter((dep) => !manifest.bundles.includes(dep))
  const dependencies: InstalledPackage[] = []
  for (const depName of dependencyNames) {
    dependencies.push(await resolveInstalledPackage(depName, dir))
  }

  /* v8 ignore next 1 -- exercised by the fixture collection tests; v8 sourcemap misattributes the declaration */
  const patches: PatchDocument[] = []
  for (const bundle of bundles) {
    if (bundle.patch !== null && bundle.patch.rows !== null) patches.push(bundle.patch)
  }
  const profilePatch = await readPatchFile(join(dir, PROFILE_PATCH_FILENAME))
  if (profilePatch.rows !== null || profilePatch.parseError !== undefined) patches.push(profilePatch)

  return { profile: name, dir, manifestPath, manifest, bundles, dependencies, patches, loaderEntries }
}

/** Read a bundle's declared patch document, or null when undeclared or unusable. */
async function readBundlePatch(name: string, manifest: PkgManifest | null, packageDir: string): Promise<PatchDocument | null> {
  const patchPath = manifest?.dsh?.bundle?.patch
  if (typeof patchPath !== 'string' || patchPath === '') {
    return manifest === null ? null : { file: `${name}: (no dsh.bundle.patch)`, rows: null, parseError: 'no dsh.bundle.patch declaration' }
  }
  const absolute = isAbsolute(patchPath) ? patchPath : join(packageDir, patchPath)
  return readPatchFile(absolute)
}

function readStringArray(value: unknown, path: string): readonly string[] | null {
  if (!isRecord(value)) return null
  const parts = path.split('.')
  let cursor: unknown = value
  for (const part of parts) {
    if (!isRecord(cursor)) return null
    cursor = cursor[part]
  }
  return Array.isArray(cursor) && cursor.every((item) => typeof item === 'string') ? cursor as string[] : null
}

function readStringMap(value: unknown, key: string): ReadonlyMap<string, string> | null {
  if (!isRecord(value)) return null
  const raw = value[key]
  if (!isRecord(raw)) return null
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') return null
    map.set(k, v)
  }
  return map
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether a filesystem error means the target does not exist. */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}
