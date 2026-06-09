import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

const THRESHOLDS = [150, 100, 50, 0]
// How many hours to wait before re-alerting the same account+threshold
const COOLDOWN_HOURS = 12

function normalizeAdAccountId(value: string) {
  return String(value || '').replace(/^act_/, '').replace(/\D/g, '')
}

function normalizeCurrencyAmount(value: unknown, currency = 'BRL') {
  const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND'])
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return ZERO_DECIMAL.has(String(currency).toUpperCase()) ? num : num / 100
}

async function getMetaTokenForWorkspace(adminSupabase: any, workspaceId: string): Promise<string | null> {
  const { data } = await adminSupabase
    .from('workspace_meta_connections')
    .select('access_token')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.access_token || null
}

async function fetchBalance(token: string, adAccountId: string) {
  const fields = 'balance,currency,is_prepay_account,account_status'
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}?fields=${fields}&access_token=${encodeURIComponent(token)}`
  const account = await fetchMetaJson(url, 'Meta timeout ao buscar saldo.')
  const currency = account.currency || 'BRL'
  const isPrepay = account.is_prepay_account === true || account.is_prepay_account === 'true'
  const rawBalance = normalizeCurrencyAmount(account.balance, currency)
  // Only prepaid accounts have meaningful balance alerts
  return { balance: isPrepay ? rawBalance : null, currency, isPrepay }
}

async function wasAlertedRecently(
  adminSupabase: any,
  workspaceId: string,
  adAccountId: string,
  threshold: number
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
  const { data } = await adminSupabase
    .from('balance_alert_logs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('ad_account_id', adAccountId)
    .eq('threshold', threshold)
    .gte('alerted_at', since)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

async function recordAlert(
  adminSupabase: any,
  workspaceId: string,
  clientId: string,
  adAccountId: string,
  threshold: number,
  balance: number
) {
  await adminSupabase.from('balance_alert_logs').insert({
    workspace_id: workspaceId,
    client_id: clientId,
    ad_account_id: adAccountId,
    threshold,
    balance,
  })
}

export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret')
  const expectedSecret = process.env.BALANCE_ALERT_WEBHOOK_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const adminSupabase = createAdminClient()

  // Fetch all workspaces (or filter by workspace_id param)
  const workspaceIdParam = new URL(request.url).searchParams.get('workspace_id')
  const workspacesQuery = adminSupabase.from('workspaces').select('id, name')
  if (workspaceIdParam) workspacesQuery.eq('id', workspaceIdParam)

  const { data: workspaces, error: wsError } = await workspacesQuery
  if (wsError) return NextResponse.json({ error: wsError.message }, { status: 500 })

  const alerts: any[] = []

  for (const workspace of workspaces || []) {
    const token = await getMetaTokenForWorkspace(adminSupabase, workspace.id)
    if (!token) continue

    // Get all active clients with a Meta ad account
    const { data: clients } = await adminSupabase
      .from('workspace_clients')
      .select('id, name, payload')
      .eq('workspace_id', workspace.id)

    const eligibleClients = (clients || []).filter((c: any) => {
      const status = String(c.payload?.status || '').toLowerCase()
      return c.payload?.metaAdAccountId && status !== 'churn' && status !== 'pausado'
    })

    for (const client of eligibleClients) {
      const adAccountId = normalizeAdAccountId(client.payload.metaAdAccountId)
      if (!adAccountId) continue

      try {
        const { balance, currency, isPrepay } = await fetchBalance(token, adAccountId)
        if (!isPrepay || balance === null) continue

        for (const threshold of THRESHOLDS) {
          if (balance <= threshold) {
            const alreadySent = await wasAlertedRecently(adminSupabase, workspace.id, adAccountId, threshold)
            if (!alreadySent) {
              await recordAlert(adminSupabase, workspace.id, client.id, adAccountId, threshold, balance)
              alerts.push({
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                clientId: client.id,
                clientName: client.name || client.payload?.name || 'Cliente',
                adAccountId,
                balance,
                currency,
                threshold,
                message: threshold === 0
                  ? `🚨 *Saldo Zerado - Meta Ads*\n\nCliente: *${client.name || client.payload?.name}*\nConta: act_${adAccountId}\nSaldo atual: *R$ 0,00*\n\n⛔ As campanhas foram pausadas. Recarregue agora!`
                  : `⚠️ *Alerta de Saldo Meta Ads*\n\nCliente: *${client.name || client.payload?.name}*\nConta: act_${adAccountId}\nSaldo atual: *R$ ${balance.toFixed(2)}*\nLimite atingido: *R$ ${threshold}*\n\nRecarregue antes que as campanhas pausem.`,
              })
              // Only alert for the lowest triggered threshold
              break
            } else {
              // Already alerted for this threshold, skip lower ones too
              break
            }
          }
        }
      } catch {
        // Skip accounts with errors silently
      }
    }
  }

  return NextResponse.json({ alerts, count: alerts.length, checkedAt: new Date().toISOString() })
}
