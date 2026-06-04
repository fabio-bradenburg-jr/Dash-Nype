import { NextResponse } from 'next/server'
import { listGoogleAdsAccounts } from '@/lib/server/google-ads'

export async function GET(request) {
  try {
    const accounts = await listGoogleAdsAccounts(request)
    return NextResponse.json({ accounts, connected: true })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível listar as contas do Google Ads.' }, { status: 500 })
  }
}
