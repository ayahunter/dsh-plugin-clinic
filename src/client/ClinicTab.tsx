/**
 * The Clinic settings tab: fetches the Host's ClinicReport and renders a
 * severity summary plus per-profile plugin cards. Pure presentation — data
 * arrives through the injected URLs and the PropsLocale t() helper; the
 * component owns local loading/error/expanded state only. Inline styles:
 * v1 intentionally avoids a CSS-modules build pipeline.
 * @module dsh-plugin-clinic/client/tab
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from './slot-types.ts'
import type { ClinicReport, Finding, PluginReport, ProfileReport, Severity } from '../types.ts'

/** Values the browser apply closure injects into this component. */
export interface ClinicTabInjected {
  summaryUrl: string
  detailUrl: string
}

/** Full component props assembled by the Settings slot renderer. */
export type ClinicTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.clinic'>
  & InjectFace<ClinicTabInjected>

const SEVERITY_STYLES: Record<Severity, { color: string; background: string }> = {
  critical: { color: '#b42318', background: '#fef3f2' },
  warning: { color: '#b54708', background: '#fffaeb' },
  info: { color: '#175cd3', background: '#eff8ff' },
}

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'warning', 'info']

/** Highest severity of a plugin's findings, or 'info' for a clean bill. */
function highestSeverity(findings: readonly Finding[]): Severity {
  for (const severity of SEVERITY_ORDER) {
    if (findings.some((finding) => finding.severity === severity)) return severity
  }
  return 'info'
}

/** Clinic dashboard tab component. */
export function ClinicTab({ t, summaryUrl, detailUrl }: ClinicTabProps) {
  const [report, setReport] = useState<ClinicReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summaryResponse, detailResponse] = await Promise.all([fetch(summaryUrl), fetch(detailUrl)])
      if (!summaryResponse.ok || !detailResponse.ok) {
        throw new Error(`HTTP ${Math.max(summaryResponse.status, detailResponse.status)}`)
      }
      const detail = (await detailResponse.json()) as ClinicReport
      setReport(detail)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [summaryUrl, detailUrl])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 }
    for (const profile of report?.profiles ?? []) {
      counts.critical += profile.summary.critical
      counts.warning += profile.summary.warning
      counts.info += profile.summary.info
    }
    return counts
  }, [report])

  const toggle = (key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return <div style={styles.notice}>{t('loading')}</div>
  }
  if (error !== null) {
    return (
      <div style={styles.notice}>
        <span>{t('loadFailed')}（{error}）</span>
        <button style={styles.button} onClick={() => void load()}>{t('retry')}</button>
      </div>
    )
  }
  if (report === null || report.profiles.length === 0) {
    return <div style={styles.notice}>{t('empty')}</div>
  }

  return (
    <div>
      <div style={styles.summaryBar}>
        <span style={styles.summaryItem}>{t('critical')} <strong style={{ color: SEVERITY_STYLES.critical.color }}>{totals.critical}</strong></span>
        <span style={styles.summaryItem}>{t('warning')} <strong style={{ color: SEVERITY_STYLES.warning.color }}>{totals.warning}</strong></span>
        <span style={styles.summaryItem}>{t('info')} <strong style={{ color: SEVERITY_STYLES.info.color }}>{totals.info}</strong></span>
      </div>
      {report.profiles.map((profile) => (
        <ProfileSection key={profile.profile} t={t} profile={profile} expanded={expanded} onToggle={toggle} />
      ))}
    </div>
  )
}

/** One profile: header line plus its plugin cards. */
function ProfileSection({ t, profile, expanded, onToggle }: {
  t: ClinicTabProps['t']
  profile: ProfileReport
  expanded: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <section style={styles.profileSection}>
      <h4 style={styles.profileHeader}>{t('profile')}: {profile.profile}</h4>
      {profile.plugins.length === 0
        ? <div style={styles.notice}>{t('noPlugins')}</div>
        : profile.plugins.map((plugin) => (
          <PluginCard key={plugin.plugin} t={t} plugin={plugin} expanded={expanded.has(plugin.plugin)} onToggle={() => onToggle(plugin.plugin)} />
        ))}
    </section>
  )
}

/** One plugin card: severity-colored status line, expandable findings. */
function PluginCard({ t, plugin, expanded, onToggle }: {
  t: ClinicTabProps['t']
  plugin: PluginReport
  expanded: boolean
  onToggle: () => void
}) {
  const severity = highestSeverity(plugin.findings)
  const style = SEVERITY_STYLES[severity]
  return (
    <div style={{ ...styles.card, borderLeftColor: style.color }}>
      <button style={styles.cardHeader} onClick={onToggle}>
        <span style={styles.pluginName}>{plugin.plugin}</span>
        <span style={styles.pluginMeta}>
          {plugin.version ?? '?'} · {t('source')}: {plugin.source}
          {plugin.findings.length > 0
            ? <span style={{ color: style.color }}>{plugin.findings.length} {t('findings')}</span>
            : <span>{t('healthy')}</span>}
        </span>
      </button>
      {expanded && (
        <ul style={styles.findings}>
          {plugin.findings.length === 0
            ? <li style={styles.findingRow}>{t('healthy')}</li>
            : plugin.findings.map((finding, index) => (
              <li key={`${finding.checkId}-${index}`} style={styles.findingRow}>
                <span style={{ ...styles.severityTag, ...SEVERITY_STYLES[finding.severity] }}>{t(finding.severity)}</span>
                <span>{finding.message}</span>
                {finding.evidence !== undefined && <div style={styles.evidence}>{finding.evidence}</div>}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  notice: { padding: '12px 0', color: '#667085', display: 'flex', gap: '12px', alignItems: 'center' },
  button: { padding: '4px 12px', cursor: 'pointer' },
  summaryBar: { display: 'flex', gap: '24px', padding: '12px 0', borderBottom: '1px solid #eaecf0' },
  summaryItem: { fontSize: '14px' },
  profileSection: { padding: '12px 0' },
  profileHeader: { margin: '8px 0', fontSize: '15px' },
  card: { borderLeft: '3px solid #d0d5dd', background: '#ffffff', borderTop: '1px solid #eaecf0', borderRight: '1px solid #eaecf0', borderBottom: '1px solid #eaecf0', marginBottom: '8px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
  pluginName: { fontWeight: 600, fontSize: '14px' },
  pluginMeta: { display: 'flex', gap: '12px', fontSize: '12px', color: '#667085' },
  findings: { listStyle: 'none', margin: 0, padding: '0 12px 10px 12px' },
  findingRow: { padding: '6px 0', fontSize: '13px', borderTop: '1px solid #f2f4f7' },
  severityTag: { display: 'inline-block', padding: '1px 8px', borderRadius: '999px', fontSize: '11px', marginRight: '8px' },
  evidence: { marginTop: '4px', fontSize: '12px', color: '#667085', wordBreak: 'break-all' },
}
