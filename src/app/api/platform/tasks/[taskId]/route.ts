import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { requirePlatformRouteAccess } from '@/lib/server/platform-auth'

const allowedStatuses = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE']
const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

function normalizeDate(value: unknown) {
  if (value === undefined) return undefined
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const accessResult = await requirePlatformRouteAccess({ requireManageClients: true })
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const { taskId } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    const updates: Record<string, unknown> = {}

    if (body.title !== undefined) updates.title = String(body.title || '').trim()
    if (body.description !== undefined) updates.description = String(body.description || '').trim() || null
    if (body.status !== undefined) updates.status = allowedStatuses.includes(body.status) ? body.status : 'OPEN'
    if (body.priority !== undefined) updates.priority = allowedPriorities.includes(body.priority) ? body.priority : 'MEDIUM'
    if (body.clientId !== undefined) updates.clientId = body.clientId ? String(body.clientId) : null
    if (body.teamMemberId !== undefined) updates.teamMemberId = body.teamMemberId ? String(body.teamMemberId) : null
    if (body.dueDate !== undefined) updates.dueDate = normalizeDate(body.dueDate)
    if (body.estimatedHours !== undefined) {
      updates.estimatedHours = Number.isFinite(Number(body.estimatedHours)) && body.estimatedHours !== '' ? Number(body.estimatedHours) : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração enviada.' }, { status: 400 })
    }

    if (typeof updates.title === 'string' && !updates.title) {
      return NextResponse.json({ error: 'Título da tarefa é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('Task')
      .update(updates)
      .eq('id', taskId)
      .select('id, title, description, priority, status, dueDate, estimatedHours, clientId, teamMemberId, updatedAt')
      .single()

    if (error) throw error

    return NextResponse.json({ task: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar a tarefa.' }, { status: 500 })
  }
}
