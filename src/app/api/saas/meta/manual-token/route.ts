import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { saveWorkspaceMetaConnection } from '@/lib/server/meta-connection'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const accessToken = String(body.accessToken || body.token || '').trim()

    if (!accessToken) {
      return NextResponse.json({ error: 'Informe o código/API token da Meta.' }, { status: 400 })
    }

    const payload = await verifyLocalAccessToken(token)
    const workspaceId = String(payload.tenant_id || '')
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace não encontrado na sessão.' }, { status: 401 })
    }

    await saveWorkspaceMetaConnection(createAdminClient(), workspaceId, {
      accessToken,
      tokenType: 'Bearer',
      scope: 'manual',
      expiryDate: null,
      metaUserId: '',
      metaUserName: 'Token/API manual',
    })

    return NextResponse.json({ ok: true, mode: 'manual' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível salvar o token da Meta.' },
      { status: 500 }
    )
  }
}
