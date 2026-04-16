import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalAccessToken, ensurePlatformUserForSupabase } from '@/lib/server/platform-auth-fallback'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const nextPath = url.searchParams.get('next') || '/'
  const loginUrl = new URL('/login', url.origin)

  try {
    const code = url.searchParams.get('code')
    if (!code) {
      throw new Error('O Facebook não retornou o código de autenticação.')
    }

    const [{ createClient }, { createAdminClient }, { getAccessContext }] = await Promise.all([
      import('@/lib/supabase/server'),
      import('@/lib/server/supabase-admin'),
      import('@/lib/server/access-control'),
    ])

    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) {
      throw new Error(error?.message || 'Não foi possível concluir o login com Facebook.')
    }

    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(supabase, data.user, { adminSupabase })
    const platformUser = await ensurePlatformUserForSupabase({
      user_id: data.user.id,
      tenant_id: accessContext.workspaceId || data.user.id,
      tenant_name: 'Workspace principal',
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
      provider: 'facebook',
    })

    const response = NextResponse.redirect(new URL(nextPath, url.origin))
    response.cookies.set({
      name: PLATFORM_AUTH_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return response
  } catch (error) {
    loginUrl.searchParams.set(
      'error',
      error instanceof Error ? error.message : 'Não foi possível concluir o login com Facebook.'
    )
    return NextResponse.redirect(loginUrl)
  }
}
