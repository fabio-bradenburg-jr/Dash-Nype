import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveWorkspaceForHost } from '@/lib/server/domain-config'

const THRESHOLDS = [50, 100, 150] // checked from lowest to highest; zero handled separately
// How many hours to wait before re-alerting the same account+threshold
const COOLDOWN_HOURS = 6
// Quiet hours in Brazil time (UTC-3): no alerts from 20:00 to 08:00
const QUIET_START_HOUR = 20
const QUIET_END_HOUR = 8

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
  const fields = 'balance,currency,is_prepay_account,account_status,funding_source_details'
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}?fields=${fields}&access_token=${encodeURIComponent(token)}`
  const account = await fetchMetaJson(url, 'Meta timeout ao buscar saldo.')
  const currency = account.currency || 'BRL'
  const isPrepay = account.is_prepay_account === true || account.is_prepay_account === 'true'
  if (!isPrepay) return { balance: null, currency, isPrepay }

  // Use funding_source_details balance when available (matches what the UI shows)
  const rawBalance = normalizeCurrencyAmount(account.balance, currency)
  const fundingDetails = account.funding_source_details
  let fundsAvailable = rawBalance

  if (fundingDetails) {
    const labelRaw = String(fundingDetails.display_string || fundingDetails.displayString || '')
    const labelLower = `${labelRaw} ${fundingDetails.type || ''}`.toLowerCase()
    const isStoredFunds = /saldo dispon[ií]vel|available balance|fundos|prepaid|prepay|balance/.test(labelLower)
    if (isStoredFunds) {
      const match = labelRaw.match(/(?:R\$|\$|€|£)?\s*(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?)/)
      if (match) {
        const normalized = match[1].replace(/\s/g, '').includes(',')
          ? match[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
          : match[1].replace(/\s/g, '')
        const parsed = Number(normalized)
        if (Number.isFinite(parsed)) fundsAvailable = parsed
      }
    }
  }

  return { balance: Math.max(fundsAvailable, 0), currency, isPrepay }
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

  // Quiet hours check (Brazil UTC-3): no alerts between 20:00 and 08:00
  const nowBrazil = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const hourBrazil = nowBrazil.getUTCHours()
  const isQuietHour = hourBrazil >= QUIET_START_HOUR || hourBrazil < QUIET_END_HOUR
  if (isQuietHour) {
    return NextResponse.json({ alerts: [], count: 0, skipped: 'quiet_hours', checkedAt: new Date().toISOString() })
  }

  const adminSupabase = createAdminClient()

  const params = new URL(request.url).searchParams
  const zeroOnly = params.get('zero_only') === 'true'
  let workspaceIdFilter = params.get('workspace_id')

  // Filter by domain (e.g. domain=app.assessorialp.com.br)
  const domainParam = params.get('domain')
  if (domainParam && !workspaceIdFilter) {
    const { workspaceId } = await resolveWorkspaceForHost(adminSupabase, domainParam)
    if (!workspaceId) return NextResponse.json({ error: 'Domínio não encontrado.' }, { status: 404 })
    workspaceIdFilter = workspaceId
  }

  const workspacesQuery = adminSupabase.from('workspaces').select('id, name')
  if (workspaceIdFilter) workspacesQuery.eq('id', workspaceIdFilter)

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
      const alertsEnabled = c.payload?.balanceAlertsEnabled !== false // default true
      return c.payload?.metaAdAccountId && status !== 'churn' && status !== 'pausado' && alertsEnabled
    })

    for (const client of eligibleClients) {
      const adAccountId = normalizeAdAccountId(client.payload.metaAdAccountId)
      if (!adAccountId) continue

      try {
        const { balance, currency, isPrepay } = await fetchBalance(token, adAccountId)
        if (!isPrepay || balance === null) continue

        const clientName = client.name || client.payload?.name || 'Cliente'

        // Zero balance: highest priority, always check independently
        if (balance <= 0) {
          const alreadySent = await wasAlertedRecently(adminSupabase, workspace.id, adAccountId, 0)
          if (!alreadySent) {
            await recordAlert(adminSupabase, workspace.id, client.id, adAccountId, 0, balance)
            alerts.push({
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              clientId: client.id,
              clientName,
              adAccountId,
              balance,
              currency,
              threshold: 0,
              message: `🚨 *Saldo Zerado - Meta Ads*\n\nCliente: *${clientName}*\nConta: act_${adAccountId}\nSaldo atual: *R$ 0,00*\n\n⛔ As campanhas foram pausadas. Recarregue agora!`,
            })
          }
          continue // skip regular thresholds when balance is zero
        }

        // Skip regular thresholds when running in zero_only mode
        if (zeroOnly) continue

        // Regular thresholds: find the lowest triggered one
        for (const threshold of THRESHOLDS) {
          if (balance < threshold) {
            const alreadySent = await wasAlertedRecently(adminSupabase, workspace.id, adAccountId, threshold)
            if (!alreadySent) {
              await recordAlert(adminSupabase, workspace.id, client.id, adAccountId, threshold, balance)
              alerts.push({
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                clientId: client.id,
                clientName,
                adAccountId,
                balance,
                currency,
                threshold,
                message: threshold === 50
                ? `🔴 *Saldo Crítico - Meta Ads*\n\nCliente: *${clientName}*\nConta: act_${adAccountId}\nSaldo atual: *R$ ${balance.toFixed(2)}*\n\n⛔ As campanhas vão pausar em breve. Recarregue agora!`
                : threshold === 100
                  ? `🟠 *Saldo Baixo - Meta Ads*\n\nCliente: *${clientName}*\nConta: act_${adAccountId}\nSaldo atual: *R$ ${balance.toFixed(2)}*\n\n⚠️ Saldo abaixo de R$ 100. Providencie recarga para evitar pausa.`
                  : `🟡 *Aviso de Saldo - Meta Ads*\n\nCliente: *${clientName}*\nConta: act_${adAccountId}\nSaldo atual: *R$ ${balance.toFixed(2)}*\n\nSaldo abaixo de R$ 150. Fique de olho e recarregue em breve.`,
              })
            }
            break
          }
        }
      } catch {
        // Skip accounts with errors silently
      }
    }
  }

  return NextResponse.json({ alerts, count: alerts.length, checkedAt: new Date().toISOString() })
}