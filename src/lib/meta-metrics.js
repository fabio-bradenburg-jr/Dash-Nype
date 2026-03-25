export const META_RESULT_FILTER_LABELS = {
  messages: 'Mensagem',
  leads: 'Cadastro',
  purchases: 'Compra',
  reach: 'Alcance',
  truplays: 'TruPlay',
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
export const META_THRUPLAY_EVENTS = ['thruplay', 'video_thruplay_watched_actions']

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

function getBestActionValue(actions = [], actionTypes = []) {
  return actionTypes.reduce((bestValue, actionType) => {
    const total = sumActionValues(actions, [actionType])
    return total > bestValue ? total : bestValue
  }, 0)
}

function getBestFloatActionValue(actions = [], actionTypes = []) {
  return actionTypes.reduce((bestValue, actionType) => {
    const total = actions
      .filter((item) => item.action_type === actionType)
      .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)

    return total > bestValue ? total : bestValue
  }, 0)
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

function sumValueItems(items = []) {
  return items.reduce((sum, item) => sum + parseFloat(item?.value || 0), 0)
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
      reach: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0,
      leads: 0,
      messages: 0,
      thruplays: 0,
      totalConversions: 0,
      purchaseValue: 0,
      cost_per_purchase: 0,
      cost_per_lead: 0,
      cost_per_message: 0,
      cost_per_reach: 0,
      cost_per_thruplay: 0,
      cpa: 0,
      cpc: 0,
      cpm: 0,
      frequency: 0,
      ctr: 0,
      conversionRate: 0,
      averageTicket: 0,
      roas: 0,
      videoViews: 0,
      videoViewRate: 0,
      thruplay: 0,
      hookRate: 0,
      primaryConversionType: 'Nenhuma',
    }
  }

  const actions = normalizedInsightData.actions || []
  const valueActions = normalizedInsightData.action_values || []
  const costPerActionType = normalizedInsightData.cost_per_action_type || []
  const spend = parseFloat(normalizedInsightData.spend || 0)
  const reach = parseInt(normalizedInsightData.reach || 0, 10)
  const impressions = parseInt(normalizedInsightData.impressions || 0, 10)

  const purchases = getBestActionValue(actions, META_PURCHASE_EVENTS)
  const purchaseValue = getBestFloatActionValue(valueActions, META_PURCHASE_EVENTS)
  const costPerPurchase = purchases > 0 ? spend / purchases : 0

  const leads = getBestActionValue(actions, META_LEAD_EVENTS)
  const costPerLead = leads > 0 ? spend / leads : 0

  const messages = getBestActionValue(actions, META_MESSAGE_EVENTS)
  const costPerMessage = messages > 0 ? spend / messages : 0
  const thruplays = getBestActionValue(actions, META_THRUPLAY_EVENTS)
  const costPerThruplay = thruplays > 0 ? spend / thruplays : 0

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
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
  const frequency = reach > 0 ? impressions / reach : 0
  const ctr = impressions > 0 ? (linkClicks / impressions) * 100 : 0
  const conversionRate = linkClicks > 0 ? (totalConversions / linkClicks) * 100 : 0
  const averageTicket = purchases > 0 ? purchaseValue / purchases : 0
  const roas = spend > 0 ? purchaseValue / spend : 0
<<<<<<< HEAD
  const videoViews = Math.round(sumValueItems(normalizedInsightData.video_play_actions || []))
  const quarterViews = Math.round(sumValueItems(normalizedInsightData.video_p25_watched_actions || []))
  const thruplay = Math.round(sumValueItems(normalizedInsightData.video_thruplay_watched_actions || []))
  const videoViewRate = impressions > 0 ? (videoViews / impressions) * 100 : 0
  const hookRate = videoViews > 0 ? (quarterViews / videoViews) * 100 : 0
=======
  const costPerReach = reach > 0 ? spend / reach : 0
>>>>>>> df05abf (Separa custos da Meta por tipo de resultado)

  return {
    spend,
    reach,
    clicks: linkClicks,
    impressions,
    purchases,
    leads,
    messages,
    thruplays,
    totalConversions,
    purchaseValue,
    cost_per_purchase: costPerPurchase,
    cost_per_lead: costPerLead,
    cost_per_message: costPerMessage,
    cost_per_reach: costPerReach,
    cost_per_thruplay: costPerThruplay,
    cpa,
    cpc,
    cpm,
    frequency,
    ctr,
    conversionRate,
    averageTicket,
    roas,
    videoViews,
    videoViewRate,
    thruplay,
    hookRate,
    primaryConversionType,
  }
}

function normalizeMetaObjective(objective) {
  return String(objective || '').trim().toUpperCase()
}

function isMetaReachObjective(objective) {
  return objective === 'REACH' || objective === 'BRAND_AWARENESS' || objective.includes('AWARENESS')
}

function isMetaThruplayObjective(objective) {
  return objective === 'VIDEO_VIEWS' || objective.includes('VIDEO')
}

function isMetaMessageObjective(objective) {
  return objective.includes('MESSAGE') || objective.includes('MESSAGING')
}

function isMetaLeadObjective(objective) {
  return objective.includes('LEAD')
}

function isMetaPurchaseObjective(objective) {
  return objective.includes('SALES') || objective.includes('PURCHASE') || objective.includes('CATALOG')
}

function resolveMetaPrimaryResultKey(campaign, metrics) {
  const objective = normalizeMetaObjective(campaign?.objective)

  if (isMetaReachObjective(objective)) return 'reach'
  if (isMetaThruplayObjective(objective)) return 'truplays'
  if (isMetaMessageObjective(objective)) return 'messages'
  if (isMetaLeadObjective(objective)) return 'leads'
  if (isMetaPurchaseObjective(objective)) return 'purchases'

  const rankedResults = [
    ['purchases', metrics.purchases || 0],
    ['leads', metrics.leads || 0],
    ['messages', metrics.messages || 0],
    ['truplays', metrics.thruplays || 0],
  ]

  rankedResults.sort((left, right) => right[1] - left[1])

  if ((rankedResults[0]?.[1] || 0) > 0) {
    return rankedResults[0][0]
  }

  return 'other'
}

export function buildMetaSummaryFromCampaigns(campaigns = []) {
  const aggregated = campaigns.reduce(
    (accumulator, campaign) => {
      const metrics = extractMetaCampaignMetrics(campaign)
      const primaryResultKey = resolveMetaPrimaryResultKey(campaign, metrics)

      accumulator.spend += metrics.spend
      accumulator.reach += metrics.reach
      accumulator.impressions += metrics.impressions
      accumulator.clicks += metrics.clicks
<<<<<<< HEAD
      accumulator.purchases += metrics.purchases
      accumulator.leads += metrics.leads
      accumulator.messages += metrics.messages
      accumulator.totalConversions += metrics.totalConversions
      accumulator.purchaseValue += metrics.purchaseValue
      accumulator.videoViews += metrics.videoViews
      accumulator.thruplay += metrics.thruplay
      accumulator.quarterViews += metrics.videoViews > 0 ? Math.round((metrics.hookRate / 100) * metrics.videoViews) : 0
=======

      if (primaryResultKey === 'purchases') {
        accumulator.purchase_spend += metrics.spend
        accumulator.purchases += metrics.purchases
        accumulator.purchaseValue += metrics.purchaseValue
      }

      if (primaryResultKey === 'leads') {
        accumulator.lead_spend += metrics.spend
        accumulator.leads += metrics.leads
      }

      if (primaryResultKey === 'messages') {
        accumulator.message_spend += metrics.spend
        accumulator.messages += metrics.messages
      }

      if (primaryResultKey === 'reach') {
        accumulator.reach_spend += metrics.spend
        accumulator.reach_results += metrics.reach
      }

      if (primaryResultKey === 'truplays') {
        accumulator.thruplay_spend += metrics.spend
        accumulator.thruplays += metrics.thruplays
      }
>>>>>>> df05abf (Separa custos da Meta por tipo de resultado)

      return accumulator
    },
    {
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      leads: 0,
      messages: 0,
      thruplays: 0,
      purchaseValue: 0,
<<<<<<< HEAD
      videoViews: 0,
      thruplay: 0,
      quarterViews: 0,
=======
      purchase_spend: 0,
      lead_spend: 0,
      message_spend: 0,
      reach_spend: 0,
      thruplay_spend: 0,
      reach_results: 0,
>>>>>>> df05abf (Separa custos da Meta por tipo de resultado)
    }
  )

  aggregated.totalConversions = aggregated.purchases + aggregated.leads + aggregated.messages
  aggregated.conversion_spend = aggregated.purchase_spend + aggregated.lead_spend + aggregated.message_spend

  return {
    spend: aggregated.spend.toString(),
    reach: aggregated.reach.toString(),
    impressions: aggregated.impressions.toString(),
    clicks: aggregated.clicks.toString(),
    cpc: aggregated.clicks > 0 ? (aggregated.spend / aggregated.clicks).toString() : '0',
    ctr: aggregated.impressions > 0 ? ((aggregated.clicks / aggregated.impressions) * 100).toString() : '0',
    custom_metrics: {
      ...aggregated,
      cost_per_purchase: aggregated.purchases > 0 ? aggregated.purchase_spend / aggregated.purchases : 0,
      cost_per_lead: aggregated.leads > 0 ? aggregated.lead_spend / aggregated.leads : 0,
      cost_per_message: aggregated.messages > 0 ? aggregated.message_spend / aggregated.messages : 0,
      cost_per_reach: aggregated.reach_results > 0 ? aggregated.reach_spend / aggregated.reach_results : 0,
      cost_per_thruplay: aggregated.thruplays > 0 ? aggregated.thruplay_spend / aggregated.thruplays : 0,
      cpa: aggregated.totalConversions > 0 ? aggregated.conversion_spend / aggregated.totalConversions : 0,
      cpm: aggregated.impressions > 0 ? (aggregated.spend / aggregated.impressions) * 1000 : 0,
      frequency: aggregated.reach > 0 ? aggregated.impressions / aggregated.reach : 0,
      conversionRate: aggregated.clicks > 0 ? (aggregated.totalConversions / aggregated.clicks) * 100 : 0,
      averageTicket: aggregated.purchases > 0 ? aggregated.purchaseValue / aggregated.purchases : 0,
      roas: aggregated.spend > 0 ? aggregated.purchaseValue / aggregated.spend : 0,
<<<<<<< HEAD
      videoViews: aggregated.videoViews,
      videoViewRate: aggregated.impressions > 0 ? (aggregated.videoViews / aggregated.impressions) * 100 : 0,
      thruplay: aggregated.thruplay,
      hookRate: aggregated.videoViews > 0 ? (aggregated.quarterViews / aggregated.videoViews) * 100 : 0,
=======
      purchase_roas: aggregated.purchase_spend > 0 ? aggregated.purchaseValue / aggregated.purchase_spend : 0,
>>>>>>> df05abf (Separa custos da Meta por tipo de resultado)
      primaryConversionType: aggregated.totalConversions > 0 ? 'Mistas' : 'Nenhuma',
    },
  }
}

export function matchesMetaResultFilters(insightData, filters = []) {
  const selectedFilters = normalizeMetaResultFilters(filters)
  const campaignKeys = getMetaCampaignFilterKeys(insightData)
  return selectedFilters.some((filterKey) => campaignKeys.includes(filterKey))
}

export function getMetaCampaignFilterKeys(campaign) {
  const metrics = extractMetaCampaignMetrics(campaign)
  const keys = []
  const objective = normalizeMetaObjective(campaign?.objective)

  if (metrics.messages > 0 || isMetaMessageObjective(objective)) keys.push('messages')
  if (metrics.leads > 0 || isMetaLeadObjective(objective)) keys.push('leads')
  if (metrics.purchases > 0 || isMetaPurchaseObjective(objective)) keys.push('purchases')
  if (metrics.thruplays > 0 || isMetaThruplayObjective(objective)) keys.push('truplays')

  if (isMetaReachObjective(objective)) {
    keys.push('awareness')
    keys.push('reach')
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
