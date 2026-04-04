import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { requirePlatformRouteAccess } from '@/lib/server/platform-auth'

const allowedStatuses = ['ACTIVE', 'ONBOARDING', 'PAUSED', 'AT_RISK', 'CHURNED']

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const accessResult = await requirePlatformRouteAccess({ requireManageClients: true })
    if ('error' in accessResult) {
      return NextResponse.json({ error: accessResult.error }, { status: accessResult.status })
    }

    const { clientId } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) updates.name = String(body.name || '').trim()
    if (body.companyName !== undefined) updates.companyName = String(body.companyName || '').trim()
    if (body.ownerName !== undefined) updates.ownerName = String(body.ownerName || '').trim()
    if (body.ownerEmail !== undefined) updates.ownerEmail = String(body.ownerEmail || '').trim() || null
    if (body.cnpj !== undefined) updates.cnpj = String(body.cnpj || '').trim() || null
    if (body.status !== undefined) updates.status = allowedStatuses.includes(body.status) ? body.status : 'ONBOARDING'
    if (body.manuallyFlaggedAtRisk !== undefined) updates.manuallyFlaggedAtRisk = Boolean(body.manuallyFlaggedAtRisk)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração enviada.' }, { status: 400 })
    }

    if (typeof updates.name === 'string' && !updates.name) {
      return NextResponse.json({ error: 'Nome do cliente é obrigatório.' }, { status: 400 })
    }

    if (typeof updates.companyName === 'string' && !updates.companyName) {
      return NextResponse.json({ error: 'Empresa é obrigatória.' }, { status: 400 })
    }

    if (typeof updates.ownerName === 'string' && !updates.ownerName) {
      return NextResponse.json({ error: 'Responsável é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('Client')
      .update(updates)
      .eq('id', clientId)
      .select('id, name, companyName, ownerName, ownerEmail, cnpj, status, manuallyFlaggedAtRisk, updatedAt')
      .single()

    if (error) throw error

    return NextResponse.json({ client: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar o cliente.' }, { status: 500 })
  }
}
