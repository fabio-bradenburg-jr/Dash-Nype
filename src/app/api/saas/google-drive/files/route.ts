import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import {
  decryptDriveConnection,
  listGoogleDriveFiles,
  refreshGoogleDriveAccessToken,
  encryptDriveConnection,
} from '@/lib/server/google-drive-oauth'

const API_URL = getPlatformApiUrl()

export async function GET(request: Request) {
  const sessionToken = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!sessionToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const url = new URL(request.url)
  const clientId = String(url.searchParams.get('clientId') || '').trim()
  if (!clientId) {
    return NextResponse.json({ error: 'ClientId obrigatório.' }, { status: 400 })
  }

  try {
    const clientResponse = await fetch(`${API_URL}/clients/${clientId}`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    const client = await clientResponse.json()
    if (!clientResponse.ok) {
      return NextResponse.json(client, { status: clientResponse.status })
    }

    const encryptedConnection = String(client?.business_data?.google_drive_connection || '')
    const connection = decryptDriveConnection(encryptedConnection)
    if (!connection?.access_token) {
      return NextResponse.json({ error: 'Google Drive não conectado para este cliente.' }, { status: 400 })
    }

    const refreshedConnection = await refreshGoogleDriveAccessToken(request, connection)
    if (refreshedConnection.access_token !== connection.access_token || refreshedConnection.expiry_date !== connection.expiry_date) {
      await fetch(`${API_URL}/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_data: {
            ...(client.business_data || {}),
            google_drive_connection: encryptDriveConnection(refreshedConnection),
          },
        }),
        cache: 'no-store',
      })
    }

    const files = await listGoogleDriveFiles(refreshedConnection.access_token)
    return NextResponse.json({
      files: files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        modifiedTime: file.modifiedTime,
      })),
      googleAccount: client?.business_data?.google_drive_public || null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Não foi possível listar os arquivos do Google Drive.',
      },
      { status: 500 }
    )
  }
}
