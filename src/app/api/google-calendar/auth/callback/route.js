import { NextResponse } from 'next/server'
import {
  clearGoogleOauthCookie,
  exchangeGoogleAuthorizationCode,
  getAuthorizedGoogleCalendarContext,
  getGoogleOauthCookie,
  getGoogleProfile,
  getWorkspaceGoogleCalendarConnection,
  saveGoogleConnectionFromOAuth,
} from '@/lib/server/google-calendar'

export async function GET(request) {
  const redirectUrl = new URL('/calendar', request.url)

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const oauthCookie = await getGoogleOauthCookie()

    if (!code || !state || !oauthCookie?.state || oauthCookie.state !== state) {
      throw new Error('A confirmação do Google Calendar expirou. Tente conectar novamente.')
    }

    const { supabase, accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })

    if (oauthCookie.workspaceId && oauthCookie.workspaceId !== accessContext.workspaceId) {
      throw new Error('O workspace do retorno do Google Calendar não confere com a sessão atual.')
    }

    const existingConnection = await getWorkspaceGoogleCalendarConnection(supabase, accessContext.workspaceId)
    const tokenData = await exchangeGoogleAuthorizationCode(request, code)
    const googleProfile = await getGoogleProfile(tokenData.access_token)

    await saveGoogleConnectionFromOAuth({
      adminSupabase: supabase,
      workspaceId: accessContext.workspaceId,
      existingConnection,
      tokenData,
      googleProfile,
    })

    redirectUrl.pathname = oauthCookie.returnTo || '/calendar'
    redirectUrl.searchParams.set('google_calendar', 'connected')

    const response = NextResponse.redirect(redirectUrl)
    await clearGoogleOauthCookie(response)
    return response
  } catch (error) {
    redirectUrl.searchParams.set('google_calendar_error', error.message || 'Não foi possível concluir a conexão com o Google Calendar.')
    const response = NextResponse.redirect(redirectUrl)
    await clearGoogleOauthCookie(response)
    return response
  }
}
