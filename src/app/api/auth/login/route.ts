import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalAccessToken } from '@/lib/server/platform-auth-fallback'
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
  return `O login pelo Supabase não está disponível neste ambiente. Configure ${missing
    .map((item) => `\`${item}\``)
    .join(', ')} na Vercel e publique novamente.`
}

function getAuthErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500
  const message = error.message.toLowerCase()

  if (message.includes('invalid login credentials') || message.includes('credenciais')) return 401
  if (message.includes('email not confirmed') || message.includes('confirme')) return 403
  return 500
}

function isRecoverableLoginError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase()
  return (
    message.includes('tenant or user not found') ||
    message.includes('tenant/user') ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('database_url') ||
    message.includes('password authentication failed') ||
    message.includes('connection terminated') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('timeout') ||
    message.includes('fetch failed')
  )
}

async function loginWithLegacySupabase(body: { email: string; password: string; host: string }) {
  const supabaseConfig = getSupabaseAuthConfig()
  if (!supabaseConfig.enabled) {
    throw new Error(formatMissingSupabaseConfig(supabaseConfig.missing))
  }

  // Block login from unauthorized domains
  const ownerEmail = getOwnerEmailForHost(body.host)
  if (!ownerEmail) {
    throw new Error('Acesso não permitido neste domínio.')
  }

  const [{ createClient }, { createAdminClient }, { getAccessContext, isPrimaryAdminEmail }] = await Promise.all([
    import('@/lib/supabase/server'),
    import('@/lib/server/supabase-admin'),
    import('@/lib/server/access-control'),
  ])

  const supabase = await createClient()
  console.log('[login] supabaseUrl:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40))
  console.log('[login] hasAnonKey:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(body.email || '').trim(),
    password: String(body.password || '').trim(),
  }).catch((e: unknown) => {
    console.error('[login] signInWithPassword threw:', e)
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
  })

  if (error || !data?.user) {
    console.error('[login] auth error:', error)
    throw new Error((error as any)?.message || 'Credenciais inválidas.')
  }

  const email = String(data.user.email || body.email || '').trim().toLowerCase()
  const isPrimaryAdmin = isPrimaryAdminEmail(email)
  const fallbackAccessContext = {
    profile: {
      full_name: data.user.user_metadata?.full_name || data.user.email || 'Usuário',
      company_name: 'Assessoria LP',
    },
    workspaceId: data.user.id,
    role: isPrimaryAdmin ? 'master' : 'visualizador',
    canEditIntegrations: isPrimaryAdmin,
  }
  const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null
  let accessContext: any = fallbackAccessContext

  try {
    accessContext = await getAccessContext(supabase, data.user, adminSupabase ? { adminSupabase } : {})
  } catch (accessError) {
    if (!isRecoverableLoginError(accessError) && !adminSupabase) {
      throw new Error(
        'Login validado, mas falta configurar `SUPABASE_SERVICE_ROLE_KEY` no servidor para liberar o acesso deste usuário.'
      )
    }

    if (!isPrimaryAdmin) {
      throw accessError
    }
  }

  // Verify the user belongs to the workspace for this domain
  if (adminSupabase && accessContext.workspaceId) {
    const { workspaceId: domainWorkspaceId } = await resolveWorkspaceForHost(adminSupabase, body.host)
    if (domainWorkspaceId && accessContext.workspaceId !== domainWorkspaceId) {
      throw new Error('Este e-mail não tem acesso a este domínio. Verifique se está acessando pelo endereço correto.')
    }
  }

  return createLocalAccessToken({
    sub: `supabase:${data.user.id}`,
    tenant_id: accessContext.workspaceId || data.user.id,
    role: isPrimaryAdmin ? 'master' : String(accessContext.role || 'visualizador'),
    email: data.user.email || '',
    full_name: accessContext.profile?.full_name || data.user.user_metadata?.full_name || data.user.email || '',
    provider: 'supabase',
    can_edit_integrations: isPrimaryAdmin || Boolean(accessContext.canEditIntegrations),
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const host = request.headers.get('host') || ''

  try {
    const legacyToken = await loginWithLegacySupabase({ ...body, host })
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
  } catch (legacyError) {
    const message = legacyError instanceof Error ? legacyError.message : 'Não foi possível entrar.'
    return NextResponse.json({ error: message }, { status: getAuthErrorStatus(legacyError) })
  }
}
