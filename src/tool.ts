/**
 * The model-facing plugin_health tool: runs the clinic over the installed
 * plugin set and returns a ClinicReport. `details: false` (default) strips
 * findings to counts so the model-visible payload stays bounded no matter how
 * many plugins are installed; the markdown render summarizes the report.
 * @module dsh-plugin-clinic/tool
 */

import { defineTool, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { ClinicReport, Finding, Severity } from './types.ts'
import type { RunClinic } from './run.ts'

/** Tool-facing severity vocabulary: 'all' is the full report. */
export type ToolSeverity = 'all' | 'warning' | 'critical'

/** Map the tool vocabulary onto the report threshold. */
export function severityFromTool(value: ToolSeverity | undefined): Severity {
  if (value === 'warning' || value === 'critical') return value
  return 'info'
}

/** Strip findings to counts; used by the default details: false mode. */
export function stripFindings(report: ClinicReport): ClinicReport {
  return {
    ...report,
    profiles: report.profiles.map((profile) => ({
      ...profile,
      plugins: profile.plugins.map((plugin) => ({ ...plugin, findings: [] as Finding[] })),
      profileFindings: [] as Finding[],
    })),
  }
}

/** Markdown summary rendered to the model. */
export function renderMarkdown(report: ClinicReport): string {
  const environment = report.environment
  const lines = [
    `## 插件体检（${report.generatedAt}）`,
    `环境：dsh ${environment.dshVersion ?? 'unknown'} · cordis ${environment.cordisVersion ?? 'unknown'} · node ${environment.nodeVersion} · ${environment.platform}`,
  ]
  if (report.profiles.length === 0) {
    lines.push('没有可体检的 profile。')
    return lines.join('\n')
  }
  for (const profile of report.profiles) {
    const s = profile.summary
    lines.push(`\n### ${profile.profile} — critical: ${s.critical} · warning: ${s.warning} · info: ${s.info}`)
    if (profile.plugins.length === 0) {
      lines.push('- （无已解析插件）')
      continue
    }
    for (const plugin of profile.plugins) {
      if (plugin.findings.length > 0) {
        for (const finding of plugin.findings) {
          lines.push(`- [${finding.severity}] ${plugin.plugin}@${plugin.version ?? '?'}（${plugin.source}）：${finding.message}`)
        }
      } else {
        lines.push(`- ${plugin.plugin}@${plugin.version ?? '?'}（${plugin.source}）：健康`)
      }
    }
  }
  lines.push('\n> 提示：`details: true` 可查看每条发现的 evidence；`severity: warning` 可只看 critical+warning。')
  return lines.join('\n')
}

/** The finding node reused by plugin and profile finding arrays. */
const findingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    checkId: { type: 'string', required: true },
    severity: { type: 'string', required: true, enum: ['critical', 'warning', 'info'] },
    message: { type: 'string', required: true },
    evidence: { type: 'string' },
  },
} as const

/** Full canonical-output declaration; validated against every execution result. */
/* v8 ignore next 22 -- declarative schema constant; evaluated at module load, exercised by registerClinicTool */
const clinicReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', required: true },
    generatedAt: { type: 'string', required: true },
    environment: {
      type: 'object',
      additionalProperties: false,
      required: true,
      properties: {
        dshVersion: { type: 'json', required: true },
        cordisVersion: { type: 'json', required: true },
        nodeVersion: { type: 'string', required: true },
        platform: { type: 'string', required: true },
        dshHome: { type: 'string', required: true },
      },
    },
    profiles: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          profile: { type: 'string', required: true },
          manifestPath: { type: 'string', required: true },
          plugins: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                plugin: { type: 'string', required: true },
                version: { type: 'json', required: true },
                source: { type: 'string', required: true },
                findings: { type: 'array', required: true, items: findingSchema },
              },
            },
          },
          profileFindings: { type: 'array', required: true, items: findingSchema },
          summary: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              critical: { type: 'integer', required: true },
              warning: { type: 'integer', required: true },
              info: { type: 'integer', required: true },
            },
          },
          checks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                ran: { type: 'boolean', required: true },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies ValueSchemaSpec

/** Register the plugin_health tool on the tools registry. */
export function registerClinicTool(ctx: { tools: { register(tool: unknown): unknown } }, runner: RunClinic): void {
  ctx.tools.register(defineTool({
    name: 'plugin_health',
    description: 'Run read-only health checks over the installed DeepSeek Harness plugins (loader health, dependency integrity, version compatibility, install-script risk, duplicates, patch integrity) and return a ClinicReport JSON document.',
    parameters: {
      profiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Profile directory names to diagnose; omitted = every profile under the Harness home.',
      },
      severity: {
        type: 'string',
        enum: ['all', 'warning', 'critical'],
        description: 'Keep only findings at or above this severity. Default all.',
      },
      details: {
        type: 'boolean',
        description: 'Include per-finding evidence. Default false (counts only, bounded output).',
      },
    },
    output: {
      schema: clinicReportSchema,
      render: (_args, value) => [{
        type: 'text',
        // The inferred canonical type has the same structure as ClinicReport;
        // the runtime value is validated against the identical schema above.
        text: renderMarkdown(value as unknown as ClinicReport),
      }],
    },
    async execute(args) {
      const report = await runner.run(severityFromTool(args.severity))
      if (args.details === false || args.details === undefined) return stripFindings(report)
      return report
    },
  }))
}
