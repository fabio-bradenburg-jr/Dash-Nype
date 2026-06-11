import type { ThemeMode, ThemeSettings } from '@/lib/saas/types'

export const LP_DARK_THEME = {
  mode: 'dark',
  primaryColor: '#e53935',
  accentColor: '#ef5350',
  backgroundColor: '#070908',
  panelColor: '#121817',
  textColor: '#f1f1f1',
  buttonTextColor: '#06110c',
  darkMode: true,
} satisfies ThemeSettings

export const LP_LIGHT_THEME = {
  mode: 'light',
  primaryColor: '#006c44',
  accentColor: '#26c281',
  backgroundColor: '#f7faf8',
  panelColor: '#ffffff',
  textColor: '#17201c',
  buttonTextColor: '#ffffff',
  darkMode: false,
} satisfies ThemeSettings

export const LEGACY_THEME_PRESETS = [
  {
    key: 'blue',
    label: 'Azul',
    primaryColor: '#3b82f6',
    accentColor: '#38bdf8',
    backgroundColor: '#020617',
    buttonTextColor: '#ffffff',
    darkMode: true,
  },
  {
    key: 'emerald',
    label: 'Assessoria LP',
    primaryColor: LP_DARK_THEME.primaryColor,
    accentColor: LP_DARK_THEME.accentColor,
    backgroundColor: LP_DARK_THEME.backgroundColor,
    buttonTextColor: LP_DARK_THEME.buttonTextColor,
    darkMode: true,
  },
  {
    key: 'orange',
    label: 'Laranja',
    primaryColor: '#f59e0b',
    accentColor: '#fb7185',
    backgroundColor: '#020617',
    buttonTextColor: '#ffffff',
    darkMode: true,
  },
  {
    key: 'rose',
    label: 'Rosa',
    primaryColor: '#f43f5e',
    accentColor: '#fb7185',
    backgroundColor: '#020617',
    buttonTextColor: '#ffffff',
    darkMode: true,
  },
  {
    key: 'slate',
    label: 'Ciano',
    primaryColor: '#38bdf8',
    accentColor: '#60a5fa',
    backgroundColor: '#020617',
    buttonTextColor: '#ffffff',
    darkMode: true,
  },
] as const

export function getThemeMode(theme: Partial<ThemeSettings>): ThemeMode {
  if (theme.mode === 'custom') return 'custom'
  if (theme.mode === 'light' || theme.darkMode === false) return 'light'
  return 'dark'
}

export function applyThemeMode(theme: ThemeSettings, mode: ThemeMode): ThemeSettings {
  if (mode === 'custom') {
    return {
      ...LP_DARK_THEME,
      ...theme,
      mode,
    }
  }

  return {
    ...theme,
    ...(mode === 'light' ? LP_LIGHT_THEME : LP_DARK_THEME),
  }
}

export function applyThemeVariables(root: HTMLElement, theme: ThemeSettings) {
  const resolved = applyThemeMode(theme, getThemeMode(theme))
  const panelColor = resolved.panelColor || (resolved.darkMode ? '#121817' : '#ffffff')
  const textColor = resolved.textColor || (resolved.darkMode ? '#f1f1f1' : '#17201c')
  root.style.setProperty('--saas-primary', resolved.primaryColor)
  root.style.setProperty('--saas-accent', resolved.accentColor)
  root.style.setProperty('--saas-surface', resolved.backgroundColor)
  root.style.setProperty('--saas-page-bg', resolved.backgroundColor)
  root.style.setProperty('--saas-panel-bg', panelColor)
  root.style.setProperty('--saas-text', textColor)
  root.style.setProperty('--saas-button-text', resolved.buttonTextColor || '#ffffff')
  root.style.setProperty('--accent-blue', resolved.primaryColor)
  root.style.setProperty('--accent-orange', resolved.accentColor)
  root.style.setProperty('--main', resolved.primaryColor)
  root.style.setProperty('--accent', resolved.accentColor)
  root.dataset.uiMode = resolved.darkMode ? 'dark' : 'light'
  root.dataset.themeMode = getThemeMode(resolved)
}

export function findLegacyThemePreset(primaryColor: string) {
  const normalized = String(primaryColor || '').trim().toLowerCase()
  return LEGACY_THEME_PRESETS.find((preset) => preset.primaryColor.toLowerCase() === normalized) || null
}
