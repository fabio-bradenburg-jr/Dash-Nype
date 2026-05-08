import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import {
  createLocalAccessToken,
  ensurePlatformUserForSupabase,
  hasLocalDatabaseConfig,
  registerWithLocalDatabase,
} from '@/lib/server/platform-auth-fallback'
import { isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'

const API_URL = getPlatformApiUrl()


async function ensureSupabaseProfileForRegistration(input: {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }
  fullName: string
  companyName: string
}) {
  const [{ createAdminClient }, { AI_ACCESS_LEVELS }] = await Promise.all([
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
  ])
  const adminSupabase = createAdminClient()
  const email = String(input.user.email || '').trim().toLowerCase()
  const isPrimaryAdmin = isPrimaryAdminEmail(email)

  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', input.user.id)
    .maybeSingle()

  if (existingProfileError) throw existingProfileError
  if (existingProfile?.workspace_id) return existingProfile

  const { data: firstWorkspace, error: firstWorkspaceError } = await adminSupabase
    .from('workspaces')
    .select('id, owner_user_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstWorkspaceError) throw firstWorkspaceError

  let workspaceId = firstWorkspace?.id || null

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
  } else if (isPrimaryAdmin && !firstWorkspace?.owner_user_id) {
    const { error: ownerError } = await adminSupabase
      .from('workspaces')
      .update({ owner_user_id: input.user.id })
      .eq('id', workspaceId)

    if (ownerError) throw ownerError
  }

  const role = isPrimaryAdmin ? USER_ROLES.MASTER : USER_ROLES.VIEWER
  const profilePayload = {
    id: input.user.id,
    email,
    full_name: input.fullName || String(input.user.user_metadata?.full_name || input.user.email || '').trim(),
    avatar_url: String(input.user.user_metadata?.avatar_url || ''),
    role,
    ai_access_level: isPrimaryAdmin ? AI_ACCESS_LEVELS.MASTER : AI_ACCESS_LEVELS.NONE,
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
}) {
  const { createClient } = await import('@/lib/supabase/server')

  const supabase = await createClient()
  const fullName = String(body.full_name || '').trim()
  const companyName = String(body.company_name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const role = isPrimaryAdminEmail(email) ? USER_ROLES.MASTER : USER_ROLES.VIEWER
  const { data, error } = await supabase.auth.signUp({
    email,
    password: String(body.password || '').trim(),
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
      },
    },
  })

  if (error || !data.user) {
    throw new Error(error?.message || 'Não foi possível criar a conta no login antigo.')
  }

  const profile = await ensureSupabaseProfileForRegistration({
    user: data.user,
    fullName,
    companyName,
  })

  // O Supabase antigo pode exigir confirmação de e-mail e não devolver session.
  // Para este app, a sessão principal é o cookie da plataforma, então criamos o acesso local imediatamente.
  const platformUser = await ensurePlatformUserForSupabase({
    user_id: data.user.id,
    tenant_id: profile?.workspace_id || data.user.id,
    tenant_name: companyName || 'Workspace principal',
    email: data.user.email || body.email || '',
    full_name: profile?.full_name || fullName || data.user.user_metadata?.full_name || data.user.email || '',
    role: profile?.role || role,
  })
  const token = await createLocalAccessToken({
    sub: platformUser.user_id,
    tenant_id: platformUser.tenant_id,
    role: platformUser.role,
    email: data.user.email || body.email || '',
    full_name: profile?.full_name || fullName || data.user.user_metadata?.full_name || data.user.email || '',
    provider: 'supabase',
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
  } catch {
    // Se o cadastro antigo não estiver disponível, seguimos para o backend novo.
  }

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || 'Não foi possível criar a conta.' },
        { status: response.status }
      )
    }

    const nextResponse = NextResponse.json({ ok: true })
    nextResponse.cookies.set({
      name: PLATFORM_AUTH_COOKIE,
      value: data.access_token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return nextResponse
  } catch {
    if (!hasLocalDatabaseConfig()) {
      return NextResponse.json(
        {
          error:
            'O cadastro não está disponível neste ambiente agora. Configure `PLATFORM_BACKEND_URL` para o backend do SaaS ou `DATABASE_URL` para o fallback local.',
        },
        { status: 500 }
      )
    }

    try {
      const token = await registerWithLocalDatabase(body)
      const nextResponse = NextResponse.json({ ok: true, fallback: true })
      nextResponse.cookies.set({
        name: PLATFORM_AUTH_COOKIE,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 12,
      })
      return nextResponse
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error && fallbackError.message === 'DATABASE_URL não configurada'
          ? 'O cadastro não está disponível neste ambiente agora. Falta configurar a conexão com o banco.'
          : fallbackError instanceof Error
            ? fallbackError.message
            : 'Não foi possível criar a conta.'

      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
