/**
 * Unit tests for the tool layer: severity vocabulary mapping, the
 * details:false strip, and the markdown render.
 * @module dsh-plugin-clinic/tests/tool
 */

import { describe, expect, it, vi } from 'vitest'
import { registerClinicTool, renderMarkdown, severityFromTool, stripFindings } from '../src/tool.ts'
import type { ClinicReport } from '../src/types.ts'
import type { RunClinic } from '../src/run.ts'

function report(): ClinicReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-16T00:00:00.000Z',
    environment: { dshVersion: '0.1.0-rc.6', cordisVersion: '4.0.1', nodeVersion: 'v24.19.0', platform: 'win32', dshHome: 'C:\\Users\\me\\.dsh' },
    profiles: [{
      profile: 'web',
      manifestPath: 'C:\\Users\\me\\.dsh\\profiles\\web\\package.json',
      plugins: [{
        plugin: 'dsh-plugin-x',
        version: '0.1.0',
        source: 'bundle',
        findings: [
          { checkId: 'install-scripts', severity: 'warning', message: '"dsh-plugin-x" declares an install-time script "postinstall"' },
          { checkId: 'provenance', severity: 'info', message: 'bundle plugin "dsh-plugin-x"', evidence: 'C:\\fake' },
        ],
      }],
      profileFindings: [{ checkId: 'patch-health', severity: 'critical', message: 'boom' }],
      summary: { critical: 1, warning: 1, info: 1 },
      checks: [{ id: 'load-health', ran: true }],
    }],
  }
}

describe('severityFromTool', () => {
  it('maps the tool vocabulary onto the report threshold', () => {
    expect(severityFromTool(undefined)).toBe('info')
    expect(severityFromTool('all')).toBe('info')
    expect(severityFromTool('warning')).toBe('warning')
    expect(severityFromTool('critical')).toBe('critical')
  })
})

describe('stripFindings', () => {
  it('removes findings but keeps counts and structure', () => {
    const stripped = stripFindings(report())
    expect(stripped.profiles[0]?.plugins[0]?.findings).toEqual([])
    expect(stripped.profiles[0]?.profileFindings).toEqual([])
    expect(stripped.profiles[0]?.summary).toEqual({ critical: 1, warning: 1, info: 1 })
  })
})

describe('registerClinicTool', () => {
  it('registers a definition whose execute runs the runner with the severity mapping and strips by details', async () => {
    const registered: Array<{ name: string; execute(args: Record<string, unknown>): Promise<unknown> }> = []
    const tools = { register: (tool: { name: string; execute(args: Record<string, unknown>): Promise<unknown> }) => { registered.push(tool); return () => {} } }
    const runner: RunClinic = { run: vi.fn(async (severity) => ({ ...report(), profiles: [], environment: { ...report().environment } })) }

    registerClinicTool({ tools }, runner)
    expect(registered).toHaveLength(1)
    expect(registered[0]?.name).toBe('plugin_health')

    const stripped = await registered[0]?.execute({})
    expect((stripped as ClinicReport).profiles).toEqual([])
    expect(runner.run).toHaveBeenCalledWith('info')

    const full = await registered[0]?.execute({ details: true, severity: 'critical' })
    expect((full as ClinicReport).profiles).toEqual([])
    expect(runner.run).toHaveBeenLastCalledWith('critical')
  })
})

describe('renderMarkdown', () => {
  it('renders environment, per-profile summaries, and per-plugin findings', () => {
    const text = renderMarkdown(report())
    expect(text).toContain('dsh 0.1.0-rc.6')
    expect(text).toContain('### web')
    expect(text).toContain('critical: 1 · warning: 1 · info: 1')
    expect(text).toContain('dsh-plugin-x')
    expect(text).toContain('[warning]')
    expect(text).toContain('`details: true`')
  })

  it('renders an empty report', () => {
    const text = renderMarkdown({ ...report(), profiles: [] })
    expect(text).toContain('没有可体检的 profile')
  })

  it('renders a profile without resolved plugins', () => {
    const empty = report()
    empty.profiles[0]!.plugins = []
    expect(renderMarkdown(empty)).toContain('（无已解析插件）')
  })

  it('marks clean plugins as healthy', () => {
    const clean = report()
    clean.profiles[0]!.plugins[0]!.findings = []
    expect(renderMarkdown(clean)).toContain('健康')
  })
})
