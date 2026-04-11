import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

const META_SAAS_PENDING_COOKIE = 'meta_saas_pending'

function parseCookie(value: string | undefined) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const pending = parseCookie((await cookies()).get(META_SAAS_PENDING_COOKIE)?.value)
    if (!pending?.accessToken) {
      return NextResponse.json({ accounts: [] })
    }

    const data = await fetchMetaJson(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=100&access_token=${pending.accessToken}`,
      'A Meta demorou para responder ao listar as contas de anúncio. Tente novamente em alguns instantes.'
    )

    const accounts = (data.data || []).map((account: { account_id: string; name?: string }) => ({
      id: account.account_id,
      name: account.name || `Conta ${account.account_id}`,
      clientId: pending.clientId,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    return NextResponse.json(
      {
        error: normalizeMetaError(
          error,
          'Não foi possível listar as contas de anúncio disponíveis na Meta.'
        ),
      },
      { status: 500 }
    )
  }
}
