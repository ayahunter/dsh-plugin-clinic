/** Copy for the Clinic settings tab. @module dsh-plugin-clinic/client/locales */

export interface ClinicLocaleKey {
  tab: string
  loading: string
  loadFailed: string
  retry: string
  empty: string
  profile: string
  plugin: string
  healthy: string
  findings: string
  critical: string
  warning: string
  info: string
  noPlugins: string
  source: string
}

export const zh: ClinicLocaleKey = {
  tab: '体检',
  loading: '体检中…',
  loadFailed: '体检数据加载失败',
  retry: '重试',
  empty: '没有可体检的 profile',
  profile: 'Profile',
  plugin: '插件',
  healthy: '健康',
  findings: '条发现',
  critical: '严重',
  warning: '警告',
  info: '提示',
  noPlugins: '（无已解析插件）',
  source: '来源',
}

export const en: ClinicLocaleKey = {
  tab: 'Clinic',
  loading: 'Checking…',
  loadFailed: 'Failed to load clinic report',
  retry: 'Retry',
  empty: 'No profiles to diagnose',
  profile: 'Profile',
  plugin: 'Plugin',
  healthy: 'Healthy',
  findings: ' findings',
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  noPlugins: '(no resolved plugins)',
  source: 'Source',
}
