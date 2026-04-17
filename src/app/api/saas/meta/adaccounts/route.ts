import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getWorkspaceMetaConnection } from '@/lib/server/meta-connection'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

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
    const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
    let accessToken = ''
    let clientId = ''
    let source = 'none'

    if (token) {
      const payload = await verifyLocalAccessToken(token)
      const workspaceId = String(payload.tenant_id || '')
      if (workspaceId) {
        const connection = await getWorkspaceMetaConnection(createAdminClient(), workspaceId)
        accessToken = String(connection?.access_token || '')
        source = connection ? 'workspace' : 'none'
      }
    }

    const pending = parseCookie((await cookies()).get(META_SAAS_PENDING_COOKIE)?.value)
    if (!accessToken && pending?.accessToken) {
      accessToken = pending.accessToken
      clientId = pending.clientId || ''
      source = 'pending'
    }

    if (!accessToken && process.env.META_ACCESS_TOKEN) {
      accessToken = process.env.META_ACCESS_TOKEN
      source = 'env'
    }

    if (!accessToken) {
      return NextResponse.json({ accounts: [], connected: false, source })
    }

    const data = await fetchMetaJson(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=100&access_token=${accessToken}`,
      'A Meta demorou para responder ao listar as contas de anúncio. Tente novamente em alguns instantes.'
    )

    const accounts = (data.data || []).map((account: { account_id: string; name?: string }) => ({
      id: account.account_id,
      name: account.name || `Conta ${account.account_id}`,
      clientId,
    }))

    return NextResponse.json({ accounts, connected: true, source })
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
