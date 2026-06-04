import { NextResponse } from 'next/server'
import {
  getAuthorizedGoogleAdsContext,
  getPlatformGoogleAdsContext,
  getWorkspaceGoogleAdsConnection,
  mapGoogleAdsConnection,
} from '@/lib/server/google-ads'

export async function GET() {
  try {
    let context = null
    try {
      context = await getPlatformGoogleAdsContext()
    } catch {
      context = await getAuthorizedGoogleAdsContext()
    }

    const connection = await getWorkspaceGoogleAdsConnection(context.adminSupabase, context.accessContext.workspaceId)
    return NextResponse.json({ connection: mapGoogleAdsConnection(connection) })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível carregar a conexão do Google Ads.' }, { status: 500 })
  }
}
