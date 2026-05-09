import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import {
  createLocalAccessToken,
  ensurePlatformUserForSupabase,
  hasLocalDatabaseConfig,
  loginWithLocalDatabase,
} from '@/lib/server/platform-auth-fallback'

const API_URL = getPlatformApiUrl()

async function loginWithLegacySupabase(body: { email: string; password: string }) {
  const [{ createClient }, { createAdminClient }, { getAccessContext }] = await Promise.all([
    import('@/lib/supabase/server'),
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
  ])

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(body.email || '').trim(),
    password: String(body.password || '').trim(),
  })

  if (error || !data.user) {
    throw new Error(error?.message || 'Credenciais inválidas.')
  }

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, data.user, { adminSupabase })
  const platformUser = await ensurePlatformUserForSupabase({
    user_id: data.user.id,
    tenant_id: accessContext.workspaceId || data.user.id,
    tenant_name: accessContext.profile?.workspace?.name || accessContext.profile?.company_name || 'Workspace principal',
    email: data.user.email || '',
    full_name: accessContext.profile?.full_name || data.user.user_metadata?.full_name || data.user.email || '',
    role: accessContext.role || 'operator',
  })
  const token = await createLocalAccessToken({
    sub: platformUser.user_id,
    tenant_id: platformUser.tenant_id,
    role: platformUser.role,
    email: data.user.email || '',
    full_name: accessContext.profile?.full_name || data.user.user_metadata?.full_name || data.user.email || '',
    provider: 'supabase',
    can_edit_integrations: accessContext.canEditIntegrations,
  })

  return token
}

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const legacyToken = await loginWithLegacySupabase(body)
    const nextResponse = NextResponse.json({ ok: true, provider: 'supabase' })
    nextResponse.cookies.set({
      name: PLATFORM_AUTH_COOKIE,
      value: legacyToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return nextResponse
  } catch {
    // Se o login antigo não estiver disponível, seguimos para o backend novo.
  }

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || 'Não foi possível entrar.' },
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
            'O login não está disponível neste ambiente agora. Configure `PLATFORM_BACKEND_URL` para o backend do SaaS ou `DATABASE_URL` para o fallback local.',
        },
        { status: 500 }
      )
    }

    try {
      const token = await loginWithLocalDatabase(body)
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
          ? 'O login não está disponível neste ambiente agora. Falta configurar a conexão com o banco.'
          : fallbackError instanceof Error
            ? fallbackError.message
            : 'Não foi possível entrar.'

      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
