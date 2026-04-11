import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()
const META_SAAS_PENDING_COOKIE = 'meta_saas_pending'

function parseCookie(value: string | undefined) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  const pending = parseCookie((await cookies()).get(META_SAAS_PENDING_COOKIE)?.value)

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  if (!pending?.accessToken) {
    return NextResponse.json({ error: 'A conexão da Meta expirou. Tente novamente.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const clientId = String(body.clientId || pending.clientId || '').trim()
    const accountId = String(body.accountId || '').trim()
    const accountName = String(body.accountName || '').trim()

    if (!clientId || !accountId) {
      return NextResponse.json({ error: 'Cliente e conta de anúncio são obrigatórios.' }, { status: 400 })
    }

    const response = await fetch(`${API_URL}/integrations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        provider: 'meta_ads',
        account_name: accountName || `Conta ${accountId}`,
        external_account_id: accountId,
        access_token: pending.accessToken,
      }),
      cache: 'no-store',
    })

    const data = await response.json()
    const nextResponse = NextResponse.json(data, { status: response.status })

    if (response.ok) {
      nextResponse.cookies.set({
        name: META_SAAS_PENDING_COOKIE,
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      })
    }

    return nextResponse
  } catch {
    return NextResponse.json({ error: 'Não foi possível vincular a conta da Meta.' }, { status: 500 })
  }
}
