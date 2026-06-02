import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = String(process.env.META_AUDIT_APP_URL || 'https://app.assessorialp.com.br').replace(/\/$/, '')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar a auditoria.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function normalizeAccountId(value) {
  return String(value || '').replace(/^act_/, '')
}

function getDurationLabel(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`
}

async function fetchTimed(path, token) {
  const startedAt = performance.now()

  try {
    const response = await fetch(`${appUrl}${path}`, {
      headers: {
        'x-meta-access-token': token,
      },
      signal: AbortSignal.timeout(120_000),
    })
    const payload = await response.json().catch(() => null)

    return {
      durationMs: performance.now() - startedAt,
      ok: response.ok,
      status: response.status,
      error: response.ok ? '' : payload?.error || 'Falha sem mensagem.',
    }
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      ok: false,
      status: 0,
      error: error?.message || 'Falha sem mensagem.',
    }
  }
}

const { data: connection, error: connectionError } = await supabase
  .from('workspace_meta_connections')
  .select('access_token')
  .limit(1)
  .maybeSingle()

if (connectionError) throw connectionError
if (!connection?.access_token) throw new Error('Nenhuma conexão Meta ativa foi encontrada.')

const { data: clients, error: clientsError } = await supabase
  .from('workspace_clients')
  .select('name,payload')
  .order('name')

if (clientsError) throw clientsError

const { data: savedSnapshots, error: snapshotsError } = await supabase
  .from('meta_api_cache')
  .select('client_key')

if (snapshotsError) throw snapshotsError

const cachedAccounts = new Set((savedSnapshots || []).map((item) => item.client_key))
const auditedClients = (clients || [])
  .map((client) => ({
    name: client.name,
    accountId: normalizeAccountId(client.payload?.metaAdAccountId),
  }))
  .filter((client) => client.accountId)
  .sort((left, right) => {
    const leftCached = cachedAccounts.has(left.accountId)
    const rightCached = cachedAccounts.has(right.accountId)
    if (leftCached !== rightCached) return leftCached ? 1 : -1
    return left.name.localeCompare(right.name, 'pt-BR')
  })

const endpoints = [
  ['structure', (accountId) => `/api/meta/structure?ad_account_id=${encodeURIComponent(accountId)}&date_preset=last_7d`],
  ['insights', (accountId) => `/api/meta/insights?ad_account_id=${encodeURIComponent(accountId)}&date_preset=last_7d`],
  ['campaigns', (accountId) => `/api/meta/campaigns?ad_account_id=${encodeURIComponent(accountId)}&date_preset=last_7d`],
  ['breakdowns', (accountId) => `/api/meta/breakdowns?ad_account_id=${encodeURIComponent(accountId)}&date_preset=last_7d`],
]

const results = []

for (const client of auditedClients) {
  const endpointResults = {}

  for (const [name, buildPath] of endpoints) {
    endpointResults[name] = await fetchTimed(buildPath(client.accountId), connection.access_token)
  }

  const totalMs = Object.values(endpointResults).reduce((total, item) => total + item.durationMs, 0)
  const hasFailure = Object.values(endpointResults).some((item) => !item.ok)
  const slowest = Object.entries(endpointResults).sort((left, right) => right[1].durationMs - left[1].durationMs)[0]

  const result = {
    client: client.name,
    accountId: client.accountId,
    cacheBeforeAudit: cachedAccounts.has(client.accountId) ? 'warm' : 'cold',
    total: getDurationLabel(totalMs),
    slowestEndpoint: slowest[0],
    slowestDuration: getDurationLabel(slowest[1].durationMs),
    status: hasFailure ? 'error' : totalMs >= 15_000 ? 'slow' : totalMs >= 5_000 ? 'attention' : 'ok',
    endpoints: Object.fromEntries(
      Object.entries(endpointResults).map(([name, item]) => [
        name,
        {
          duration: getDurationLabel(item.durationMs),
          status: item.status,
          error: item.error,
        },
      ])
    ),
  }

  results.push(result)
  console.log(JSON.stringify(result))
}

const summary = {
  clients: results.length,
  coldBeforeAudit: results.filter((item) => item.cacheBeforeAudit === 'cold').length,
  ok: results.filter((item) => item.status === 'ok').length,
  attention: results.filter((item) => item.status === 'attention').length,
  slow: results.filter((item) => item.status === 'slow').length,
  error: results.filter((item) => item.status === 'error').length,
}

console.log(JSON.stringify({ summary }))
