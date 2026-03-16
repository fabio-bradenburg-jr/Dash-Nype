import { NextResponse } from 'next/server'

function getRdToken(request) {
  return request.headers.get('x-rd-station-token') || ''
}

function normalizeCollection(payload, preferredKey) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[preferredKey])) return payload[preferredKey]
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function parsePossibleCurrency(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')

  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function looksLikeRevenueLabel(value) {
  const label = normalizeLabel(value)

  return (
    label.includes('valor total') ||
    label.includes('valor da venda') ||
    label.includes('valor vendido') ||
    label.includes('total da venda') ||
    label.includes('receita') ||
    label.includes('faturamento') ||
    label === 'valor' ||
    label === 'total'
  )
}

function getCustomFieldNumericValue(field) {
  if (!field || typeof field !== 'object') return null

  const label = field.label || field.name || field.title || field.key || field.custom_field?.label || field.custom_field?.name || ''
  const looksLikeTotalValue = looksLikeRevenueLabel(label)

  if (!looksLikeTotalValue) return null

  const fieldCandidates = [
    field.value,
    field.amount,
    field.amount_decimal,
    field.decimal_value,
    field.currency_value,
    field.formatted_value,
    field.content,
    field.raw_value,
    field.number_value,
    field.money_value,
    field.custom_field_value,
  ]

  for (const candidate of fieldCandidates) {
    const parsed = parsePossibleCurrency(candidate)
    if (parsed !== null) return parsed
  }

  return null
}

function findNestedRevenueValue(input, depth = 0, visited = new WeakSet()) {
  if (!input || depth > 5) return null

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findNestedRevenueValue(item, depth + 1, visited)
      if (found !== null) return found
    }
    return null
  }

  if (typeof input !== 'object') return null

  if (visited.has(input)) return null
  visited.add(input)

  const directFieldValue = getCustomFieldNumericValue(input)
  if (directFieldValue !== null) return directFieldValue

  for (const [key, value] of Object.entries(input)) {
    if (looksLikeRevenueLabel(key)) {
      const parsed = parsePossibleCurrency(value)
      if (parsed !== null) return parsed

      if (typeof value === 'object') {
        const nested = findNestedRevenueValue(value, depth + 1, visited)
        if (nested !== null) return nested
      }
    }
  }

  for (const value of Object.values(input)) {
    const nested = findNestedRevenueValue(value, depth + 1, visited)
    if (nested !== null) return nested
  }

  return null
}

function getNumericValue(record) {
  const candidates = [
    record?.amount,
    record?.amount_decimal,
    record?.value,
    record?.deal_amount,
    record?.deal_value,
    record?.total,
    record?.total_value,
    record?.amount_total,
    record?.valor_total,
  ]

  for (const candidate of candidates) {
    const parsed = parsePossibleCurrency(candidate)
    if (parsed !== null) return parsed
  }

  const customFieldCollections = [
    record?.custom_fields,
    record?.deal_custom_fields,
    record?.fields,
    record?.field_values,
    record?.deal_fields,
    record?.customFieldValues,
  ].filter(Array.isArray)

  for (const collection of customFieldCollections) {
    for (const field of collection) {
      const parsed = getCustomFieldNumericValue(field)
      if (parsed !== null) return parsed
    }
  }

  const nestedValue = findNestedRevenueValue(record)
  if (nestedValue !== null) return nestedValue

  return 0
}

function collectTextFragments(input, depth = 0, visited = new WeakSet()) {
  if (input === null || input === undefined || depth > 4) return []

  if (typeof input === 'string' || typeof input === 'number') {
    return [String(input)]
  }

  if (typeof input !== 'object') return []
  if (visited.has(input)) return []
  visited.add(input)

  if (Array.isArray(input)) {
    return input.flatMap((item) => collectTextFragments(item, depth + 1, visited))
  }

  return Object.values(input).flatMap((value) => collectTextFragments(value, depth + 1, visited))
}

function classifyDealStatus(deal) {
  const fragments = collectTextFragments([
    deal?.status,
    deal?.deal_status,
    deal?.deal_stage_name,
    deal?.deal_stage,
    deal?.stage,
    deal?.pipeline,
    deal?.funnel,
    deal?.tags,
    deal?.tag_list,
    deal?.status_label,
    deal?.status_name,
  ]).map((value) => normalizeLabel(value))

  const combinedStatus = fragments.join(' ')

  if (
    deal?.won === true ||
    deal?.win === true ||
    combinedStatus.includes('won') ||
    combinedStatus.includes('ganh') ||
    combinedStatus.includes('vendid') ||
    combinedStatus.includes('vendida') ||
    combinedStatus.includes('fechado ganho') ||
    combinedStatus.includes('closed won')
  ) {
    return 'won'
  }

  if (
    deal?.lost === true ||
    combinedStatus.includes('lost') ||
    combinedStatus.includes('perd') ||
    combinedStatus.includes('cancelad') ||
    combinedStatus.includes('closed lost')
  ) {
    return 'lost'
  }

  return 'open'
}

function parseDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffInDays(startDate, endDate) {
  if (!startDate || !endDate) return null
  const diff = endDate.getTime() - startDate.getTime()
  if (diff < 0) return null
  return diff / (1000 * 60 * 60 * 24)
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getDateRangeBounds(datePreset, since, until) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  if (datePreset === 'custom' && since && until) {
    return {
      start: new Date(`${since}T00:00:00`),
      end: new Date(`${until}T23:59:59.999`),
    }
  }

  switch (datePreset) {
    case 'today':
      return { start: today, end: new Date(today.getTime() + 86400000 - 1) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: yesterday, end: new Date(yesterday.getTime() + 86400000 - 1) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { start, end: new Date(today.getTime() + 86400000 - 1) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { start, end: new Date(today.getTime() + 86400000 - 1) }
    }
    case 'this_month':
      return { start: startOfMonth, end: new Date(today.getTime() + 86400000 - 1) }
    case 'maximum':
    default:
      return null
  }
}

function isWithinRange(date, range) {
  if (!range) return true
  if (!date) return false
  return date >= range.start && date <= range.end
}

function getOwnerInfo(deal) {
  const ownerCandidates = [
    deal?.user,
    deal?.owner,
    deal?.responsible,
    deal?.deal_owner,
  ].filter(Boolean)

  const owner = ownerCandidates[0] || {}
  const id = `${owner?.id || owner?.uuid || owner?.email || deal?.user_id || deal?.owner_id || deal?.responsible_id || ''}`.trim()
  const name = `${owner?.name || owner?.fullname || owner?.full_name || owner?.email || deal?.user_name || deal?.owner_name || deal?.responsible_name || ''}`.trim()

  if (!id && !name) return null

  return {
    id: id || name.toLowerCase().replace(/\s+/g, '-'),
    name: name || 'Sem vendedor definido',
  }
}

function getContactCreatedAt(contact) {
  return parseDateValue(
    contact?.created_at ||
      contact?.createdAt ||
      contact?.created ||
      contact?.created_on
  )
}

function getDealCreatedAt(deal) {
  return parseDateValue(
    deal?.created_at ||
      deal?.createdAt ||
      deal?.created ||
      deal?.created_on
  )
}

function getDealClosedAt(deal) {
  return parseDateValue(
    deal?.won_at ||
      deal?.wonAt ||
      deal?.closed_at ||
      deal?.closedAt ||
      deal?.updated_at ||
      deal?.updatedAt
  )
}

function getDealStageLabel(deal) {
  const candidates = [
    deal?.deal_stage_name,
    deal?.deal_stage,
    deal?.stage,
    deal?.stage_name,
    deal?.pipeline_stage,
    deal?.deal_stage_label,
  ]

  const directValue = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())
  if (directValue) return directValue.trim()

  if (typeof deal?.stage === 'object') {
    const nested = [
      deal.stage.name,
      deal.stage.label,
      deal.stage.title,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim())

    if (nested) return nested.trim()
  }

  return ''
}

function getCustomFieldTextValue(field) {
  if (!field || typeof field !== 'object') return ''

  const candidates = [
    field.value,
    field.formatted_value,
    field.content,
    field.raw_value,
    field.text_value,
    field.custom_field_value,
  ]

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '')
  return found ? String(found).trim() : ''
}

function getTextFromMatchingFields(record, matchers = []) {
  if (!record || typeof record !== 'object') return ''

  const directCandidates = Object.entries(record)
    .filter(([key]) => matchers.some((matcher) => normalizeLabel(key).includes(matcher)))
    .map(([, value]) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''))
    .filter(Boolean)

  if (directCandidates[0]) return directCandidates[0]

  const customFieldCollections = [
    record?.custom_fields,
    record?.deal_custom_fields,
    record?.fields,
    record?.field_values,
    record?.deal_fields,
    record?.customFieldValues,
  ].filter(Array.isArray)

  for (const collection of customFieldCollections) {
    for (const field of collection) {
      const label = normalizeLabel(field?.label || field?.name || field?.title || field?.key || field?.custom_field?.label || field?.custom_field?.name)
      if (matchers.some((matcher) => label.includes(matcher))) {
        const text = getCustomFieldTextValue(field)
        if (text) return text
      }
    }
  }

  return ''
}

function buildSourceLabel(deal, contact) {
  const utmSource = getTextFromMatchingFields(deal, ['utm_source']).trim() || getTextFromMatchingFields(contact, ['utm_source']).trim()
  const utmMedium = getTextFromMatchingFields(deal, ['utm_medium']).trim() || getTextFromMatchingFields(contact, ['utm_medium']).trim()
  const utmCampaign = getTextFromMatchingFields(deal, ['utm_campaign', 'campanha']).trim() || getTextFromMatchingFields(contact, ['utm_campaign', 'campanha']).trim()
  const source = getTextFromMatchingFields(deal, ['origem', 'fonte', 'source']).trim() || getTextFromMatchingFields(contact, ['origem', 'fonte', 'source']).trim()

  const utmLabel = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ')
  if (utmLabel) return utmLabel
  if (source) return source

  return 'Origem não identificada'
}

function getStageKey(deal) {
  return getDealStageLabel(deal) || 'Sem etapa definida'
}

export async function GET(request) {
  try {
    const token = getRdToken(request)
    const { searchParams } = new URL(request.url)
    const selectedSellerId = searchParams.get('seller_id') || 'all'
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    const qualifiedStages = searchParams
      .getAll('qualified_stage')
      .map((stage) => stage.trim())
      .filter(Boolean)
    const normalizedQualifiedStages = new Set(qualifiedStages.map((stage) => normalizeLabel(stage)))
    const hasQualifiedStageFilter = normalizedQualifiedStages.size > 0
    const selectedRange = getDateRangeBounds(datePreset, since, until)

    if (!token) {
      return NextResponse.json({ error: 'Informe o token do RD Station CRM.' }, { status: 400 })
    }

    const contactsUrl = `https://crm.rdstation.com/api/v1/contacts?token=${encodeURIComponent(token)}&limit=200`
    const dealsUrl = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=200`

    const [contactsRes, dealsRes] = await Promise.all([
      fetch(contactsUrl),
      fetch(dealsUrl),
    ])

    const [contactsPayload, dealsPayload] = await Promise.all([
      contactsRes.json(),
      dealsRes.json(),
    ])

    if (!contactsRes.ok) {
      throw new Error(contactsPayload?.message || contactsPayload?.error || 'Não foi possível consultar os contatos do RD Station.')
    }

    if (!dealsRes.ok) {
      throw new Error(dealsPayload?.message || dealsPayload?.error || 'Não foi possível consultar as negociações do RD Station.')
    }

    const contacts = normalizeCollection(contactsPayload, 'contacts')
    const deals = normalizeCollection(dealsPayload, 'deals')
    const contactsById = new Map(
      contacts.map((contact) => [
        `${contact?.id || contact?.uuid || contact?.contact_id || ''}`,
        contact,
      ])
    )
    const sellersMap = new Map()

    deals.forEach((deal) => {
      const owner = getOwnerInfo(deal)
      if (!owner) return
      sellersMap.set(owner.id, owner)
    })

    const availableStages = Array.from(
      new Set(
        deals
          .map((deal) => getDealStageLabel(deal))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    const filteredDeals = deals.filter((deal) => {
      if (selectedSellerId === 'all') return true
      const owner = getOwnerInfo(deal)
      return owner?.id === selectedSellerId
    })
    const contactsInPeriod = contacts.filter((contact) => isWithinRange(getContactCreatedAt(contact), selectedRange))

    const wonLeadToWonDays = []
    const wonDealToWonDays = []
    const globalWonLeadToWonDays = []
    const globalWonDealToWonDays = []

    deals.forEach((deal) => {
      const type = classifyDealStatus(deal)
      if (type !== 'won') return

      const dealCreatedAt = getDealCreatedAt(deal)
      const dealClosedAt = getDealClosedAt(deal)
      if (!isWithinRange(dealClosedAt, selectedRange)) return
      const relatedContactId = `${deal?.contact_id || deal?.contact?.id || deal?.contact?.uuid || deal?.deal_contact_id || ''}`
      const relatedContact = contactsById.get(relatedContactId)
      const contactCreatedAt = getContactCreatedAt(relatedContact)

      const leadToWonDays = diffInDays(contactCreatedAt, dealClosedAt)
      if (leadToWonDays !== null) globalWonLeadToWonDays.push(leadToWonDays)

      const dealToWonDays = diffInDays(dealCreatedAt, dealClosedAt)
      if (dealToWonDays !== null) globalWonDealToWonDays.push(dealToWonDays)
    })

    const summary = filteredDeals.reduce(
      (accumulator, deal) => {
        const type = classifyDealStatus(deal)
        const amount = getNumericValue(deal)
        const owner = getOwnerInfo(deal)
        const dealCreatedAt = getDealCreatedAt(deal)
        const dealClosedAt = getDealClosedAt(deal)
        const dealCreatedInRange = isWithinRange(dealCreatedAt, selectedRange)
        const dealClosedInRange = isWithinRange(dealClosedAt, selectedRange)
        const relatedContactId = `${deal?.contact_id || deal?.contact?.id || deal?.contact?.uuid || deal?.deal_contact_id || ''}`
        const relatedContact = contactsById.get(relatedContactId)
        const contactCreatedAt = getContactCreatedAt(relatedContact)
        const contactCreatedInRange = isWithinRange(contactCreatedAt, selectedRange)
        const sourceLabel = buildSourceLabel(deal, relatedContact)
        const stageLabel = getStageKey(deal)
        const isQualifiedStage = hasQualifiedStageFilter
          ? normalizedQualifiedStages.has(normalizeLabel(stageLabel))
          : type !== 'lost'

        accumulator.stageStats[stageLabel] ||= {
          label: stageLabel,
          deals: 0,
          openDeals: 0,
          wonDeals: 0,
          lostDeals: 0,
          pipelineValue: 0,
          wonRevenue: 0,
        }
        accumulator.stageStats[stageLabel].deals += 1

        if (dealCreatedInRange) {
          accumulator.createdDeals += 1

          if (isQualifiedStage || type === 'won') {
            accumulator.qualifiedDeals += 1
          }
        }

        if (dealCreatedInRange && contactCreatedInRange && relatedContactId && (isQualifiedStage || type === 'won')) {
          accumulator.contactsWithQualifiedDeals.add(relatedContactId)
        }

        if (dealCreatedInRange && contactCreatedInRange && relatedContactId) {
          accumulator.contactsWithDeals.add(relatedContactId)
        }

        if (type === 'won' && dealClosedInRange) {
          accumulator.wonDeals += 1
          accumulator.wonRevenue += amount
          accumulator.stageStats[stageLabel].wonDeals += 1
          accumulator.stageStats[stageLabel].wonRevenue += amount

          if (contactCreatedInRange && relatedContactId) {
            accumulator.contactsWithWonDeals.add(relatedContactId)
          }

          const leadToWonDays = diffInDays(contactCreatedAt, dealClosedAt)
          if (leadToWonDays !== null) wonLeadToWonDays.push(leadToWonDays)

          const dealToWonDays = diffInDays(dealCreatedAt, dealClosedAt)
          if (dealToWonDays !== null) wonDealToWonDays.push(dealToWonDays)

          accumulator.sourceStats[sourceLabel] ||= {
            label: sourceLabel,
            wonDeals: 0,
            wonRevenue: 0,
          }
          accumulator.sourceStats[sourceLabel].wonDeals += 1
          accumulator.sourceStats[sourceLabel].wonRevenue += amount
        } else if (type === 'lost' && dealClosedInRange) {
          accumulator.lostDeals += 1
          accumulator.stageStats[stageLabel].lostDeals += 1
        } else if (type === 'open') {
          accumulator.openDeals += 1
          accumulator.openPipeline += amount
          accumulator.stageStats[stageLabel].openDeals += 1
          accumulator.stageStats[stageLabel].pipelineValue += amount
        }

        if ((type === 'won' || type === 'lost') && dealClosedInRange) {
          accumulator.closedDeals += 1
        }

        if (owner) {
          accumulator.sellerStats[owner.id] ||= {
            id: owner.id,
            name: owner.name,
            openDeals: 0,
            wonDeals: 0,
            lostDeals: 0,
            wonRevenue: 0,
          }

          if (type === 'won' && dealClosedInRange) {
            accumulator.sellerStats[owner.id].wonDeals += 1
            accumulator.sellerStats[owner.id].wonRevenue += amount
          } else if (type === 'lost' && dealClosedInRange) {
            accumulator.sellerStats[owner.id].lostDeals += 1
          } else if (type === 'open') {
            accumulator.sellerStats[owner.id].openDeals += 1
          }
        }

        return accumulator
      },
      {
        openDeals: 0,
        wonDeals: 0,
        lostDeals: 0,
        closedDeals: 0,
        createdDeals: 0,
        qualifiedDeals: 0,
        openPipeline: 0,
        wonRevenue: 0,
        sellerStats: {},
        sourceStats: {},
        stageStats: {},
        contactsWithDeals: new Set(),
        contactsWithQualifiedDeals: new Set(),
        contactsWithWonDeals: new Set(),
      }
    )

    const leadCount = contacts.length
    const leadCountInPeriod = contactsInPeriod.length
    const avgTicketWon = summary.wonDeals > 0 ? summary.wonRevenue / summary.wonDeals : 0
    const closeRate = summary.closedDeals > 0 ? (summary.wonDeals / summary.closedDeals) * 100 : 0
    const qualifiedToWonRate = summary.qualifiedDeals > 0 ? (summary.wonDeals / summary.qualifiedDeals) * 100 : 0
    const leadToQualifiedRate = leadCountInPeriod > 0 ? (summary.contactsWithQualifiedDeals.size / leadCountInPeriod) * 100 : 0
    const dealToWonRate = summary.createdDeals > 0 ? (summary.wonDeals / summary.createdDeals) * 100 : 0
    const leadToDealRate = leadCountInPeriod > 0 ? (summary.contactsWithDeals.size / leadCountInPeriod) * 100 : 0
    const leadToWonRate = leadCountInPeriod > 0 ? (summary.contactsWithWonDeals.size / leadCountInPeriod) * 100 : 0
    const avgLeadToWonDays = average(globalWonLeadToWonDays)
    const avgDealToWonDays = average(globalWonDealToWonDays)
    const avgLeadToWonDaysFiltered = average(wonLeadToWonDays)
    const avgDealToWonDaysFiltered = average(wonDealToWonDays)
    const sellers = Array.from(sellersMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const sellerRanking = Object.values(summary.sellerStats)
      .sort((a, b) => {
        if (b.wonRevenue !== a.wonRevenue) return b.wonRevenue - a.wonRevenue
        return b.wonDeals - a.wonDeals
      })
      .slice(0, 5)
    const sourceRanking = Object.values(summary.sourceStats)
      .sort((a, b) => {
        if (b.wonRevenue !== a.wonRevenue) return b.wonRevenue - a.wonRevenue
        return b.wonDeals - a.wonDeals
      })
      .slice(0, 8)
    const stageRanking = Object.values(summary.stageStats)
      .sort((a, b) => {
        if (b.pipelineValue !== a.pipelineValue) return b.pipelineValue - a.pipelineValue
        if (b.openDeals !== a.openDeals) return b.openDeals - a.openDeals
        return b.deals - a.deals
      })
      .slice(0, 8)

    return NextResponse.json({
      contacts: leadCount,
      contactsInPeriod: leadCountInPeriod,
      ...summary,
      avgTicketWon,
      closeRate,
      availableStages,
      qualifiedStages,
      qualifiedDeals: summary.qualifiedDeals,
      qualifiedContacts: summary.contactsWithQualifiedDeals.size,
      stageRanking,
      leadToQualifiedRate,
      qualifiedToWonRate,
      dealToWonRate,
      leadToDealRate,
      leadToWonRate,
      avgLeadToWonDays,
      avgDealToWonDays,
      avgLeadToWonDaysFiltered,
      avgDealToWonDaysFiltered,
      contactsWithDeals: summary.contactsWithDeals.size,
      contactsWithWonDeals: summary.contactsWithWonDeals.size,
      sellers,
      sellerRanking,
      sourceRanking,
      selectedSellerId,
    })
  } catch (error) {
    console.error('RD Station summary error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
