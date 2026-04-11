import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { integrationIds } = await request.json()
    if (!Array.isArray(integrationIds) || integrationIds.length === 0) {
      return NextResponse.json({ error: 'No integrations selected.' }, { status: 400 })
    }

    const results = await Promise.all(
      integrationIds.map(async (integrationId: string) => {
        const response = await fetch(`${API_URL}/integrations/${integrationId}/sync`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        return { integrationId, ok: response.ok }
      })
    )

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Unable to sync integrations.' }, { status: 500 })
  }
}
