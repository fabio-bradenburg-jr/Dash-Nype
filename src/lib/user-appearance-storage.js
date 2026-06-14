export const USER_APPEARANCE_KEY_PREFIX = 'nype-appearance-v2'

const LEGACY_GREEN_ACCENTS = ['#26c281', '#4fdf9b', '#006c44', '#0f766e', '#10b981', '#22c55e', '#16a34a', '#15803d', '#059669', '#34d399', '#6ee7b7']
const MIGRATED_FLAG = 'nype-color-migrated-v3'

function migrateGreenToRed(appearance) {
  if (!appearance) return appearance
  const accent = String(appearance.accent || '').toLowerCase()
  if (LEGACY_GREEN_ACCENTS.includes(accent)) {
    return { ...appearance, accent: DEFAULT_USER_APPEARANCE.accent }
  }
  return appearance
}

export const DEFAULT_USER_APPEARANCE = {
  mode: 'dark',
  accent: '#e53935',
  backgroundTint: '#070908',
  panelColor: '#121817',
  textColor: '#f1f1f1',
}

export const USER_APPEARANCE_PRESETS = [
  { label: 'Nype', value: '#e53935' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Laranja', value: '#f59e0b' },
  { label: 'Rosa', value: '#f43f5e' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Índigo', value: '#6366f1' },
]

function normalizeHexColor(value, fallback = DEFAULT_USER_APPEARANCE.accent) {
  const normalized = String(value || '').trim()
  return /^#([0-9a-f]{6})$/i.test(normalized)
    ? normalized.toLowerCase()
    : fallback
}

export function normalizeUserAppearance(appearance) {
  return {
    mode: ['light', 'dark', 'custom'].includes(appearance?.mode) ? appearance.mode : 'dark',
    accent: normalizeHexColor(appearance?.accent),
    backgroundTint: normalizeHexColor(appearance?.backgroundTint, DEFAULT_USER_APPEARANCE.backgroundTint),
    panelColor: normalizeHexColor(appearance?.panelColor, DEFAULT_USER_APPEARANCE.panelColor),
    textColor: normalizeHexColor(appearance?.textColor, DEFAULT_USER_APPEARANCE.textColor),
  }
}

function getStorageKey(userId) {
  return `${USER_APPEARANCE_KEY_PREFIX}:${userId}`
}

export function loadUserAppearance(userId) {
  if (typeof window === 'undefined' || !userId) {
    return DEFAULT_USER_APPEARANCE
  }

  try {
    const key = getStorageKey(userId)
    const raw = window.localStorage.getItem(key)
    if (!raw) return DEFAULT_USER_APPEARANCE

    const parsed = JSON.parse(raw)
    const migrated = migrateGreenToRed(parsed)

    // Persist migration so user keeps the red going forward
    if (migrated !== parsed && !window.localStorage.getItem(MIGRATED_FLAG)) {
      window.localStorage.setItem(key, JSON.stringify(migrated))
      window.localStorage.setItem(MIGRATED_FLAG, '1')
    }

    return normalizeUserAppearance(migrated)
  } catch (error) {
    console.error('Erro ao carregar aparência do usuário:', error)
    return DEFAULT_USER_APPEARANCE
  }
}

export function saveUserAppearance(userId, appearance) {
  if (typeof window === 'undefined' || !userId) return

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(normalizeUserAppearance(appearance)))
  } catch (error) {
    console.error('Erro ao salvar aparência do usuário:', error)
  }
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex).replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

export function applyUserAppearance(appearance) {
  if (typeof document === 'undefined') return

  const normalized = normalizeUserAppearance(migrateGreenToRed(appearance) ?? appearance)
  const applied = normalized.mode === 'light'
    ? { ...normalized, accent: '#e53935', backgroundTint: '#fff5f5', panelColor: '#ffffff', textColor: '#1a0a0a' }
    : normalized.mode === 'dark'
      ? { ...normalized, ...DEFAULT_USER_APPEARANCE }
      : { ...normalized, accent: LEGACY_GREEN_ACCENTS.includes(normalized.accent) ? DEFAULT_USER_APPEARANCE.accent : normalized.accent }
  const uiMode = normalized.mode === 'light' ? 'light' : 'dark'
  const { r, g, b } = hexToRgb(applied.accent)
  const backgroundRgb = hexToRgb(applied.backgroundTint)
  const root = document.documentElement

  root.dataset.uiMode = uiMode
  root.dataset.themeMode = normalized.mode
  root.style.setProperty('--accent-blue', applied.accent)
  root.style.setProperty('--saas-primary', applied.accent)
  root.style.setProperty('--saas-accent', applied.accent)
  root.style.setProperty('--saas-page-bg', applied.backgroundTint)
  root.style.setProperty('--saas-panel-bg', applied.panelColor)
  root.style.setProperty('--saas-text', applied.textColor)
  root.style.setProperty('--bg-dark', applied.backgroundTint)
  root.style.setProperty('--bg-panel', applied.panelColor)
  root.style.setProperty('--text-primary', applied.textColor)
  root.style.setProperty('--button-primary', applied.accent)
  root.style.setProperty('--button-primary-hover', `color-mix(in srgb, ${applied.accent} 86%, #0f172a 14%)`)
  root.style.setProperty('--button-primary-soft', `rgba(${r}, ${g}, ${b}, 0.14)`)
  root.style.setProperty('--button-primary-shadow', `rgba(${r}, ${g}, ${b}, 0.28)`)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--glow-blue', `rgba(${r}, ${g}, ${b}, 0.18)`)
  root.style.setProperty('--theme-surface', `rgba(${r}, ${g}, ${b}, 0.10)`)
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.12)`)
  root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.18)`)
  root.style.setProperty('--accent-strong', `rgba(${r}, ${g}, ${b}, 0.28)`)
  root.style.setProperty(
    '--app-bg-primary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${normalized.mode === 'light' ? '0.10' : '0.18'})`
  )
  root.style.setProperty(
    '--app-bg-secondary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${normalized.mode === 'light' ? '0.06' : '0.10'})`
  )
  root.style.setProperty(
    '--app-bg-tertiary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${normalized.mode === 'light' ? '0.04' : '0.06'})`
  )
  root.style.setProperty('--app-bg-rgb', `${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}`)
}
