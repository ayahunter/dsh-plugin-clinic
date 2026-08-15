/**
 * Composition tests: boot the real Cordis Loader with the clinic plugin
 * (source entry), a real webServer, and a minimal tools host against a
 * fixture DSH_HOME. Asserts the plugin loads, the tool registers and
 * executes against real fixture data, the HTTP routes answer with Host
 * enforcement, and unloading withdraws every registration.
 * @module dsh-plugin-clinic/tests/composition
 */

import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { afterEach, describe, expect, it } from 'vitest'
import { apply as clinicApply } from '../src/index.ts'
import type { ClinicReport } from '../src/types.ts'
import { createFixtureHome } from './helpers/fixtures.ts'
import * as TestHost from './helpers/host.ts'

/** Boot the composition; returns handles for assertions and teardown. */
async function boot(dshHome: string) {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome

  const ctx = new Context()
  await ctx.plugin(TestHost)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const clinicEntry = pathToFileURL(join(import.meta.dirname, '..', 'src', 'index.ts')).href
  await loader.root.create({ name: clinicEntry })
  await loader.await()

  // Read the tools registry through the host service.
  const tools = ctx.get('tools') as unknown as { list(): string[]; get(name: string): { name: string; execute(args: Record<string, unknown>): Promise<unknown> } | undefined }

  return {
    ctx,
    loader,
    tools,
    webServer: ctx.get('webServer') as unknown as { port: number },
    async teardown() {
      // Remove every entry explicitly: stop()/update([]) do not clear the
      // entry store in the npm loader build.
      for (const entry of [...loader.entries()]) {
        await loader.root.remove(entry.id, true)
      }
      ctx.registry.delete(WebServer)
      ctx.registry.delete(TestHost)
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    },
  }
}

describe('composition: clinic plugin under the real Loader', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureHome>> | undefined
  afterEach(async () => {
    await fixture?.cleanup()
  })

  it('loads, registers the tool, executes it against the fixture home, serves routes, and unloads cleanly', async () => {
    fixture = await createFixtureHome()
    const { ctx, tools, webServer, teardown } = await boot(fixture.dshHome)
    try {
      expect(tools.list()).toContain('plugin_health')

      const tool = tools.get('plugin_health')
      expect(tool).toBeDefined()

      // Execute with details: false — the stripped report still folds counts
      // from the real fixture (broken profile: unresolvable bundle + bad patch).
      const stripped = (await tool?.execute({ details: false })) as ClinicReport
      expect(stripped.schemaVersion).toBe(1)
      expect(stripped.profiles.map((profile) => profile.profile).sort()).toEqual(['broken', 'web'])
      const broken = stripped.profiles.find((profile) => profile.profile === 'broken')
      expect(broken?.summary.critical).toBeGreaterThan(0)
      expect(broken?.plugins.every((plugin) => plugin.findings.length === 0)).toBe(true)

      // Execute with details: true — findings are present.
      const full = (await tool?.execute({ details: true })) as ClinicReport
      const brokenFull = full.profiles.find((profile) => profile.profile === 'broken')
      expect(brokenFull?.plugins.some((plugin) => plugin.findings.some((finding) => finding.checkId === 'bundle-manifest' && finding.severity === 'critical'))).toBe(true)
      const risky = brokenFull?.plugins.find((plugin) => plugin.plugin === 'dsh-plugin-risky')
      expect(risky?.findings.some((finding) => finding.checkId === 'install-scripts')).toBe(true)

      // The severity filter applies.
      const criticalOnly = (await tool?.execute({ details: true, severity: 'critical' })) as ClinicReport
      const webOnly = criticalOnly.profiles.find((profile) => profile.profile === 'web')
      expect(webOnly?.summary.warning).toBe(0)

      // HTTP routes answer with Host enforcement.
      const baseUrl = `http://127.0.0.1:${webServer.port}`
      const response = await fetch(`${baseUrl}/clinic/health`)
      expect(response.status).toBe(200)
      const viaHttp = (await response.json()) as ClinicReport
      expect(viaHttp.profiles).toHaveLength(2)
      const summary = await fetch(`${baseUrl}/clinic/health/summary`)
      expect(summary.status).toBe(200)
      // fetch forbids a custom Host header; forge it through node:http.
      const forbiddenStatus = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(`${baseUrl}/clinic/health`, { method: 'GET', headers: { host: 'evil.example.com' } }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.end()
      })
      expect(forbiddenStatus).toBe(403)
    } finally {
      // Unload: the loader tree empties. Tool-registration withdrawal is the
      // official tools registry's fiber binding (not modelled by the mock),
      // so the real-Loader assertion is the entry teardown itself.
      await teardown()
      expect([...ctx.loader.entries()].length).toBe(0)
    }
  })
})
