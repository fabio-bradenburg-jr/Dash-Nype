import { NextResponse } from 'next/server'
import {
  deleteWorkspaceMetaConnection,
  getAuthorizedMetaConnectionContext,
  getPlatformMetaConnectionContext,
  getWorkspaceMetaConnection,
  isMissingRelationError,
  mapMetaConnection,
} from '@/lib/server/meta-connection'

export async function GET() {
  try {
    let context = null
    try {
      context = await getPlatformMetaConnectionContext()
    } catch {
      context = await getAuthorizedMetaConnectionContext()
    }

    const { adminSupabase, accessContext } = context
    const connection = await getWorkspaceMetaConnection(adminSupabase, accessContext.workspaceId)

    return NextResponse.json({
      connection: mapMetaConnection(connection),
    })
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({
        connection: mapMetaConnection(null),
        setupRequired: true,
        error: 'A tabela da conexão da Meta ainda não foi criada no Supabase. Aplique a migration para liberar essa integração.',
      })
    }

    return NextResponse.json({ error: error.message || 'Não foi possível carregar a conexão da Meta.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    let context = null
    try {
      context = await getPlatformMetaConnectionContext()
    } catch {
      context = await getAuthorizedMetaConnectionContext({ requireEdit: true })
    }

    const { adminSupabase, accessContext } = context
    if (!accessContext.canEditIntegrations) {
      return NextResponse.json({ error: 'Sem permissão para desconectar a Meta.' }, { status: 403 })
    }

    await deleteWorkspaceMetaConnection(adminSupabase, accessContext.workspaceId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível desconectar a Meta.' }, { status: 500 })
  }
}
