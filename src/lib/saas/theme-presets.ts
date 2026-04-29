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
    label: 'Esmeralda',
    primaryColor: '#10b981',
    accentColor: '#2dd4bf',
    backgroundColor: '#020617',
    buttonTextColor: '#ffffff',
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

export function findLegacyThemePreset(primaryColor: string) {
  const normalized = String(primaryColor || '').trim().toLowerCase()
  return LEGACY_THEME_PRESETS.find((preset) => preset.primaryColor.toLowerCase() === normalized) || null
}
