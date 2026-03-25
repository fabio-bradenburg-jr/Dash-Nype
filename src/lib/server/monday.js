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

function isOperationalDateColumn(column) {
  const normalizedTitle = String(column?.title || '').trim().toLowerCase()
  if (!normalizedTitle) return false
  return /(prazo|venc|due|deadline|entrega|delivery|final|fim|end date|data final)/i.test(normalizedTitle)
}

function isPriorityColumn(column) {
  const normalizedTitle = String(column?.title || '').trim().toLowerCase()
  if (!normalizedTitle) return false
  return /(priority|prioridade|urg[eê]ncia|criticidade|severity)/i.test(normalizedTitle)
}

function getPriorityRank(label) {
  const normalizedLabel = normalizeLabel(label)
  if (!normalizedLabel) return 0
  if (/(urgent|urgente|critical|critica|crítica|highest|p0|p1|alt[ií]ssima)/i.test(normalizedLabel)) return 5
  if (/(high|alta|alto|importante)/i.test(normalizedLabel)) return 4
  if (/(medium|media|m[eé]dia|medio|m[eé]dio|normal|moderad)/i.test(normalizedLabel)) return 3
  if (/(low|baixa|baixo|minor|menor)/i.test(normalizedLabel)) return 2
  return 1
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

function parseDateInput(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isDateWithinRange(date, start, end) {
  if (!date) return false
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseDurationText(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 0

  const matches = normalized.matchAll(/(\d+(?:[\.,]\d+)?)\s*(d|dia|dias|h|hr|hrs|hora|horas|m|min|mins|minuto|minutos|s|seg|segs|segundo|segundos)/g)

  let totalSeconds = 0

  for (const match of matches) {
    const amount = Number(String(match[1] || '0').replace(',', '.'))
    const unit = String(match[2] || '')
    if (!Number.isFinite(amount) || amount <= 0) continue

    if (/^d|dia/.test(unit)) totalSeconds += amount * 86400
    else if (/^h|hr|hora/.test(unit)) totalSeconds += amount * 3600
    else if (/^m|min/.test(unit)) totalSeconds += amount * 60
    else totalSeconds += amount
  }

  return Math.round(totalSeconds)
}

function parseTimeTrackingSession(entry) {
  if (!entry || typeof entry !== 'object') return null

  const start = parseMondayDate(
    entry.started_at
    || entry.startedAt
    || entry.start_date
    || entry.startDate
    || entry.from
    || entry.created_at
  )
  const end = parseMondayDate(
    entry.ended_at
    || entry.endedAt
    || entry.end_date
    || entry.endDate
    || entry.to
    || entry.updated_at
  )

  let durationSeconds = Number(
    entry.duration_seconds
    || entry.durationSeconds
    || entry.duration
    || entry.time_spent
    || entry.timeSpent
    || 0
  )

  if ((!Number.isFinite(durationSeconds) || durationSeconds <= 0) && start && end) {
    durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000)
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null

  const anchor = end || start

  return {
    start,
    end,
    anchor,
    durationSeconds,
  }
}

function extractTimeTrackingSummary(columnValuesById, timeTrackingColumns) {
  const summaries = timeTrackingColumns.map((column) => {
    const columnValue = columnValuesById.get(column.id)
    const raw = parseJson(columnValue?.value)
    const sessions = Array.isArray(raw?.history)
      ? raw.history.map(parseTimeTrackingSession).filter(Boolean)
      : Array.isArray(raw?.sessions)
        ? raw.sessions.map(parseTimeTrackingSession).filter(Boolean)
        : Array.isArray(raw?.activities)
          ? raw.activities.map(parseTimeTrackingSession).filter(Boolean)
          : []

    const totalFromSessions = sessions.reduce((sum, session) => sum + session.durationSeconds, 0)
    const totalFromRaw = Number(
      raw?.duration
      || raw?.duration_seconds
      || raw?.time_spent
      || raw?.timeSpent
      || 0
    )
    const totalFromText = parseDurationText(columnValue?.text)

    return {
      totalSeconds: Math.max(totalFromSessions, Number.isFinite(totalFromRaw) ? totalFromRaw : 0, totalFromText),
      sessions,
    }
  })

  return {
    totalSeconds: summaries.reduce((sum, summary) => sum + summary.totalSeconds, 0),
    sessions: summaries.flatMap((summary) => summary.sessions),
  }
}

function getSessionDurationInRange(session, start, end) {
  if (!session?.durationSeconds) return 0
  if (!start && !end) return session.durationSeconds

  const anchor = session.anchor || session.end || session.start
  if (!anchor) return 0

  if (!session.start || !session.end || session.end <= session.start) {
    return isDateWithinRange(anchor, start, end) ? session.durationSeconds : 0
  }

  const sessionStart = session.start.getTime()
  const sessionEnd = session.end.getTime()
  const rangeStart = start ? start.getTime() : Number.NEGATIVE_INFINITY
  const rangeEnd = end ? end.getTime() : Number.POSITIVE_INFINITY

  const overlapStart = Math.max(sessionStart, rangeStart)
  const overlapEnd = Math.min(sessionEnd, rangeEnd)

  if (overlapEnd <= overlapStart) return 0

  const totalSpan = sessionEnd - sessionStart
  if (totalSpan <= 0) return 0

  const overlapRatio = (overlapEnd - overlapStart) / totalSpan
  return Math.round(session.durationSeconds * overlapRatio)
}

function getWeekStart(date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff))
}

function getWeekEnd(date) {
  const weekStart = getWeekStart(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return endOfDay(weekEnd)
}

function formatWeekLabel(start, end) {
  const startLabel = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  const endLabel = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${startLabel} - ${endLabel}`
}

function buildWeeklyBuckets(start, end) {
  if (!start || !end) return []

  const buckets = []
  let cursor = getWeekStart(start)

  while (cursor <= end) {
    const bucketStart = new Date(cursor)
    const bucketEnd = getWeekEnd(cursor)
    buckets.push({
      id: bucketStart.toISOString(),
      start: bucketStart,
      end: bucketEnd,
      label: formatWeekLabel(bucketStart, bucketEnd),
      seconds: 0,
      tasksWithTime: 0,
      taskIds: new Set(),
    })

    cursor = new Date(bucketStart)
    cursor.setDate(cursor.getDate() + 7)
  }

  return buckets
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

export async function readMondaySummary({ token, boardIds, since, until, owner }) {
  const trimmedToken = String(token || '').trim()
  if (!trimmedToken) {
    throw new Error('Informe o token do Monday para ler os dados da operação.')
  }

  const normalizedBoardIds = parseCommaSeparatedIds(boardIds)
  if (!normalizedBoardIds.length) {
    throw new Error('Informe ao menos um ID de board do Monday na configuração global da operação.')
  }

  const parsedSince = parseDateInput(since) || parseMondayDate(since)
  const parsedUntil = parseDateInput(until) || parseMondayDate(until)
  const windowStart = parsedSince ? startOfDay(parsedSince) : null
  const windowEnd = parsedUntil ? endOfDay(parsedUntil) : null
  const ownerFilter = normalizeLabel(owner)

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
  const overdueReferenceDate = windowEnd || new Date()
  const nextWeek = new Date(overdueReferenceDate)
  nextWeek.setDate(nextWeek.getDate() + 7)

  let doneItems = 0
  let blockedItems = 0
  let overdueItems = 0
  let dueSoonItems = 0
  let unassignedItems = 0
  let trackedSecondsTotal = 0

  const statusCounts = new Map()
  const ownerCounts = new Map()
  const boardCounts = new Map()
  const groupCounts = new Map()
  const ownerOptions = new Map()
  const overdueTasks = []
  const longestTasks = []
  const taskCatalog = []
  const weeklyBuckets = buildWeeklyBuckets(windowStart, windowEnd)
  const weeksWithTimeIds = new Set()

  weeklyBuckets.forEach((bucket) => {
    bucket.ownerSeconds = new Map()
  })

  dedupedItems.forEach((item) => {
    const boardColumns = Array.isArray(item.__columns) ? item.__columns : []
    const statusColumn = boardColumns.find((column) => column.type === 'color')
      || boardColumns.find((column) => /status|etapa|pipeline|fase/i.test(column.title || ''))
    const dateColumn = boardColumns.find((column) => column.type === 'date' && isOperationalDateColumn(column))
      || boardColumns.find((column) => column.type === 'date')
    const priorityColumn = boardColumns.find((column) => isPriorityColumn(column))
    const peopleColumns = boardColumns.filter((column) => /person|people/i.test(column.type || ''))
    const timeTrackingColumns = boardColumns.filter((column) => /time_tracking|timer/i.test(column.type || ''))

    const columnValuesById = new Map(
      (Array.isArray(item.column_values) ? item.column_values : []).map((columnValue) => [columnValue.id, columnValue])
    )

    const statusLabel = String(columnValuesById.get(statusColumn?.id)?.text || '').trim() || 'Sem status'
    const priorityLabel = String(columnValuesById.get(priorityColumn?.id)?.text || '').trim()
    const dueDate = parseMondayDate(columnValuesById.get(dateColumn?.id)?.value || columnValuesById.get(dateColumn?.id)?.text || '')
    const ownerNames = peopleColumns.flatMap((column) => extractPeopleNames(columnValuesById.get(column.id)))
    const normalizedOwners = ownerNames.map((name) => normalizeLabel(name)).filter(Boolean)
    const done = isDoneStatus(statusLabel)
    const blocked = isBlockedStatus(statusLabel)
    const updatedAt = parseMondayDate(item.updated_at)
    const timeTracking = extractTimeTrackingSummary(columnValuesById, timeTrackingColumns)
    const trackedSecondsInRange = timeTracking.sessions.length
      ? timeTracking.sessions.reduce((sum, session) => sum + getSessionDurationInRange(session, windowStart, windowEnd), 0)
      : ((!windowStart && !windowEnd) || isDateWithinRange(updatedAt, windowStart, windowEnd) ? timeTracking.totalSeconds : 0)
    const shouldKeepInOperationalSnapshot = !done
    const matchesDateWindow = !windowStart && !windowEnd
      ? true
      : (
          shouldKeepInOperationalSnapshot
          || isDateWithinRange(updatedAt, windowStart, windowEnd)
          || isDateWithinRange(dueDate, windowStart, windowEnd)
          || trackedSecondsInRange > 0
        )
    const matchesOwnerFilter = !ownerFilter || normalizedOwners.includes(ownerFilter)

    ownerNames.forEach((name) => {
      const normalized = normalizeLabel(name)
      if (!normalized) return
      if (!ownerOptions.has(normalized)) {
        ownerOptions.set(normalized, name)
      }
    })

    if (!matchesDateWindow || !matchesOwnerFilter) {
      return
    }

    const isOverdue = !done && Boolean(dueDate && dueDate < overdueReferenceDate)
    const isDueSoon = !done && Boolean(dueDate && dueDate >= overdueReferenceDate && dueDate <= nextWeek)
    const isUnassigned = ownerNames.length === 0
    const groupLabel = String(item?.group?.title || 'Sem grupo')

    taskCatalog.push({
      id: item.id,
      name: item.name,
      boardName: item.__boardName,
      groupLabel,
      statusLabel,
      priorityLabel,
      priorityRank: getPriorityRank(priorityLabel),
      owners: ownerNames,
      dueDate: dueDate?.toISOString() || '',
      updatedAt: updatedAt?.toISOString() || '',
      trackedSeconds: trackedSecondsInRange,
      daysOverdue: isOverdue ? Math.max(1, Math.round((overdueReferenceDate.getTime() - dueDate.getTime()) / 86400000)) : 0,
      isDone: done,
      isBlocked: blocked,
      isOverdue,
      isDueSoon,
      isUnassigned,
    })

    statusCounts.set(statusLabel, (statusCounts.get(statusLabel) || 0) + 1)

    const currentBoardSummary = boardCounts.get(item.__boardName) || {
      label: item.__boardName,
      totalItems: 0,
      doneCount: 0,
      blockedCount: 0,
      overdueCount: 0,
    }
    currentBoardSummary.totalItems += 1

    const currentGroupSummary = groupCounts.get(groupLabel) || {
      label: groupLabel,
      totalItems: 0,
      doneCount: 0,
      blockedCount: 0,
      overdueCount: 0,
    }
    currentGroupSummary.totalItems += 1

    trackedSecondsTotal += trackedSecondsInRange

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

    if (isUnassigned) {
      unassignedItems += 1
    } else {
      ownerNames.forEach((name) => {
        const current = ownerCounts.get(name) || {
          name,
          totalItems: 0,
          openItems: 0,
          doneItems: 0,
          overdueItems: 0,
          trackedSeconds: 0,
          overdueTasks: [],
        }

        current.totalItems += 1
        if (done) current.doneItems += 1
        else current.openItems += 1
        if (isOverdue) {
          current.overdueItems += 1
          current.overdueTasks.push({
            id: item.id,
            name: item.name,
            dueDate: dueDate?.toISOString() || '',
            statusLabel,
          })
        }
        current.trackedSeconds += trackedSecondsInRange

        ownerCounts.set(name, current)
      })
    }

    if (!done && dueDate) {
      if (isOverdue) {
        overdueItems += 1
        currentBoardSummary.overdueCount += 1
        currentGroupSummary.overdueCount += 1
        overdueTasks.push({
          id: item.id,
          name: item.name,
          boardName: item.__boardName,
          groupLabel,
          statusLabel,
          owners: ownerNames,
          dueDate: dueDate.toISOString(),
          trackedSeconds: trackedSecondsInRange,
          daysOverdue: Math.max(1, Math.round((overdueReferenceDate.getTime() - dueDate.getTime()) / 86400000)),
        })
      }
      if (isDueSoon) dueSoonItems += 1
    }

    if (trackedSecondsInRange > 0) {
      longestTasks.push({
        id: item.id,
        name: item.name,
        boardName: item.__boardName,
        groupLabel,
        statusLabel,
        owners: ownerNames,
        trackedSeconds: trackedSecondsInRange,
        dueDate: dueDate?.toISOString() || '',
        updatedAt: updatedAt?.toISOString() || '',
      })
    }

    timeTracking.sessions.forEach((session) => {
      const anchor = session.anchor || session.end || session.start
      if (!anchor || !isDateWithinRange(anchor, windowStart, windowEnd)) return
      const bucket = weeklyBuckets.find((itemBucket) => anchor >= itemBucket.start && anchor <= itemBucket.end)
      if (!bucket) return
      const seconds = getSessionDurationInRange(session, windowStart, windowEnd)
      if (seconds <= 0) return
      bucket.seconds += seconds
      bucket.taskIds.add(item.id)
      weeksWithTimeIds.add(bucket.id)

      const sessionOwners = ownerNames.length ? ownerNames : ['Sem responsável']
      const splitSeconds = Math.round(seconds / sessionOwners.length)

      sessionOwners.forEach((name, index) => {
        const currentSeconds = bucket.ownerSeconds.get(name) || 0
        const allocatedSeconds = index === sessionOwners.length - 1
          ? Math.max(seconds - splitSeconds * (sessionOwners.length - 1), 0)
          : splitSeconds
        bucket.ownerSeconds.set(name, currentSeconds + allocatedSeconds)
      })
    })

    boardCounts.set(item.__boardName, currentBoardSummary)
    groupCounts.set(groupLabel, currentGroupSummary)
  })

  weeklyBuckets.forEach((bucket) => {
    bucket.tasksWithTime = bucket.taskIds.size
    delete bucket.taskIds
  })

  const averageWeeklySeconds = weeklyBuckets.length
    ? weeklyBuckets.reduce((sum, bucket) => sum + bucket.seconds, 0) / weeklyBuckets.length
    : 0
  const filteredTotalItems = Array.from(statusCounts.values()).reduce((sum, count) => sum + count, 0)

  const topStatus = Array.from(statusCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'))[0] || null

  const topOverdueOwner = Array.from(ownerCounts.values())
    .sort((left, right) => right.overdueItems - left.overdueItems || right.totalItems - left.totalItems || left.name.localeCompare(right.name, 'pt-BR'))[0] || null

  const topLongestTask = [...longestTasks]
    .sort((left, right) => right.trackedSeconds - left.trackedSeconds || left.name.localeCompare(right.name, 'pt-BR'))[0] || null

  return {
    boardsConfigured: normalizedBoardIds.length,
    totalItems: filteredTotalItems,
    activeItems: Math.max(filteredTotalItems - doneItems, 0),
    doneItems,
    blockedItems,
    overdueItems,
    dueSoonItems,
    unassignedItems,
    trackedSecondsTotal,
    averageWeeklySeconds,
    activeOwnersCount: ownerCounts.size,
    selectedWindow: {
      since: windowStart ? windowStart.toISOString() : '',
      until: windowEnd ? windowEnd.toISOString() : '',
    },
    availableOwners: Array.from(ownerOptions.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR')),
    topStatus,
    topOverdueOwner: topOverdueOwner && topOverdueOwner.overdueItems > 0
      ? {
          name: topOverdueOwner.name,
          overdueItems: topOverdueOwner.overdueItems,
          totalItems: topOverdueOwner.totalItems,
        }
      : null,
    topLongestTask: topLongestTask
      ? {
          name: topLongestTask.name,
          trackedSeconds: topLongestTask.trackedSeconds,
        }
      : null,
    statusSummary: {
      counts: Array.from(statusCounts.entries())
        .map(([label, count], index) => ({
          id: `monday-status-${index + 1}`,
          label,
          count,
          share: filteredTotalItems > 0 ? count / filteredTotalItems : 0,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR')),
    },
    ownerRanking: Array.from(ownerCounts.values())
      .map((item, index) => ({
        id: `monday-owner-${index + 1}`,
        label: item.name,
        totalItems: item.totalItems,
        openItems: item.openItems,
        doneItems: item.doneItems,
        overdueCount: item.overdueItems,
        trackedSeconds: item.trackedSeconds,
        overdueTasks: item.overdueTasks
          .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
          .slice(0, 5),
      }))
      .sort((left, right) => right.overdueCount - left.overdueCount || right.totalItems - left.totalItems || left.label.localeCompare(right.label, 'pt-BR')),
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
    overdueTasks: overdueTasks
      .sort((left, right) => right.daysOverdue - left.daysOverdue || right.trackedSeconds - left.trackedSeconds || left.name.localeCompare(right.name, 'pt-BR')),
    longestTasks: longestTasks
      .sort((left, right) => right.trackedSeconds - left.trackedSeconds || left.name.localeCompare(right.name, 'pt-BR')),
    weeklyTrackedTime: weeklyBuckets.map((bucket, index) => ({
      id: `monday-week-${index + 1}`,
      label: bucket.label,
      seconds: bucket.seconds,
      tasksWithTime: bucket.tasksWithTime,
      ownerBreakdown: Array.from(bucket.ownerSeconds.entries())
        .map(([owner, seconds]) => ({
          owner,
          seconds,
        }))
        .sort((left, right) => right.seconds - left.seconds || left.owner.localeCompare(right.owner, 'pt-BR')),
    })),
    taskCatalog: taskCatalog
      .sort((left, right) => {
        if (left.isOverdue !== right.isOverdue) return Number(right.isOverdue) - Number(left.isOverdue)
        if (left.isBlocked !== right.isBlocked) return Number(right.isBlocked) - Number(left.isBlocked)
        if ((right.trackedSeconds || 0) !== (left.trackedSeconds || 0)) return (right.trackedSeconds || 0) - (left.trackedSeconds || 0)
        return left.name.localeCompare(right.name, 'pt-BR')
      }),
  }
}
