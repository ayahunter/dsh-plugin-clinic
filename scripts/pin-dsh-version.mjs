/**
 * Pin every `@deepseek-ai/dsh-*` dependency to an exact DSH release (e.g.
 * `0.1.0-rc.3`). The CI compatibility matrix rewrites package.json per matrix
 * cell so typecheck/test/build run against each DSH rc the official registry
 * still ships. `@deepseek-ai/cordis` and the cordis runtime plugins
 * (`cordis-plugin-loader` 1.0.x and friends) are versioned on their own lines
 * and are left untouched — their compatibility is negotiated through the dsh
 * packages' peer ranges during install.
 * @module dsh-plugin-clinic/scripts/pin-dsh-version
 */

import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const PINNED_PREFIX = '@deepseek-ai/dsh-'
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies']

/**
 * Rewrite package.json in place with the given dsh rc pinned exactly.
 * @param version - the dsh rc version to pin (e.g. `0.1.0-rc.6`).
 * @param manifestPath - package.json path; defaults to ./package.json.
 */
export async function pinDshVersion(version, manifestPath = 'package.json') {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  let changed = 0
  for (const section of SECTIONS) {
    const deps = manifest[section]
    if (deps === undefined) continue
    for (const name of Object.keys(deps)) {
      if (name.startsWith(PINNED_PREFIX) && deps[name] !== version) {
        deps[name] = version
        changed += 1
      }
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`pin-dsh-version: pinned ${changed} @deepseek-ai/dsh-* entries to ${version}`)
  return changed
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const version = process.argv[2]
  if (version === undefined) {
    console.error('usage: node scripts/pin-dsh-version.mjs <version>')
    process.exit(2)
  }
  await pinDshVersion(version)
}
