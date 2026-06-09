import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalAccessToken } from '@/lib/server/platform-auth-fallback'
import { USER_ROLES } from '@/lib/server/access-control'
import { getOwnerEmailForHost, resolveWorkspaceForHost } from '@/lib/server/domain-config'

function getSupabaseAuthConfig() {
  const missing: string[] = []

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY')
  }

  return { enabled: missing.length === 0, missing }
}

function formatMissingSupabaseConfig(missing: string[]) {
  return `O cadastro pelo Supabase não está disponível neste ambiente. Configure ${missing
    .map((item) => `\`${item}\``)
    .join(', ')} na Vercel e publique novamente.`
}

function getAuthErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500
  const message = error.message.toLowerCase()

  if (message.includes('already') || message.includes('registered') || message.includes('já')) return 409
  if (message.includes('password') || message.includes('senha')) return 400
  if (message.includes('email') || message.includes('invalid') || message.includes('validate')) return 400
  return 500
}

async function createSupabaseUserWithoutEmail(input: {
  email: string
  password: string
  fullName: string
  companyName: string
}) {
  const { createAdminClient } = await import('@/lib/server/supabase-admin')
  const adminSupabase = createAdminClient()
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '').trim()

  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      company_name: input.companyName,
    },
  })

  if (!error && data?.user) return data.user

  const message = String(error?.message || '').toLowerCase()
  if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
    throw new Error('Este e-mail já possui uma conta. Entre pelo login ou peça um convite para acessar outro workspace.')
  }

  throw new Error(error?.message || 'Não foi possível criar a conta no login antigo.')
}

async function ensureSupabaseProfileForRegistration(input: {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }
  fullName: string
  companyName: string
  host: string
}) {
  const [{ createAdminClient }, { AI_ACCESS_LEVELS }] = await Promise.all([
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
  ])
  const adminSupabase = createAdminClient()
  const email = String(input.user.email || '').trim().toLowerCase()

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', input.user.id)
    .maybeSingle()

  if (existingProfileError) throw existingProfileError
  if (existingProfile?.workspace_id) {
    throw new Error('Este e-mail já está vinculado a um workspace. Entre pelo login ou use outro e-mail.')
  }

  // Always assign to the workspace that belongs to this domain
  const { workspaceId, ownerEmail } = await resolveWorkspaceForHost(adminSupabase, input.host)
  if (!workspaceId) {
    throw new Error(
      ownerEmail
        ? `O workspace deste domínio ainda não foi configurado. Peça ao administrador (${ownerEmail}) para fazer o primeiro acesso.`
        : 'Domínio não autorizado para cadastro.'
    )
  }

  const role = USER_ROLES.OPERATOR
  const profilePayload = {
    id: input.user.id,
    email,
    full_name: input.fullName || String(input.user.user_metadata?.full_name || input.user.email || '').trim(),
    avatar_url: String(input.user.user_metadata?.avatar_url || ''),
    role,
    ai_access_level: AI_ACCESS_LEVELS.TEAM,
    can_edit_integrations: false,
    workspace_id: workspaceId,
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single()

  if (profileError) throw profileError

  return profile
}

async function registerWithLegacySupabase(body: {
  full_name?: string
  company_name?: string
  email: string
  password: string
  host: string
}) {
  const supabaseConfig = getSupabaseAuthConfig()
  if (!supabaseConfig.enabled) {
    throw new Error(formatMissingSupabaseConfig(supabaseConfig.missing))
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Falta configurar `SUPABASE_SERVICE_ROLE_KEY` no servidor para criar o perfil e liberar acessos do usuário.'
    )
  }

  // Block registration from unauthorized domains
  const ownerEmail = getOwnerEmailForHost(body.host)
  if (!ownerEmail) {
    throw new Error('Cadastro não permitido neste domínio.')
  }

  const fullName = String(body.full_name || '').trim()
  const companyName = String(body.company_name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()

  const user = await createSupabaseUserWithoutEmail({
    email,
    password: String(body.password || '').trim(),
    fullName,
    companyName,
  })

  const profile = await ensureSupabaseProfileForRegistration({
    user,
    fullName,
    companyName,
    host: body.host,
  })

  const token = await createLocalAccessToken({
    sub: `supabase:${user.id}`,
    tenant_id: profile?.workspace_id || user.id,
    role: profile?.role || USER_ROLES.OPERATOR,
    email: user.email || body.email || '',
    full_name: profile?.full_name || fullName || user.user_metadata?.full_name || user.email || '',
    provider: 'supabase',
    can_edit_integrations: Boolean(profile?.can_edit_integrations),
  })

  return { token }
}

export async function POST(request: Request) {
  const body = await request.json()
  const host = request.headers.get('host') || ''

  try {
    const legacyResult = await registerWithLegacySupabase({ ...body, host })

    const nextResponse = NextResponse.json({ ok: true, provider: 'supabase' })
    nextResponse.cookies.set({
      name: PLATFORM_AUTH_COOKIE,
      value: legacyResult.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return nextResponse
  } catch (legacyError) {
    const message = legacyError instanceof Error ? legacyError.message : 'Não foi possível criar a conta.'
    return NextResponse.json({ error: message }, { status: getAuthErrorStatus(legacyError) })
  }
}
