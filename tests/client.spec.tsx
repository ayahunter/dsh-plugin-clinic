// @vitest-environment jsdom
/**
 * Component tests for the Clinic tab: props-fed rendering of the summary
 * bar, plugin cards, expansion, error + retry, and the empty state.
 * @module dsh-plugin-clinic/tests/client
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClinicTab, type ClinicTabProps } from '../src/client/ClinicTab.tsx'
import { zh } from '../src/client/locales.ts'
import type { ClinicReport } from '../src/types.ts'

const t = (key: string): string => zh[key as keyof typeof zh] ?? key

function report(): ClinicReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-16T00:00:00.000Z',
    environment: { dshVersion: '0.1.0-rc.6', cordisVersion: '4.0.1', nodeVersion: 'v24', platform: 'test', dshHome: '/tmp' },
    profiles: [{
      profile: 'web',
      manifestPath: '/tmp/web/package.json',
      plugins: [
        {
          plugin: 'dsh-plugin-bad',
          version: '0.1.0',
          source: 'bundle',
          findings: [
            { checkId: 'bundle-manifest', severity: 'critical', message: 'Bundle "dsh-plugin-bad" is not resolvable', evidence: 'not resolvable' },
            { checkId: 'provenance', severity: 'info', message: 'bundle plugin "dsh-plugin-bad"' },
          ],
        },
        {
          plugin: 'dsh-plugin-good',
          version: '0.2.0',
          source: 'dependency',
          findings: [],
        },
      ],
      profileFindings: [],
      summary: { critical: 1, warning: 0, info: 1 },
      checks: [{ id: 'load-health', ran: true }],
    }],
  }
}

function props(overrides: Partial<ClinicTabProps> = {}): ClinicTabProps {
  return { t: t as ClinicTabProps['t'], summaryUrl: '/clinic/health/summary', detailUrl: '/clinic/health', ...overrides }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ClinicTab', () => {
  it('renders the summary bar and plugin cards from the fetched report', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(report()), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<ClinicTab {...props()} />)
    await waitFor(() => expect(screen.getByText(zh.critical)).toBeTruthy())
    expect(screen.getAllByText('1')).toHaveLength(2)
    expect(screen.getByText('dsh-plugin-bad')).toBeTruthy()
    expect(screen.getByText('dsh-plugin-good')).toBeTruthy()
    expect(screen.getByText(zh.healthy)).toBeTruthy()
  })

  it('expands a plugin card to show findings and evidence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(report()), { status: 200 })))
    render(<ClinicTab {...props()} />)
    const card = await screen.findByText('dsh-plugin-bad')
    fireEvent.click(card)
    expect(await screen.findByText(/Bundle "dsh-plugin-bad" is not resolvable/)).toBeTruthy()
    expect(screen.getByText('not resolvable')).toBeTruthy()
  })

  it('shows the error state and recovers on retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify(report()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ClinicTab {...props()} />)
    expect(await screen.findByText(new RegExp(zh.loadFailed))).toBeTruthy()
    fireEvent.click(screen.getByText(zh.retry))
    await waitFor(() => expect(screen.getByText('dsh-plugin-bad')).toBeTruthy())
  })

  it('renders the empty state for a report without profiles', async () => {
    const empty = report()
    empty.profiles = []
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(empty), { status: 200 })))
    render(<ClinicTab {...props()} />)
    expect(await screen.findByText(zh.empty)).toBeTruthy()
  })
})
