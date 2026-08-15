/**
 * dsh-plugin-clinic browser half: registers the Clinic (体检) tab into the
 * official Settings → Plugins extension point. The tab fetches the same
 * ClinicReport the model tool returns, from the Host's /clinic routes.
 * @module dsh-plugin-clinic/client
 */

import type { ClientContext, ClientSlotsService, ClientLocaleService } from './slot-types.ts'
import { ClinicTab, type ClinicTabInjected } from './ClinicTab.tsx'
import { en, zh, type ClinicLocaleKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.clinic'

/** Services required by the Settings registration. */
export const inject = ['slots', 'locale']

/** Contribute the lazy Clinic tab to the Plugins settings section. */
export function apply(ctx: ClientContext, config: { webRoutePrefix?: string }): void {
  const slots: ClientSlotsService = ctx.slots
  const locale: ClientLocaleService = ctx.locale
  ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-plugin-clinic: dictionaries')

  const t = locale.bind(NS)
  const prefix = config.webRoutePrefix ?? '/clinic'
  const injected = (): ClinicTabInjected => ({
    summaryUrl: `${prefix}/health/summary`,
    detailUrl: `${prefix}/health`,
  })

  slots.inject('settings.plugins.tab', () => slots.register({
    name: 'settings.plugins.tab',
    id: 'clinic',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, ClinicTab))
}

// LocaleNamespaceMap declaration keeps the namespace key type-stable for the
// official locale service (mirrors the official ui-* packages).
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-plugin-clinic dashboard copy. */
    'settings.clinic': ClinicLocaleKey
  }
}
