import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalAccessToken } from '@/lib/server/platform-auth-fallback'
import {
  isAssessoriaLpMemberEmail,
  isPrimaryAdminEmail,
  resolveAssessoriaLpWorkspaceId,
  USER_ROLES,
} from '@/lib/server/access-control'

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
}) {
  const [{ createAdminClient }, { AI_ACCESS_LEVELS }, { saveWorkspaceBranding }] = await Promise.all([
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
    import('@/lib/server/workspace-branding'),
  ])
  const adminSupabase = createAdminClient()
  const email = String(input.user.email || '').trim().toLowerCase()
  const isPrimaryAdmin = isPrimaryAdminEmail(email)
  const isAssessoriaMember = isAssessoriaLpMemberEmail(email)

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', input.user.id)
    .maybeSingle()

  if (existingProfileError) throw existingProfileError
  if (existingProfile?.workspace_id) {
    throw new Error('Este e-mail já está vinculado a um workspace. Entre pelo login ou use outro e-mail para criar uma nova empresa.')
  }

  let workspaceId = null

  if (isAssessoriaMember) {
    workspaceId = await resolveAssessoriaLpWorkspaceId(adminSupabase)
    if (!workspaceId) {
      throw new Error('Workspace da Assessoria LP não encontrado para vincular este usuário.')
    }
  } else if (isPrimaryAdmin) {
    const { data: firstWorkspace, error: firstWorkspaceError } = await adminSupabase
      .from('workspaces')
      .select('id, owner_user_id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstWorkspaceError) throw firstWorkspaceError
    workspaceId = firstWorkspace?.id || null

    if (workspaceId && !firstWorkspace?.owner_user_id) {
      const { error: ownerError } = await adminSupabase
        .from('workspaces')
        .update({ owner_user_id: input.user.id })
        .eq('id', workspaceId)

      if (ownerError) throw ownerError
    }
  }

  if (!workspaceId) {
    const { data: createdWorkspace, error: workspaceError } = await adminSupabase
      .from('workspaces')
      .insert({
        name: input.companyName || 'Workspace principal',
        owner_user_id: input.user.id,
      })
      .select('id')
      .single()

    if (workspaceError) throw workspaceError
    workspaceId = createdWorkspace.id
  }

  const role = isPrimaryAdmin ? USER_ROLES.MASTER : USER_ROLES.OPERATOR
  const profilePayload = {
    id: input.user.id,
    email,
    full_name: input.fullName || String(input.user.user_metadata?.full_name || input.user.email || '').trim(),
    avatar_url: String(input.user.user_metadata?.avatar_url || ''),
    role,
    ai_access_level: isPrimaryAdmin ? AI_ACCESS_LEVELS.MASTER : AI_ACCESS_LEVELS.TEAM,
    can_edit_integrations: true,
    workspace_id: workspaceId,
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single()

  if (profileError) throw profileError

  await saveWorkspaceBranding(
    adminSupabase,
    workspaceId,
    {
      appName: input.companyName || 'Novo workspace',
      companyName: input.companyName || 'Novo workspace',
      onboardingCompleted: false,
    },
    input.companyName || 'Novo workspace'
  )

  return profile
}

async function registerWithLegacySupabase(body: {
  full_name?: string
  company_name?: string
  email: string
  password: string
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

  const fullName = String(body.full_name || '').trim()
  const companyName = String(body.company_name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const role = isPrimaryAdminEmail(email) ? USER_ROLES.MASTER : USER_ROLES.OPERATOR
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
  })

  // O Supabase pode não devolver session no cadastro administrativo.
  // A sessão do app é o cookie local assinado, vinculado ao workspace atual.
  const token = await createLocalAccessToken({
    sub: `supabase:${user.id}`,
    tenant_id: profile?.workspace_id || user.id,
    role: profile?.role || role,
    email: user.email || body.email || '',
    full_name: profile?.full_name || fullName || user.user_metadata?.full_name || user.email || '',
    provider: 'supabase',
    can_edit_integrations: Boolean(profile?.can_edit_integrations) || isPrimaryAdminEmail(user.email || body.email || ''),
  })

  return { token }
}

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const legacyResult = await registerWithLegacySupabase(body)

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
