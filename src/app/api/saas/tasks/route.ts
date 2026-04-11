import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const clientId = String(body.clientId || '').trim()
    if (!clientId) {
      return NextResponse.json({ error: 'ClientId obrigatório.' }, { status: 400 })
    }

    const response = await fetch(`${API_URL}/tasks/clients/${clientId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: body.title,
        description: body.description,
        due_date: body.due_date || null,
        assignee_id: body.assignee_id || null,
      }),
      cache: 'no-store',
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar a tarefa.' }, { status: 500 })
  }
}
