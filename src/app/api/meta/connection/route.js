import { NextResponse } from 'next/server'
import {
  deleteWorkspaceMetaConnection,
  getAuthorizedMetaConnectionContext,
  getWorkspaceMetaConnection,
  isMissingRelationError,
  mapMetaConnection,
} from '@/lib/server/meta-connection'

export async function GET() {
  try {
    const { supabase, accessContext } = await getAuthorizedMetaConnectionContext()
    const connection = await getWorkspaceMetaConnection(supabase, accessContext.workspaceId)

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
    const { supabase, accessContext } = await getAuthorizedMetaConnectionContext({ requireEdit: true })
    await deleteWorkspaceMetaConnection(supabase, accessContext.workspaceId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível desconectar a Meta.' }, { status: 500 })
  }
}
