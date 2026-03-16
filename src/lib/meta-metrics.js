export function formatInsightsWithConversions(insightData) {
  if (!insightData) return {}

  const actions = insightData.actions || []
  const valueActions = insightData.action_values || []
  const spend = parseFloat(insightData.spend || 0)

  const purchaseEvents = ['purchase', 'offsite_conversion.fb_pixel_purchase']
  const leadEvents = ['lead', 'onsite_conversion.lead_grouped']
  const messageEvents = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply']

  const purchases = actions
    .filter((item) => purchaseEvents.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
  const purchaseValue = valueActions
    .filter((item) => purchaseEvents.includes(item.action_type))
    .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)
  const costPerPurchase = purchases > 0 ? spend / purchases : 0

  const leads = actions
    .filter((item) => leadEvents.includes(item.action_type))
    .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
  const costPerLead = leads > 0 ? spend / leads : 0

  const messages = actions
    .filter((item) => messageEvents.includes(item.action_type))
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
    ...insightData,
    custom_metrics: {
      totalConversions,
      primaryConversionType,
      purchases,
      leads,
      messages,
      cost_per_purchase: costPerPurchase,
      cost_per_lead: costPerLead,
      cost_per_message: costPerMessage,
      cpa,
      roas,
      purchaseValue,
    },
  }
}
