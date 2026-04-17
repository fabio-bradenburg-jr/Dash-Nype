import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalSaasIntegration } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getWorkspaceMetaConnection } from '@/lib/server/meta-connection'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

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

  let accessToken = String(pending?.accessToken || '')
  if (token) {
    const payload = await verifyLocalAccessToken(token)
    const workspaceId = String(payload.tenant_id || '')
    if (workspaceId) {
      const connection = await getWorkspaceMetaConnection(createAdminClient(), workspaceId)
      accessToken = String(connection?.access_token || accessToken)
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Conecte a Meta uma vez em Configurações antes de vincular contas aos clientes.' }, { status: 400 })
  }

  const body = await request.json()
  const clientId = String(body.clientId || pending.clientId || '').trim()
  const accountId = String(body.accountId || '').trim()
  const accountName = String(body.accountName || '').trim()

  if (!clientId || !accountId) {
    return NextResponse.json({ error: 'Cliente e conta de anúncio são obrigatórios.' }, { status: 400 })
  }

  try {
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
        access_token: accessToken,
      }),
      cache: 'no-store',
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    try {
      const integration = await createLocalSaasIntegration(token, {
        client_id: clientId,
        provider: 'meta_ads',
        account_name: accountName || `Conta ${accountId}`,
        external_account_id: accountId,
        access_token: accessToken,
      })
      return NextResponse.json(integration, { status: 201 })
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível vincular a conta da Meta.',
        },
        { status: 500 }
      )
    }
  }
}
