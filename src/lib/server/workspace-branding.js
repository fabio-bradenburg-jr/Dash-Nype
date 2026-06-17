export const DEFAULT_WORKSPACE_BRANDING = {
  appName: 'Nype',
  appSubtitle: 'Performance Hub',
  companyName: 'Nype',
  logoUrl: '',
  mode: 'dark',
  primaryColor: '#e53935',
  accentColor: '#ef5350',
  backgroundColor: '#070908',
  panelColor: '#121817',
  textColor: '#F4F7F5',
  onboardingCompleted: false,
}

function stringValue(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function colorValue(value, fallback) {
  const normalized = stringValue(value)
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback
}

export function normalizeWorkspaceBranding(value = {}, workspaceName = '') {
  const source = value && typeof value === 'object' ? value : {}
  const companyName = stringValue(source.companyName, workspaceName || DEFAULT_WORKSPACE_BRANDING.companyName)
  const appName = stringValue(source.appName, companyName || DEFAULT_WORKSPACE_BRANDING.appName)

  return {
    ...DEFAULT_WORKSPACE_BRANDING,
    ...source,
    appName,
    appSubtitle: stringValue(source.appSubtitle, DEFAULT_WORKSPACE_BRANDING.appSubtitle),
    companyName,
    logoUrl: stringValue(source.logoUrl),
    mode: ['light', 'dark', 'custom'].includes(source.mode) ? source.mode : DEFAULT_WORKSPACE_BRANDING.mode,
    primaryColor: colorValue(source.primaryColor, DEFAULT_WORKSPACE_BRANDING.primaryColor),
    accentColor: colorValue(source.accentColor, DEFAULT_WORKSPACE_BRANDING.accentColor),
    backgroundColor: colorValue(source.backgroundColor, DEFAULT_WORKSPACE_BRANDING.backgroundColor),
    panelColor: colorValue(source.panelColor, DEFAULT_WORKSPACE_BRANDING.panelColor),
    textColor: colorValue(source.textColor, DEFAULT_WORKSPACE_BRANDING.textColor),
    onboardingCompleted: source.onboardingCompleted === true,
  }
}

export async function getWorkspacePreferencePayload(adminSupabase, workspaceId) {
  if (!adminSupabase || !workspaceId) return {}

  const { data, error } = await adminSupabase
    .from('workspace_preferences')
    .select('payload')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return data?.payload && typeof data.payload === 'object' ? data.payload : {}
}

export async function getWorkspaceBranding(adminSupabase, workspaceId, workspaceName = '') {
  const payload = await getWorkspacePreferencePayload(adminSupabase, workspaceId)
  return normalizeWorkspaceBranding(payload.workspaceBranding, workspaceName)
}

export async function saveWorkspaceBranding(adminSupabase, workspaceId, brandingPatch, workspaceName = '') {
  if (!adminSupabase || !workspaceId) {
    throw new Error('Workspace nao encontrado para salvar a marca.')
  }

  const payload = await getWorkspacePreferencePayload(adminSupabase, workspaceId)
  const nextBranding = normalizeWorkspaceBranding(
    {
      ...(payload.workspaceBranding || {}),
      ...(brandingPatch || {}),
    },
    workspaceName
  )

  const { error } = await adminSupabase
    .from('workspace_preferences')
    .upsert(
      {
        workspace_id: workspaceId,
        payload: {
          ...payload,
          workspaceBranding: nextBranding,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' }
    )

  if (error) throw error

  const nextWorkspaceName = stringValue(nextBranding.companyName || nextBranding.appName)
  if (nextWorkspaceName) {
    await adminSupabase
      .from('workspaces')
      .update({ name: nextWorkspaceName })
      .eq('id', workspaceId)
  }

  return nextBranding
}
