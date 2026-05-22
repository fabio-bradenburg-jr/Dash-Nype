import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { requirePlatformRouteAccess } from '@/lib/server/platform-auth'

const DEFAULT_TENANT_SLUG = process.env.PLATFORM_TENANT_ID ?? 'agency-hub'
const allowedStatuses = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE']
const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

async function resolveTenantContext() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('Tenant').select('id').eq('slug', DEFAULT_TENANT_SLUG).limit(1).maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('Tenant padrão não encontrado.')

  return { supabase, tenantId: data.id }
}

function normalizeDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export async function GET() {
  try {
    const accessResult = await requirePlatformRouteAccess()
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const { supabase, tenantId } = await resolveTenantContext()
    const [tasksResponse, clientsResponse, teamMembersResponse] = await Promise.all([
      supabase
        .from('Task')
        .select('id, title, description, priority, status, dueDate, estimatedHours, clientId, teamMemberId, createdAt, updatedAt')
        .eq('tenantId', tenantId)
        .order('updatedAt', { ascending: false }),
      supabase.from('Client').select('id, name, companyName, status').eq('tenantId', tenantId).order('name', { ascending: true }),
      supabase.from('TeamMember').select('id, fullName, role').eq('tenantId', tenantId).order('fullName', { ascending: true }),
    ])

    if (tasksResponse.error) throw tasksResponse.error
    if (clientsResponse.error) throw clientsResponse.error
    if (teamMembersResponse.error) throw teamMembersResponse.error

    return NextResponse.json({
      tasks: tasksResponse.data ?? [],
      clients: clientsResponse.data ?? [],
      teamMembers: teamMembersResponse.data ?? [],
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível carregar tarefas.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const accessResult = await requirePlatformRouteAccess({ requireManageClients: true })
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const { supabase, tenantId } = await resolveTenantContext()
    const body = await request.json()

    const payload = {
      tenantId,
      clientId: body.clientId ? String(body.clientId) : null,
      teamMemberId: body.teamMemberId ? String(body.teamMemberId) : null,
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim() || null,
      status: allowedStatuses.includes(body.status) ? body.status : 'OPEN',
      priority: allowedPriorities.includes(body.priority) ? body.priority : 'MEDIUM',
      dueDate: normalizeDate(body.dueDate),
      estimatedHours: Number.isFinite(Number(body.estimatedHours)) && body.estimatedHours !== '' ? Number(body.estimatedHours) : null,
      spentHours: null,
    }

    if (!payload.title) {
      return NextResponse.json({ error: 'Título da tarefa é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('Task')
      .insert(payload)
      .select('id, title, description, priority, status, dueDate, estimatedHours, clientId, teamMemberId, createdAt')
      .single()

    if (error) throw error

    return NextResponse.json({ task: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível criar a tarefa.' }, { status: 500 })
  }
}
