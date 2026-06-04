import { NextResponse } from 'next/server'
import { listGoogleAdsAccounts } from '@/lib/server/google-ads'

export async function GET(request: Request) {
  try {
    const accounts = await listGoogleAdsAccounts(request)
    return NextResponse.json({ accounts, connected: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível listar as contas do Google Ads.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
