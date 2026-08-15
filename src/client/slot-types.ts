/**
 * Local browser-half type surface for dsh-plugin-clinic.
 *
 * The npm-published d.ts of the official client packages re-exports their
 * contracts with '.ts' specifiers (the workspace-source convention); an
 * out-of-tree consumer cannot resolve those specifiers, so the official
 * SlotMap/ClientContext declaration merges never reach the program. This
 * module restores the minimal surface the Clinic tab needs, mirroring
 * packages/client/ui-settings/src/client/contract/slots.ts and the
 * dsh-client-runtime ClientContext shape. The runtime services themselves
 * (slots, locale) are provided by the official web composition by string
 * service name; these types are a compile-time contract only.
 * @module dsh-plugin-clinic/client/slot-types
 */

import type { FiberState } from '@deepseek-ai/cordis'

/** Owner share of a Plugins tab (the section supplies nothing). */
export interface SettingsPluginsTabOwnerProps {
  /** Marker field: tab owner props are intentionally empty. */
  children?: never
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One page inside the Plugins settings section (official extension
     * point). Options: `id` (tab key), `order` (tab order), `label`
     * (localized tab text).
     */
    'settings.plugins.tab': { kind: 'list'; scope: 'root'; owner: SettingsPluginsTabOwnerProps }
  }
}

/** Runtime share of a slot contribution: the slot owner props. */
export type PropsRuntime<K extends string> = K extends keyof import('@deepseek-ai/dsh-client-ui-slots').SlotMap
  ? import('@deepseek-ai/dsh-client-ui-slots').SlotMap[K] extends { owner: infer O } ? O : object
  : object

/** Locale share: a keyed translator bound to the registration namespace. */
export interface PropsLocale<N extends string> {
  t(key: string): string
}

/** Inject share: the values the apply closure hands to the component. */
export type InjectFace<I> = I

/** Minimal registration options accepted by the slots service. */
export interface SlotRegisterOptions<I> {
  name: string
  id: string
  order?: number
  label?: () => string
  locale?: string
  inject?: () => I
}

/** The slots service face the browser half injects. */
export interface ClientSlotsService {
  /** Wait for a slot declaration, then register; rolls back on redeclaration. */
  inject(name: string, factory: () => () => void): void
  /** Register one contribution into a declared slot. */
  register<I>(options: SlotRegisterOptions<I>, component: unknown): () => void
}

/** The locale service face the browser half injects. */
export interface ClientLocaleService {
  register(namespace: string, dictionaries: Record<string, object>): void
  bind(namespace: string): (key: string) => string
}

/**
 * Browser-half context: the injected client services plus the small cordis
 * surface the apply body touches. Declared standalone (not extending the
 * cordis Context) because the npm-published cordis 4.0.1 Context does not
 * carry the browser effect/service faces; the runtime object is the real
 * client context.
 */
export interface ClientContext {
  slots: ClientSlotsService
  locale: ClientLocaleService
  /** Effect registration accepting a disposer-returning or void body. */
  effect(execute: () => void | (() => void), label?: string): unknown
  /** Strict service lookup for optional services. */
  get<T>(name: string): T | undefined
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
}
