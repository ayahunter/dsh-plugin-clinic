/**
 * Package-owned invariant companion for dsh-plugin-clinic. Exported as
 * ./invariant so a profile that provides the invariants service can mount it;
 * stock profiles do not provide the service, so the bundle patch does not
 * mount this row and apply() registers it opportunistically instead.
 * @module dsh-plugin-clinic/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

/** Cordis companion plugin name. */
export const name = 'dsh-plugin-clinic-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the diagnostic engine is pure and read-only — every
 * behavior is observed through the tool, route, and composition tests, and
 * the engine owns no event protocol or mutable state to assert.
 */
export const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('dsh-plugin-clinic', install))
