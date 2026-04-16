import { createAdminClient } from '@/lib/server/supabase-admin'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

export type SaasAiSettings = {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

export type PublicSaasAiSettings = {
  provider: string
  baseUrl: string
  model: string
  configured: boolean
  hasStoredKey: boolean
  source: 'supabase' | 'env'
}

const DEFAULT_SETTINGS: SaasAiSettings = {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',
  baseUrl: process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
}

function normalizeSettings(input: Record<string, unknown> | null | undefined): SaasAiSettings {
  return {
    provider: String(input?.provider || DEFAULT_SETTINGS.provider),
    apiKey: String(input?.apiKey || input?.api_key || DEFAULT_SETTINGS.apiKey),
    baseUrl: String(input?.baseUrl || input?.base_url || DEFAULT_SETTINGS.baseUrl),
    model: String(input?.model || DEFAULT_SETTINGS.model),
  }
}

function publicSettings(settings: SaasAiSettings, source: PublicSaasAiSettings['source']): PublicSaasAiSettings {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    configured: Boolean(settings.apiKey),
    hasStoredKey: Boolean(settings.apiKey),
    source,
  }
}

export async function getTenantIdFromPlatformToken(token: string) {
  const payload = await verifyLocalAccessToken(token)
  return String(payload.tenant_id || '')
}

export async function resolveSaasAiSettings(token?: string | null): Promise<SaasAiSettings> {
  if (!token) return DEFAULT_SETTINGS

  try {
    const tenantId = await getTenantIdFromPlatformToken(token)
    if (!tenantId || tenantId === 'tenant-demo') return DEFAULT_SETTINGS

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('workspace_preferences')
      .select('payload')
      .eq('workspace_id', tenantId)
      .maybeSingle()

    if (error) throw error

    const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
    const aiIntegration = (payload as Record<string, unknown>).aiIntegration
    if (!aiIntegration || typeof aiIntegration !== 'object') return DEFAULT_SETTINGS

    return normalizeSettings(aiIntegration as Record<string, unknown>)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function getPublicSaasAiSettings(token?: string | null): Promise<PublicSaasAiSettings> {
  if (!token) return publicSettings(DEFAULT_SETTINGS, 'env')

  try {
    const tenantId = await getTenantIdFromPlatformToken(token)
    if (!tenantId || tenantId === 'tenant-demo') return publicSettings(DEFAULT_SETTINGS, 'env')

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('workspace_preferences')
      .select('payload')
      .eq('workspace_id', tenantId)
      .maybeSingle()

    if (error) throw error

    const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
    const aiIntegration = (payload as Record<string, unknown>).aiIntegration
    if (!aiIntegration || typeof aiIntegration !== 'object') return publicSettings(DEFAULT_SETTINGS, 'env')

    return publicSettings(normalizeSettings(aiIntegration as Record<string, unknown>), 'supabase')
  } catch {
    return publicSettings(DEFAULT_SETTINGS, 'env')
  }
}

export async function saveSaasAiSettings(token: string, settings: SaasAiSettings) {
  const tenantId = await getTenantIdFromPlatformToken(token)
  if (!tenantId || tenantId === 'tenant-demo') {
    throw new Error('Faça login em uma conta real para salvar a integração da IA.')
  }

  const supabase = createAdminClient()
  const { data: currentRow, error: currentError } = await supabase
    .from('workspace_preferences')
    .select('theme_color, metric_1, metric_2, payload')
    .eq('workspace_id', tenantId)
    .maybeSingle()

  if (currentError) throw currentError

  const currentPayload = currentRow?.payload && typeof currentRow.payload === 'object' ? currentRow.payload : {}
  const currentAiIntegration = (currentPayload as Record<string, unknown>).aiIntegration
  const currentSettings =
    currentAiIntegration && typeof currentAiIntegration === 'object'
      ? normalizeSettings(currentAiIntegration as Record<string, unknown>)
      : { ...DEFAULT_SETTINGS, apiKey: '' }
  const normalized = normalizeSettings({
    ...settings,
    apiKey: settings.apiKey || currentSettings.apiKey,
  })

  if (!normalized.apiKey) {
    throw new Error('Informe uma API key para ativar a integração da IA.')
  }

  const { error } = await supabase
    .from('workspace_preferences')
    .upsert(
      {
        workspace_id: tenantId,
        theme_color: currentRow?.theme_color || 'emerald',
        metric_1: currentRow?.metric_1 || 'spend',
        metric_2: currentRow?.metric_2 || 'roas',
        payload: {
          ...(currentPayload as Record<string, unknown>),
          aiIntegration: normalized,
        },
      },
      { onConflict: 'workspace_id' }
    )

  if (error) throw error

  return publicSettings(normalized, 'supabase')
}
