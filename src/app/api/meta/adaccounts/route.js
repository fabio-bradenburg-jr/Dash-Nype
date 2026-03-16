import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

function getMetaToken(request) {
  const headerToken = request.headers.get('x-meta-access-token')
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return headerToken || bearerToken || process.env.META_ACCESS_TOKEN
}

export async function GET(request) {
  try {
    const token = getMetaToken(request)
    
    if (!token) {
      return NextResponse.json({ error: 'Informe uma chave da API da Meta para listar as contas de anúncio.' }, { status: 400 })
    }

    const data = await fetchMetaJson(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=100&access_token=${token}`,
      'A Meta demorou para responder ao listar as contas de anúncio. Tente novamente em alguns instantes.'
    )
      
    // Format response to a clean array
    const accounts = data.data.map(acc => ({
      id: acc.account_id,
      name: acc.name || `Ad Account ${acc.account_id}`
    }))

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json({ error: normalizeMetaError(error, 'A Meta demorou para responder ao listar as contas de anúncio. Tente novamente em alguns instantes.') }, { status: 500 })
  }
}
