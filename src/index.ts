/**
 * dsh-plugin-clinic Host half: assembles the read-only diagnostic engine,
 * the plugin_health model tool, the /clinic HTTP routes, and the optional
 * invariant companion. Everything is effect-based — unloading this fiber
 * withdraws every registration.
 * @module dsh-plugin-clinic
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-invariants'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Severity } from './types.ts'
import { ClinicConfigSchema, type ClinicConfig } from './types.ts'
import { collectEnvironment, collectInput, snapshotLoaderEntries } from './engine/inventory.ts'
import { runClinic } from './engine/report.ts'
import { registerClinicTool } from './tool.ts'
import { createClinicRoute } from './route.ts'
import { install } from './invariant.ts'
import type { RunClinic } from './run.ts'

/** Cordis plugin name. */
export const name = 'dsh-plugin-clinic'
/** Services required to load: the Loader tree and the tools registry. */
export const inject = ['loader', 'tools']
/** Validated deployment configuration. */
export const Config = ClinicConfigSchema

/** Mount the clinic: engine runner, tool, routes, invariant. */
export function apply(ctx: Context, config: ClinicConfig): void {
  const dshHome = resolveDshHome()
  const environment = collectEnvironment(dshHome)

  const runner: RunClinic = {
    async run(severity: Severity) {
      const entries = snapshotLoaderEntries(ctx.loader.entries())
      const input = await collectInput(dshHome, environment, entries, {
        ...(config.profiles !== undefined ? { profiles: config.profiles } : {}),
        ...(config.includeHomePatches !== undefined ? { includeHomePatches: config.includeHomePatches } : {}),
      })
      return runClinic(input, severity)
    },
  }

  if (config.enableTool !== false) {
    registerClinicTool(ctx, runner)
  }

  if (config.enableWebRoute !== false) {
    // Lazy mount: the webserver row mounts in parallel with this entry in a
    // real profile tree, so the service may not exist at apply time (it never
    // does in a headless tree). Injecting waits for the service instead of
    // racing it; without a webServer the routes simply never register.
    ctx.inject(['webServer'], (webCtx) => {
      const disposer = webCtx.webServer.register(createClinicRoute({
        prefix: config.webRoutePrefix ?? '/clinic',
        runner,
      }))
      ctx.effect(() => disposer, 'dsh-plugin-clinic: /clinic routes')
    })
  }

  // Same lazy pattern for the optional invariant companion.
  ctx.inject(['invariants'], (invCtx) => {
    const disposer = invCtx.invariants.register('dsh-plugin-clinic', install)
    ctx.effect(() => disposer, 'dsh-plugin-clinic: invariant companion')
  })
}
