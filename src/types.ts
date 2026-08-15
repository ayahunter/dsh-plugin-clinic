/**
 * Public types for dsh-plugin-clinic: plugin configuration, the read-only
 * diagnostic input model, and the ClinicReport JSON contract shared by the
 * model tool, the HTTP routes, and the Web dashboard.
 * @module dsh-plugin-clinic/types
 */

import { z } from 'zod'

/** Deployment configuration, validated at plugin load (zod, below). */
export interface ClinicConfig {
  /** Profile directory names to diagnose; absent = every profile under the Harness home. */
  profiles?: readonly string[]
  /** Register the model-facing plugin_health tool. Default true. */
  enableTool?: boolean
  /** Register the /clinic health HTTP routes on ctx.webServer when present. Default true. */
  enableWebRoute?: boolean
  /** Route prefix for the health endpoints. Default '/clinic'. */
  webRoutePrefix?: string
  /** Include the home-level cordis.patch.yml in patch-health checks. Default true. */
  includeHomePatches?: boolean
}

/** zod schema backing the config (standard-schema validated by Cordis); default {} so a config-less row loads. */
export const ClinicConfigSchema = z.object({
  profiles: z.array(z.string()).optional(),
  enableTool: z.boolean().optional(),
  enableWebRoute: z.boolean().optional(),
  webRoutePrefix: z.string().optional(),
  includeHomePatches: z.boolean().optional(),
}).default({})

/** Severity ladder; a plugin report folds to its highest finding. */
export type Severity = 'critical' | 'warning' | 'info'

/** Stable identity of one check rule. */
export type CheckId =
  | 'load-health'
  | 'bundle-manifest'
  | 'peer-deps'
  | 'runtime-compat'
  | 'install-scripts'
  | 'duplicate'
  | 'patch-health'
  | 'provenance'

/** One diagnostic finding with a stable check identity and human evidence. */
export interface Finding {
  checkId: CheckId
  severity: Severity
  message: string
  /** Machine-oriented evidence; deliberately minimal (no script bodies, no source text). */
  evidence?: string
}

/** Severity counters for one report scope. */
export interface SeverityCounts {
  critical: number
  warning: number
  info: number
}

/** Runtime facts every check can compare against. */
export interface ClinicEnvironment {
  dshVersion: string | null
  cordisVersion: string | null
  nodeVersion: string
  platform: string
  dshHome: string
}

/** How a plugin reached this installation. */
export type PluginSource = 'bundle' | 'dependency' | 'loader-only'

/** One diagnosed plugin instance. */
export interface PluginReport {
  plugin: string
  version: string | null
  source: PluginSource
  findings: Finding[]
}

/** One diagnosed profile. */
export interface ProfileReport {
  profile: string
  manifestPath: string
  plugins: PluginReport[]
  /** Findings scoped to the profile itself (patch integrity, duplicates). */
  profileFindings: Finding[]
  summary: SeverityCounts
  /** Which checks ran for this profile and why a check may have been skipped. */
  checks: { id: CheckId; ran: boolean; note?: string }[]
}

/** The full report contract (schemaVersion 1). */
export interface ClinicReport {
  schemaVersion: 1
  generatedAt: string
  environment: ClinicEnvironment
  profiles: ProfileReport[]
}

/** Summary projection served to the dashboard first screen. */
export interface ClinicSummary {
  schemaVersion: 1
  generatedAt: string
  environment: ClinicEnvironment
  profiles: { profile: string; summary: SeverityCounts }[]
}

/** Highest severity first for folding. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'warning', 'info']

/** Fold a finding list into severity counts. */
export function foldSeverity(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

/** Highest severity present in a finding list, or 'info' when empty (an empty list is a clean bill). */
export function highestSeverity(findings: readonly Finding[]): Severity {
  for (const severity of SEVERITY_ORDER) {
    if (findings.some((finding) => finding.severity === severity)) return severity
  }
  return 'info'
}
