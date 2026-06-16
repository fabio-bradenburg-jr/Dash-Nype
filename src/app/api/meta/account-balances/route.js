import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

const ZERO_DECIMAL_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

function normalizeAdAccountId(value) {
  return String(value || '').replace(/^act_/, '').replace(/\D/g, '')
}

function normalizeCurrencyAmount(value, currency = 'BRL') {
  const numericValue = Number(value || 0)
  if (!Number.isFinite(numericValue)) return 0
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase())
    ? numericValue
    : numericValue / 100
}

function parseCurrencyAmountFromText(text) {
  const rawText = String(text || '')
  const match = rawText.match(/(?:R\$|\$|€|£)?\s*(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?)/)
  if (!match) return null

  const rawValue = match[1].replace(/\s/g, '')
  const decimalNormalized = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue
  const amount = Number(decimalNormalized)

  return Number.isFinite(amount) ? amount : null
}

function cleanFundingSourceLabel(label) {
  return String(label || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function resolvePaymentMethodLabel({ rawLabel, type, isStoredFunds }) {
  const normalized = `${rawLabel || ''} ${type || ''}`.toLowerCase()

  if (/pix/.test(normalized)) return 'Pix'
  if (/boleto|bank slip/.test(normalized)) return 'Boleto'
  if (/cart[aã]o|card|visa|mastercard|amex|elo|hipercard/.test(normalized)) return cleanFundingSourceLabel(rawLabel) || 'Cartão'
  if (/paypal/.test(normalized)) return 'PayPal'
  if (/bank|banco|transfer/.test(normalized)) return 'Transferência bancária'
  if (isStoredFunds) return 'Fundos pré-pagos'

  return cleanFundingSourceLabel(rawLabel) || (type ? String(type) : 'Forma de pagamento vinculada')
}

function resolveFundingSource(details) {
  if (!details || typeof details !== 'object') {
    return {
      hasCard: false,
      label: 'Sem cartão identificado',
      type: '',
      availableAmount: null,
    }
  }

  const rawLabel = details.display_string || details.displayString || details.name || details.id || ''
  const type = details.type || details.funding_source_type || details.fundingSourceType || ''
  const labelForDetection = `${rawLabel} ${type}`.toLowerCase()
  const isStoredFunds = /saldo dispon[ií]vel|available balance|fundos|prepaid|prepay|balance/.test(labelForDetection)
  const availableAmount = isStoredFunds ? parseCurrencyAmountFromText(rawLabel) : null
  const hasCard = Boolean(rawLabel || type) && !isStoredFunds

  return {
    hasCard,
    label: resolvePaymentMethodLabel({ rawLabel, type, isStoredFunds }),
    type: String(type || ''),
    availableAmount,
  }
}

function resolveBillingType(account, funding) {
  if (account.is_prepay_account === true || account.is_prepay_account === 'true') {
    return {
      type: 'prepaid',
      label: 'Pré-pago',
      description: 'Usa fundos adicionados antes da veiculação.',
    }
  }

  if (account.is_prepay_account === false || account.is_prepay_account === 'false' || funding.hasCard) {
    return {
      type: 'postpaid',
      label: 'Pós-pago',
      description: 'Anuncia primeiro e paga depois pela forma de pagamento.',
    }
  }

  return {
    type: 'unidentified',
    label: 'Não identificado',
    description: 'A Meta não retornou o tipo de cobrança desta conta.',
  }
}

function resolveAccountTone({ billingType, fundsAvailable, pendingAmount, hasCard }) {
  if (billingType === 'prepaid') {
    if (fundsAvailable < 100) return 'danger'
    if (fundsAvailable <= 200) return 'warning'
    return 'success'
  }

  if (billingType === 'postpaid') {
    if (!hasCard) return 'danger'
    if (pendingAmount > 0) return 'warning'
    return 'success'
  }

  return 'empty'
}

function resolvePaymentStatus({ accountStatus, billingType, hasCard, pendingAmount }) {
  const status = Number(accountStatus)

  if (status === 3) {
    return {
      key: 'payment_problem',
      label: 'Problema de pagamento',
      description: 'Conta com cobrança não liquidada na Meta.',
      tone: 'danger',
      icon: 'bx-error-circle',
    }
  }

  if (status === 8) {
    return {
      key: 'payment_pending',
      label: 'Pagamento pendente',
      description: 'Conta aguardando liquidação de pagamento.',
      tone: 'warning',
      icon: 'bx-time-five',
    }
  }

  if (status === 2) {
    return {
      key: 'disabled',
      label: 'Conta desativada',
      description: 'Conta desativada ou impedida de veicular.',
      tone: 'danger',
      icon: 'bx-block',
    }
  }

  if (billingType === 'postpaid' && !hasCard) {
    return {
      key: 'missing_payment_method',
      label: 'Sem forma de pagamento',
      description: 'Conta pós-paga sem cartão ou meio de cobrança identificado.',
      tone: 'danger',
      icon: 'bx-credit-card',
    }
  }

  if (pendingAmount > 0) {
    return {
      key: 'debt_pending',
      label: 'Saldo devedor',
      description: 'Conta com valor pendente para acompanhamento.',
      tone: 'warning',
      icon: 'bx-receipt',
    }
  }

  if (status === 1) {
    return {
      key: 'active',
      label: 'Conta ativa',
      description: 'Sem problema de pagamento identificado.',
      tone: 'success',
      icon: 'bx-check-circle',
    }
  }

  return {
    key: status ? 'attention' : 'unidentified',
    label: status ? `Status ${status}` : 'Não identificado',
    description: status ? 'Status retornado pela Meta para revisão.' : 'A Meta não retornou o status da conta.',
    tone: status ? 'warning' : 'empty',
    icon: status ? 'bx-info-circle' : 'bx-help-circle',
  }
}

async function fetchAdAccountBalance(request, token, client) {
  const accountId = normalizeAdAccountId(client.metaAdAccountId)
  if (!accountId) {
    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      balanceAlertsEnabled: client.balanceAlertsEnabled !== false,
      accountId: '',
      accountName: '',
      currency: 'BRL',
      availableBalance: null,
      fundsAvailable: null,
      pendingAmount: null,
      billingType: 'not_configured',
      billingTypeLabel: 'Sem conta',
      billingDescription: 'Configure a conta de anúncio no cadastro do cliente.',
      hasCard: false,
      cardLabel: 'Sem conta de anúncio',
      accountStatus: 'not_configured',
      statusLabel: 'Sem conta',
      statusDescription: 'Configure a conta de anúncio no cadastro do cliente.',
      statusTone: 'empty',
      statusIcon: 'bx-link-alt',
      hasPaymentProblem: false,
      tone: 'empty',
      error: '',
    }
  }

  const fields = [
    'name',
    'account_id',
    'account_status',
    'balance',
    'amount_spent',
    'spend_cap',
    'currency',
    'is_prepay_account',
    'funding_source_details',
    'business',
  ].join(',')
  const url = `https://graph.facebook.com/v19.0/act_${accountId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`

  try {
    const account = await fetchMetaJson(
      url,
      'A Meta demorou para responder ao consultar saldo da conta de anúncio.',
      {
        cacheContext: {
          clientKey: accountId,
          resourceKind: 'account_balance',
        },
      }
    )
    const currency = account.currency || 'BRL'
    const balanceAmount = normalizeCurrencyAmount(account.balance, currency)
    const amountSpent = normalizeCurrencyAmount(account.amount_spent, currency)
    const spendCap = normalizeCurrencyAmount(account.spend_cap, currency)
    const funding = resolveFundingSource(account.funding_source_details)
    const billing = resolveBillingType(account, funding)
    const prepaidAvailableAmount = funding.availableAmount != null ? funding.availableAmount : balanceAmount
    const fundsAvailable = billing.type === 'prepaid' ? Math.max(prepaidAvailableAmount, 0) : null
    const pendingAmount = billing.type === 'postpaid' ? Math.max(balanceAmount, 0) : 0
    const limitAvailable = spendCap > 0 ? Math.max(spendCap - amountSpent, 0) : null
    const paymentStatus = resolvePaymentStatus({
      accountStatus: account.account_status,
      billingType: billing.type,
      hasCard: funding.hasCard,
      pendingAmount,
    })
    const tone = resolveAccountTone({
      billingType: billing.type,
      fundsAvailable: Number(fundsAvailable || 0),
      pendingAmount,
      hasCard: funding.hasCard,
    })

    const businessId = account.business?.id || ''

    return {
      clientId: client.id,
      clientName: client.name || account.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      balanceAlertsEnabled: client.balanceAlertsEnabled !== false,
      accountId,
      businessId,
      accountName: account.name || `Conta ${accountId}`,
      currency,
      availableBalance: fundsAvailable,
      fundsAvailable,
      pendingAmount,
      limitAvailable,
      amountSpent,
      spendCap,
      billingType: billing.type,
      billingTypeLabel: billing.label,
      billingDescription: billing.description,
      isPrepayAccount: billing.type === 'prepaid',
      hasCard: funding.hasCard,
      cardLabel: funding.label,
      cardType: funding.type,
      accountStatus: account.account_status || '',
      statusLabel: paymentStatus.label,
      statusDescription: paymentStatus.description,
      statusTone: paymentStatus.tone,
      statusIcon: paymentStatus.icon,
      hasPaymentProblem: paymentStatus.key === 'payment_problem' || paymentStatus.key === 'payment_pending' || paymentStatus.key === 'missing_payment_method',
      tone: paymentStatus.tone === 'danger' ? 'danger' : tone,
      error: '',
    }
  } catch (error) {
    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      balanceAlertsEnabled: client.balanceAlertsEnabled !== false,
      accountId,
      accountName: `Conta ${accountId}`,
      currency: 'BRL',
      availableBalance: null,
      fundsAvailable: null,
      pendingAmount: null,
      billingType: 'unidentified',
      billingTypeLabel: 'Não identificado',
      billingDescription: 'Não foi possível ler o tipo de cobrança.',
      hasCard: false,
      cardLabel: 'Não foi possível ler cartão',
      accountStatus: 'error',
      statusLabel: 'Erro na leitura',
      statusDescription: 'Não foi possível consultar a conta na Meta.',
      statusTone: 'empty',
      statusIcon: 'bx-error',
      hasPaymentProblem: false,
      tone: 'empty',
      error: normalizeMetaError(error, 'Não foi possível carregar esta conta de anúncio.'),
    }
  }
}

export async function POST(request) {
  try {
    const token = await resolveWorkspaceMetaAccessToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Conecte a Meta em Configurações para acompanhar os saldos.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const clients = Array.isArray(body.clients) ? body.clients.slice(0, 200) : []

    const rows = await Promise.all(
      clients.map((client) => fetchAdAccountBalance(request, token, client || {}))
    )

    rows.sort((left, right) => {
      const leftValue = left.billingType === 'prepaid' && Number.isFinite(Number(left.fundsAvailable)) ? Number(left.fundsAvailable) : Number.POSITIVE_INFINITY
      const rightValue = right.billingType === 'prepaid' && Number.isFinite(Number(right.fundsAvailable)) ? Number(right.fundsAvailable) : Number.POSITIVE_INFINITY
      if (leftValue !== rightValue) return leftValue - rightValue
      if ((left.billingType || '') !== (right.billingType || '')) return String(left.billingType || '').localeCompare(String(right.billingType || ''), 'pt-BR')
      return String(left.clientName || '').localeCompare(String(right.clientName || ''), 'pt-BR')
    })

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      rows,
    })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeMetaError(error, 'Não foi possível carregar os saldos das contas de anúncio.') },
      { status: 500 }
    )
  }
}