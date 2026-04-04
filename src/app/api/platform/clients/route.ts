import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { requirePlatformRouteAccess } from '@/lib/server/platform-auth'

const DEFAULT_TENANT_SLUG = process.env.PLATFORM_TENANT_ID ?? 'agency-hub'

async function resolveTenantId() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('Tenant').select('id').eq('slug', DEFAULT_TENANT_SLUG).limit(1).maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('Tenant padrão não encontrado.')

  return data.id
}

export async function GET() {
  try {
    const accessResult = await requirePlatformRouteAccess()
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const supabase = createAdminClient()
    const tenantId = await resolveTenantId()
    const { data, error } = await supabase
      .from('Client')
      .select('id, name, companyName, ownerName, ownerEmail, status, createdAt')
      .eq('tenantId', tenantId)
      .order('updatedAt', { ascending: false })

    if (error) throw error

    return NextResponse.json({ clients: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível carregar clientes.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const accessResult = await requirePlatformRouteAccess({ requireManageClients: true })
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const supabase = createAdminClient()
    const tenantId = await resolveTenantId()
    const body = await request.json()

    const payload = {
      tenantId,
      name: String(body.name || '').trim(),
      companyName: String(body.companyName || '').trim(),
      ownerName: String(body.ownerName || '').trim(),
      ownerEmail: String(body.ownerEmail || '').trim() || null,
      cnpj: String(body.cnpj || '').trim() || null,
      status: ['ACTIVE', 'ONBOARDING', 'PAUSED', 'AT_RISK', 'CHURNED'].includes(body.status) ? body.status : 'ONBOARDING',
      goals: body.goals && typeof body.goals === 'object' ? body.goals : {},
      history: body.history && typeof body.history === 'object' ? body.history : {},
    }

    if (!payload.name || !payload.companyName || !payload.ownerName) {
      return NextResponse.json({ error: 'Nome, empresa e responsável são obrigatórios.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('Client')
      .insert(payload)
      .select('id, name, companyName, ownerName, ownerEmail, status, createdAt')
      .single()

    if (error) throw error

    return NextResponse.json({ client: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível criar o cliente.' }, { status: 500 })
  }
}
