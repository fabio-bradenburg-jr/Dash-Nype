import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const url = new URL(request.url)
    const nextPath = url.searchParams.get('next') || '/'
    const callbackUrl = new URL('/api/auth/facebook/callback', url.origin)
    callbackUrl.searchParams.set('next', nextPath)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    })

    if (error || !data.url) {
      throw new Error(error?.message || 'Não foi possível iniciar o login com Facebook.')
    }

    return NextResponse.redirect(data.url)
  } catch (error) {
    const fallback = new URL('/login', request.url)
    fallback.searchParams.set(
      'error',
      error instanceof Error ? error.message : 'Não foi possível iniciar o login com Facebook.'
    )
    return NextResponse.redirect(fallback)
  }
}
