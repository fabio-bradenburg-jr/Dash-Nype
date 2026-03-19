export const META_RESULT_FILTER_LABELS = {
  messages: 'Mensagem',
  leads: 'Cadastro',
  purchases: 'Compra',
  reach: 'Alcance',
  traffic: 'Tráfego',
  engagement: 'Engajamento',
  awareness: 'Reconhecimento',
  app: 'App',
  sales: 'Vendas',
}

export const META_PURCHASE_EVENTS = ['purchase', 'offsite_conversion.fb_pixel_purchase']
export const META_LEAD_EVENTS = ['lead', 'onsite_conversion.lead_grouped']
export const META_MESSAGE_EVENTS = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply']
export const META_LINK_CLICK_EVENTS = ['link_click', 'inline_link_click', 'outbound_click']

function resolveMetaInsightData(input) {
  if (!input) return null
  if (input?.insights?.data?.[0]) return input.insights.data[0]
  return input
}

function sumActionValues(actions = [], actionTypes = []) {
  return actions
    .filter((item) => actionTypes.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
}

function getDerivedClicksFromCost(costItems = [], spend = 0, actionTypes = []) {
  for (const actionType of actionTypes) {
    const costItem = costItems.find((item) => item.action_type === actionType)
    const costValue = parseFloat(costItem?.value || 0)

    if (costValue > 0 && spend > 0) {
      return Math.round(spend / costValue)
    }
  }

  return 0
}

export function normalizeMetaResultFilters(filters = [], availableFilters = Object.keys(META_RESULT_FILTER_LABELS)) {
  const validKeys = availableFilters.length > 0 ? availableFilters : Object.keys(META_RESULT_FILTER_LABELS)
  const normalized = filters.filter((item) => validKeys.includes(item))
  return normalized.length > 0 ? normalized : validKeys
}

export function extractMetaCampaignMetrics(insightData) {
  const normalizedInsightData = resolveMetaInsightData(insightData)

  if (!normalizedInsightData) {
    return {
      spend: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0,
      leads: 0,
      messages: 0,
      totalConversions: 0,
      purchaseValue: 0,
      cost_per_purchase: 0,
      cost_per_lead: 0,
      cost_per_message: 0,
      cpa: 0,
      cpc: 0,
      ctr: 0,
      roas: 0,
      primaryConversionType: 'Nenhuma',
    }
  }

  const actions = normalizedInsightData.actions || []
  const valueActions = normalizedInsightData.action_values || []
  const costPerActionType = normalizedInsightData.cost_per_action_type || []
  const spend = parseFloat(normalizedInsightData.spend || 0)
  const impressions = parseInt(normalizedInsightData.impressions || 0, 10)

  const purchases = sumActionValues(actions, META_PURCHASE_EVENTS)
  const purchaseValue = valueActions
    .filter((item) => META_PURCHASE_EVENTS.includes(item.action_type))
    .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)
  const costPerPurchase = purchases > 0 ? spend / purchases : 0

  const leads = sumActionValues(actions, META_LEAD_EVENTS)
  const costPerLead = leads > 0 ? spend / leads : 0

  const messages = sumActionValues(actions, META_MESSAGE_EVENTS)
  const costPerMessage = messages > 0 ? spend / messages : 0

  const actionLinkClicks = META_LINK_CLICK_EVENTS.reduce((bestValue, actionType) => {
    const total = sumActionValues(actions, [actionType])
    return total > 0 ? total : bestValue
  }, 0)
  const derivedLinkClicks = getDerivedClicksFromCost(costPerActionType, spend, META_LINK_CLICK_EVENTS)
  const explicitClicks = parseInt(normalizedInsightData.clicks || 0, 10)
  const linkClicks = actionLinkClicks > 0 ? actionLinkClicks : (derivedLinkClicks > 0 ? derivedLinkClicks : explicitClicks)
  const totalConversions = purchases + leads + messages

  let primaryConversionType = 'Nenhuma'
  if (purchases > leads && purchases > messages) primaryConversionType = 'Compras'
  else if (leads > purchases && leads > messages) primaryConversionType = 'Leads'
  else if (messages > purchases && messages > leads) primaryConversionType = 'Mensagens'
  else if (totalConversions > 0) primaryConversionType = 'Mistas'

  const cpa = totalConversions > 0 ? spend / totalConversions : 0
  const cpc = linkClicks > 0 ? spend / linkClicks : 0
  const ctr = impressions > 0 ? (linkClicks / impressions) * 100 : 0
  const roas = spend > 0 ? purchaseValue / spend : 0

  return {
    spend,
    clicks: linkClicks,
    impressions,
    purchases,
    leads,
    messages,
    totalConversions,
    purchaseValue,
    cost_per_purchase: costPerPurchase,
    cost_per_lead: costPerLead,
    cost_per_message: costPerMessage,
    cpa,
    cpc,
    ctr,
    roas,
    primaryConversionType,
  }
}

export function buildMetaSummaryFromCampaigns(campaigns = []) {
  const aggregated = campaigns.reduce(
    (accumulator, campaign) => {
      const metrics = extractMetaCampaignMetrics(campaign)

      accumulator.spend += metrics.spend
      accumulator.impressions += metrics.impressions
      accumulator.clicks += metrics.clicks
      accumulator.purchases += metrics.purchases
      accumulator.leads += metrics.leads
      accumulator.messages += metrics.messages
      accumulator.totalConversions += metrics.totalConversions
      accumulator.purchaseValue += metrics.purchaseValue

      return accumulator
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      leads: 0,
      messages: 0,
      totalConversions: 0,
      purchaseValue: 0,
    }
  )

  return {
    spend: aggregated.spend.toString(),
    impressions: aggregated.impressions.toString(),
    clicks: aggregated.clicks.toString(),
    cpc: aggregated.clicks > 0 ? (aggregated.spend / aggregated.clicks).toString() : '0',
    ctr: aggregated.impressions > 0 ? ((aggregated.clicks / aggregated.impressions) * 100).toString() : '0',
    custom_metrics: {
      ...aggregated,
      cost_per_purchase: aggregated.purchases > 0 ? aggregated.spend / aggregated.purchases : 0,
      cost_per_lead: aggregated.leads > 0 ? aggregated.spend / aggregated.leads : 0,
      cost_per_message: aggregated.messages > 0 ? aggregated.spend / aggregated.messages : 0,
      cpa: aggregated.totalConversions > 0 ? aggregated.spend / aggregated.totalConversions : 0,
      roas: aggregated.spend > 0 ? aggregated.purchaseValue / aggregated.spend : 0,
      primaryConversionType: aggregated.totalConversions > 0 ? 'Mistas' : 'Nenhuma',
    },
  }
}

export function matchesMetaResultFilters(insightData, filters = []) {
  const selectedFilters = normalizeMetaResultFilters(filters)
  const metrics = extractMetaCampaignMetrics(insightData)

  return selectedFilters.some((filterKey) => metrics[filterKey] > 0)
}

export function getMetaCampaignFilterKeys(campaign) {
  const metrics = extractMetaCampaignMetrics(campaign)
  const keys = []

  if (metrics.messages > 0) keys.push('messages')
  if (metrics.leads > 0) keys.push('leads')
  if (metrics.purchases > 0) keys.push('purchases')

  const objective = (campaign?.objective || '').toUpperCase()

  if (objective.includes('AWARENESS') || objective === 'REACH' || objective === 'BRAND_AWARENESS') {
    keys.push('awareness')
    if (objective === 'REACH') keys.push('reach')
  }

  if (objective.includes('TRAFFIC') || objective === 'LINK_CLICKS') {
    keys.push('traffic')
  }

  if (
    objective.includes('ENGAGEMENT') ||
    objective === 'POST_ENGAGEMENT' ||
    objective === 'PAGE_LIKES' ||
    objective === 'EVENT_RESPONSES' ||
    objective === 'VIDEO_VIEWS'
  ) {
    keys.push('engagement')
  }

  if (objective.includes('APP')) {
    keys.push('app')
  }

  if (objective.includes('SALES')) {
    keys.push('sales')
  }

  if (keys.length === 0) {
    keys.push('traffic')
  }

  return Array.from(new Set(keys))
}

export function getAvailableMetaResultFilters(campaigns = []) {
  const keys = campaigns.flatMap((campaign) => getMetaCampaignFilterKeys(campaign))
  const uniqueKeys = Array.from(new Set(keys))

  return uniqueKeys.map((key) => ({
    key,
    label: META_RESULT_FILTER_LABELS[key] || key,
  }))
}

export function campaignMatchesMetaResultFilters(campaign, filters = [], availableFilters = []) {
  const selectedFilters = normalizeMetaResultFilters(filters, availableFilters)
  const campaignKeys = getMetaCampaignFilterKeys(campaign)
  return selectedFilters.some((filterKey) => campaignKeys.includes(filterKey))
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
