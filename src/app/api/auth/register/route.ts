import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { createLocalAccessToken, hasLocalDatabaseConfig, registerWithLocalDatabase } from '@/lib/server/platform-auth-fallback'

const API_URL = getPlatformApiUrl()

async function registerWithLegacySupabase(body: {
  full_name?: string
  company_name?: string
  email: string
  password: string
}) {
  const [{ createClient }, { createAdminClient }, { getAccessContext }] = await Promise.all([
    import('@/lib/supabase/server'),
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
  ])

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: String(body.email || '').trim(),
    password: String(body.password || '').trim(),
    options: {
      data: {
        full_name: String(body.full_name || '').trim(),
        company_name: String(body.company_name || '').trim(),
      },
    },
  })

  if (error || !data.user) {
    throw new Error(error?.message || 'Não foi possível criar a conta no login antigo.')
  }

  if (!data.session) {
    return {
      token: '',
      pendingConfirmation: true,
    }
  }

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, data.user, { adminSupabase })
  const token = await createLocalAccessToken({
    sub: `supabase:${data.user.id}`,
    tenant_id: accessContext.workspaceId || data.user.id,
    role: accessContext.role || 'operator',
    email: data.user.email || '',
    full_name: accessContext.profile?.full_name || data.user.user_metadata?.full_name || data.user.email || '',
    provider: 'supabase',
  })

  return {
    token,
    pendingConfirmation: false,
  }
}

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const legacyResult = await registerWithLegacySupabase(body)

    if (legacyResult.pendingConfirmation) {
      return NextResponse.json(
        { error: 'Conta criada no login antigo. Confirme seu e-mail antes de entrar.' },
        { status: 409 }
      )
    }

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
