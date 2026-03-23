const MONDAY_API_URL = 'https://api.monday.com/v2'

function parseCommaSeparatedIds(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function isDoneStatus(label) {
  const normalizedLabel = String(label || '').toLowerCase()
  return /(done|complete|completed|conclu|finaliz|encerr|closed|aprovado|ganho|feito)/i.test(normalizedLabel)
}

function isBlockedStatus(label) {
  const normalizedLabel = String(label || '').toLowerCase()
  return /(blocked|bloque|travado|stuck|imped|hold)/i.test(normalizedLabel)
}

function parseMondayDate(value) {
  if (!value) return null

  const directDate = new Date(value)
  if (!Number.isNaN(directDate.getTime())) return directDate

  try {
    const parsed = JSON.parse(value)
    const rawDate = parsed?.date || parsed?.from
    if (!rawDate) return null
    const nextDate = new Date(rawDate)
    return Number.isNaN(nextDate.getTime()) ? null : nextDate
  } catch {
    return null
  }
}

function extractPeopleNames(columnValue) {
  const text = String(columnValue?.text || '').trim()
  if (!text) return []

  return Array.from(
    new Set(
      text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

async function requestMonday(token, query, variables = {}) {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      API_Version: '2025-01',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error_message || payload?.errors?.[0]?.message || 'Não foi possível consultar o Monday.')
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message || 'A API do Monday respondeu com erro.')
  }

  return payload?.data || {}
}

const ITEM_FIELDS = `
  id
  name
  state
  updated_at
  group {
    id
    title
  }
  column_values {
    id
    type
    text
    value
  }
`

async function fetchBoardItems(token, boardId) {
  const boardQuery = `
    query ($boardIds: [ID!]) {
      boards(ids: $boardIds) {
        id
        name
        columns {
          id
          title
          type
        }
        items_page(limit: 500) {
          cursor
          items {
            ${ITEM_FIELDS}
          }
        }
      }
    }
  `

  const boardData = await requestMonday(token, boardQuery, { boardIds: [boardId] })
  const board = Array.isArray(boardData?.boards) ? boardData.boards[0] : null

  if (!board) {
    throw new Error(`O board ${boardId} não foi encontrado no Monday.`)
  }

  const items = Array.isArray(board?.items_page?.items) ? [...board.items_page.items] : []
  let cursor = board?.items_page?.cursor || null

  const nextItemsQuery = `
    query ($cursor: String!) {
      next_items_page(limit: 500, cursor: $cursor) {
        cursor
        items {
          ${ITEM_FIELDS}
        }
      }
    }
  `

  for (let iteration = 0; cursor && iteration < 8; iteration += 1) {
    const nextData = await requestMonday(token, nextItemsQuery, { cursor })
    const page = nextData?.next_items_page
    const pageItems = Array.isArray(page?.items) ? page.items : []
    items.push(...pageItems)
    cursor = page?.cursor || null
  }

  return {
    id: String(board.id),
    name: String(board.name || `Board ${boardId}`),
    columns: Array.isArray(board.columns) ? board.columns : [],
    items,
  }
}

export async function readMondaySummary({ token, boardIds }) {
  const trimmedToken = String(token || '').trim()
  if (!trimmedToken) {
    throw new Error('Informe o token do Monday para ler os dados da operação.')
  }

  const normalizedBoardIds = parseCommaSeparatedIds(boardIds)
  if (!normalizedBoardIds.length) {
    throw new Error('Informe ao menos um ID de board do Monday na configuração global da operação.')
  }

  const boards = await Promise.all(normalizedBoardIds.map((boardId) => fetchBoardItems(trimmedToken, boardId)))
  const allItems = boards.flatMap((board) =>
    board.items.map((item) => ({
      ...item,
      __boardId: board.id,
      __boardName: board.name,
      __columns: board.columns,
    }))
  )

  const dedupedItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())
  const now = new Date()
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)

  let doneItems = 0
  let blockedItems = 0
  let overdueItems = 0
  let dueSoonItems = 0
  let unassignedItems = 0

  const statusCounts = new Map()
  const ownerCounts = new Map()
  const boardCounts = new Map()
  const groupCounts = new Map()

  dedupedItems.forEach((item) => {
    const boardColumns = Array.isArray(item.__columns) ? item.__columns : []
    const statusColumn = boardColumns.find((column) => column.type === 'color')
      || boardColumns.find((column) => /status|etapa|pipeline|fase/i.test(column.title || ''))
    const dateColumn = boardColumns.find((column) => column.type === 'date')
    const peopleColumns = boardColumns.filter((column) => /person|people/i.test(column.type || ''))

    const columnValuesById = new Map(
      (Array.isArray(item.column_values) ? item.column_values : []).map((columnValue) => [columnValue.id, columnValue])
    )

    const statusLabel = String(columnValuesById.get(statusColumn?.id)?.text || '').trim() || 'Sem status'
    const dueDate = parseMondayDate(columnValuesById.get(dateColumn?.id)?.value || columnValuesById.get(dateColumn?.id)?.text || '')
    const ownerNames = peopleColumns.flatMap((column) => extractPeopleNames(columnValuesById.get(column.id)))
    const done = isDoneStatus(statusLabel)
    const blocked = isBlockedStatus(statusLabel)

    statusCounts.set(statusLabel, (statusCounts.get(statusLabel) || 0) + 1)

    const currentBoardSummary = boardCounts.get(item.__boardName) || {
      label: item.__boardName,
      totalItems: 0,
      doneCount: 0,
      blockedCount: 0,
      overdueCount: 0,
    }
    currentBoardSummary.totalItems += 1

    const groupLabel = String(item?.group?.title || 'Sem grupo')
    const currentGroupSummary = groupCounts.get(groupLabel) || {
      label: groupLabel,
      totalItems: 0,
      doneCount: 0,
      blockedCount: 0,
      overdueCount: 0,
    }
    currentGroupSummary.totalItems += 1

    if (done) doneItems += 1
    if (blocked) blockedItems += 1
    if (done) {
      currentBoardSummary.doneCount += 1
      currentGroupSummary.doneCount += 1
    }
    if (blocked) {
      currentBoardSummary.blockedCount += 1
      currentGroupSummary.blockedCount += 1
    }

    if (!ownerNames.length) {
      unassignedItems += 1
    } else {
      ownerNames.forEach((name) => {
        const current = ownerCounts.get(name) || {
          name,
          totalItems: 0,
          openItems: 0,
          doneItems: 0,
          overdueItems: 0,
        }

        current.totalItems += 1
        if (done) current.doneItems += 1
        else current.openItems += 1
        if (!done && dueDate && dueDate < now) current.overdueItems += 1

        ownerCounts.set(name, current)
      })
    }

    if (!done && dueDate) {
      if (dueDate < now) {
        overdueItems += 1
        currentBoardSummary.overdueCount += 1
        currentGroupSummary.overdueCount += 1
      }
      if (dueDate >= now && dueDate <= nextWeek) dueSoonItems += 1
    }

    boardCounts.set(item.__boardName, currentBoardSummary)
    groupCounts.set(groupLabel, currentGroupSummary)
  })

  return {
    boardsConfigured: normalizedBoardIds.length,
    totalItems: dedupedItems.length,
    activeItems: Math.max(dedupedItems.length - doneItems, 0),
    doneItems,
    blockedItems,
    overdueItems,
    dueSoonItems,
    unassignedItems,
    statusSummary: {
      counts: Array.from(statusCounts.entries())
        .map(([label, count], index) => ({
          id: `monday-status-${index + 1}`,
          label,
          count,
          share: dedupedItems.length > 0 ? count / dedupedItems.length : 0,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR')),
    },
    ownerRanking: Array.from(ownerCounts.values())
      .sort((left, right) => right.totalItems - left.totalItems || left.name.localeCompare(right.name, 'pt-BR'))
      .slice(0, 8),
    boardSummary: Array.from(boardCounts.values())
      .map((item, index) => ({
        id: `monday-board-${index + 1}`,
        ...item,
      }))
      .sort((left, right) => right.totalItems - left.totalItems || left.label.localeCompare(right.label, 'pt-BR'))
      .slice(0, 8),
    groupSummary: Array.from(groupCounts.values())
      .map((item, index) => ({
        id: `monday-group-${index + 1}`,
        ...item,
      }))
      .sort((left, right) => right.totalItems - left.totalItems || left.label.localeCompare(right.label, 'pt-BR'))
      .slice(0, 8),
  }
}
