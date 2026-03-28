export const USER_APPEARANCE_KEY_PREFIX = 'nype-user-appearance'

export const DEFAULT_USER_APPEARANCE = {
  mode: 'dark',
  accent: '#3b82f6',
  backgroundTint: '#3b82f6',
}

export const USER_APPEARANCE_PRESETS = [
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Laranja', value: '#f59e0b' },
  { label: 'Rosa', value: '#f43f5e' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Índigo', value: '#6366f1' },
]

function normalizeHexColor(value) {
  const normalized = String(value || '').trim()
  return /^#([0-9a-f]{6})$/i.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_USER_APPEARANCE.accent
}

export function normalizeUserAppearance(appearance) {
  return {
    mode: appearance?.mode === 'light' ? 'light' : 'dark',
    accent: normalizeHexColor(appearance?.accent),
    backgroundTint: normalizeHexColor(appearance?.backgroundTint),
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
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) return DEFAULT_USER_APPEARANCE
    return normalizeUserAppearance(JSON.parse(raw))
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

  const normalized = normalizeUserAppearance(appearance)
  const { r, g, b } = hexToRgb(normalized.accent)
  const backgroundRgb = hexToRgb(normalized.backgroundTint)
  const root = document.documentElement
  const isLightMode = normalized.mode === 'light'

  root.dataset.uiMode = normalized.mode
  root.style.setProperty('--accent-blue', normalized.accent)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--glow-blue', `rgba(${r}, ${g}, ${b}, 0.18)`)
  root.style.setProperty('--theme-surface', `rgba(${r}, ${g}, ${b}, ${isLightMode ? '0.08' : '0.10'})`)
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${isLightMode ? '0.10' : '0.12'})`)
  root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, ${isLightMode ? '0.16' : '0.18'})`)
  root.style.setProperty('--accent-strong', `rgba(${r}, ${g}, ${b}, ${isLightMode ? '0.22' : '0.28'})`)
  root.style.setProperty(
    '--app-bg-primary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${isLightMode ? '0.10' : '0.18'})`
  )
  root.style.setProperty(
    '--app-bg-secondary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${isLightMode ? '0.06' : '0.10'})`
  )
  root.style.setProperty(
    '--app-bg-tertiary',
    `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${isLightMode ? '0.04' : '0.06'})`
  )
  root.style.setProperty('--app-bg-rgb', `${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}`)
}
