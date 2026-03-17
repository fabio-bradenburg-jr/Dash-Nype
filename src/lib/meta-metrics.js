export const META_RESULT_FILTER_OPTIONS = [
  { key: 'messages', label: 'Mensagem' },
  { key: 'leads', label: 'Cadastro' },
  { key: 'purchases', label: 'Compra' },
]

export const META_PURCHASE_EVENTS = ['purchase', 'offsite_conversion.fb_pixel_purchase']
export const META_LEAD_EVENTS = ['lead', 'onsite_conversion.lead_grouped']
export const META_MESSAGE_EVENTS = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply']

export function normalizeMetaResultFilters(filters = []) {
  const validKeys = META_RESULT_FILTER_OPTIONS.map((item) => item.key)
  const normalized = filters.filter((item) => validKeys.includes(item))
  return normalized.length > 0 ? normalized : validKeys
}

export function extractMetaCampaignMetrics(insightData) {
  if (!insightData) {
    return {
      spend: 0,
      purchases: 0,
      leads: 0,
      messages: 0,
      totalConversions: 0,
      purchaseValue: 0,
      cost_per_purchase: 0,
      cost_per_lead: 0,
      cost_per_message: 0,
      cpa: 0,
      roas: 0,
      primaryConversionType: 'Nenhuma',
    }
  }

  const actions = insightData.actions || []
  const valueActions = insightData.action_values || []
  const spend = parseFloat(insightData.spend || 0)

  const purchases = actions
    .filter((item) => META_PURCHASE_EVENTS.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
  const purchaseValue = valueActions
    .filter((item) => META_PURCHASE_EVENTS.includes(item.action_type))
    .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)
  const costPerPurchase = purchases > 0 ? spend / purchases : 0

  const leads = actions
    .filter((item) => META_LEAD_EVENTS.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
  const costPerLead = leads > 0 ? spend / leads : 0

  const messages = actions
    .filter((item) => META_MESSAGE_EVENTS.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
  const costPerMessage = messages > 0 ? spend / messages : 0

  const totalConversions = purchases + leads + messages

  let primaryConversionType = 'Nenhuma'
  if (purchases > leads && purchases > messages) primaryConversionType = 'Compras'
  else if (leads > purchases && leads > messages) primaryConversionType = 'Leads'
  else if (messages > purchases && messages > leads) primaryConversionType = 'Mensagens'
  else if (totalConversions > 0) primaryConversionType = 'Mistas'

  const cpa = totalConversions > 0 ? spend / totalConversions : 0
  const roas = spend > 0 ? purchaseValue / spend : 0

  return {
    spend,
    purchases,
    leads,
    messages,
    totalConversions,
    purchaseValue,
    cost_per_purchase: costPerPurchase,
    cost_per_lead: costPerLead,
    cost_per_message: costPerMessage,
    cpa,
    roas,
    primaryConversionType,
  }
}

export function matchesMetaResultFilters(insightData, filters = []) {
  const selectedFilters = normalizeMetaResultFilters(filters)
  const metrics = extractMetaCampaignMetrics(insightData)

  return selectedFilters.some((filterKey) => metrics[filterKey] > 0)
}

export function formatInsightsWithConversions(insightData) {
  if (!insightData) return {}

  const metrics = extractMetaCampaignMetrics(insightData)

  return {
    ...insightData,
    custom_metrics: {
      ...metrics,
    },
  }
}
