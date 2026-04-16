import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPublicSaasAiSettings, saveSaasAiSettings } from '@/lib/server/saas-ai-settings'

export async function GET() {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const settings = await getPublicSaasAiSettings(token)
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const provider = String(body.provider || 'openai').trim()
    const baseUrl = String(body.baseUrl || '').trim()
    const model = String(body.model || '').trim()
    const apiKey = String(body.apiKey || '').trim()

    if (!provider || !baseUrl || !model) {
      return NextResponse.json({ error: 'Provider, Base URL e modelo são obrigatórios.' }, { status: 400 })
    }

    const settings = await saveSaasAiSettings(token, {
      provider,
      baseUrl,
      model,
      apiKey,
    })

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível salvar a integração da IA.' },
      { status: 500 }
    )
  }
}
