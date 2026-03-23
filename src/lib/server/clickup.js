const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2'

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

function parseClickUpTimestamp(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null

  const date = new Date(numericValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function isClosedStatus(status) {
  const type = String(status?.type || '').toLowerCase()
  const label = String(status?.status || '').toLowerCase()

  return (
    type === 'closed'
    || /(done|complete|completed|conclu|finaliz|encerr|closed|aprovado|resolvido)/i.test(label)
  )
}

function isBlockedStatus(status) {
  const label = String(status?.status || '').toLowerCase()
  return /(blocked|bloque|travado|imped|stuck|hold)/i.test(label)
}

function isInProgressStatus(status) {
  if (isClosedStatus(status) || isBlockedStatus(status)) return false
  const label = String(status?.status || '').toLowerCase()
  return /(progress|andamento|doing|exec|review|qa|teste|produção|producao|desenvolvimento)/i.test(label)
}

function formatStatusLabel(status) {
  return String(status?.status || '').trim() || 'Sem status'
}

function createAssigneeSummary(name) {
  return {
    name,
    totalTasks: 0,
    openTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
  }
}

async function requestClickUp(token, path, searchParams = {}) {
  const url = new URL(`${CLICKUP_API_BASE}${path}`)

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.err || data?.error || 'Não foi possível consultar o ClickUp.')
  }

  return data
}

async function fetchTasksForList(token, listId) {
  const tasks = []

  for (let page = 0; page < 20; page += 1) {
    const data = await requestClickUp(token, `/list/${listId}/task`, {
      archived: 'false',
      include_closed: 'true',
      subtasks: 'true',
      page,
    })

    const pageTasks = Array.isArray(data?.tasks) ? data.tasks : []
    tasks.push(...pageTasks)

    if (data?.last_page === true || pageTasks.length === 0) {
      break
    }
  }

  return tasks.map((task) => ({
    ...task,
    __listId: task?.list?.id || listId,
    __listName: task?.list?.name || `Lista ${listId}`,
  }))
}

export async function readClickUpSummary({ token, listIds }) {
  const trimmedToken = String(token || '').trim()
  if (!trimmedToken) {
    throw new Error('Informe o token do ClickUp para ler os dados da operação.')
  }

  const normalizedListIds = parseCommaSeparatedIds(listIds)
  if (!normalizedListIds.length) {
    throw new Error('Informe ao menos um ID de lista do ClickUp neste cliente.')
  }

  const allTasks = (
    await Promise.all(normalizedListIds.map((listId) => fetchTasksForList(trimmedToken, listId)))
  ).flat()

  const dedupedTasks = Array.from(
    new Map(allTasks.map((task) => [task.id, task])).values()
  )

  const now = new Date()
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)

  let completedTasks = 0
  let blockedTasks = 0
  let inProgressTasks = 0
  let overdueTasks = 0
  let dueSoonTasks = 0
  let unassignedTasks = 0
  let tasksWithoutDueDate = 0

  const statusCounts = new Map()
  const assigneeCounts = new Map()
  const listCounts = new Map()

  dedupedTasks.forEach((task) => {
    const closed = isClosedStatus(task?.status)
    const blocked = isBlockedStatus(task?.status)
    const inProgress = isInProgressStatus(task?.status)
    const dueDate = parseClickUpTimestamp(task?.due_date)
    const assignees = Array.isArray(task?.assignees) ? task.assignees : []
    const statusLabel = formatStatusLabel(task?.status)
    const listLabel = String(task?.__listName || '').trim() || `Lista ${task?.__listId || ''}`

    statusCounts.set(statusLabel, (statusCounts.get(statusLabel) || 0) + 1)
    listCounts.set(listLabel, (listCounts.get(listLabel) || 0) + 1)

    if (closed) completedTasks += 1
    if (blocked) blockedTasks += 1
    if (inProgress) inProgressTasks += 1

    if (!dueDate) {
      tasksWithoutDueDate += 1
    } else if (!closed) {
      if (dueDate < now) overdueTasks += 1
      if (dueDate >= now && dueDate <= nextWeek) dueSoonTasks += 1
    }

    if (!assignees.length) {
      unassignedTasks += 1
    } else {
      assignees.forEach((assignee) => {
        const label = String(assignee?.username || assignee?.email || assignee?.initials || assignee?.id || 'Sem nome').trim()
        const current = assigneeCounts.get(label) || createAssigneeSummary(label)
        current.totalTasks += 1
        if (closed) current.completedTasks += 1
        else current.openTasks += 1
        if (!closed && dueDate && dueDate < now) current.overdueTasks += 1
        assigneeCounts.set(label, current)
      })
    }
  })

  return {
    listsConfigured: normalizedListIds.length,
    totalTasks: dedupedTasks.length,
    openTasks: Math.max(dedupedTasks.length - completedTasks, 0),
    completedTasks,
    blockedTasks,
    inProgressTasks,
    overdueTasks,
    dueSoonTasks,
    unassignedTasks,
    tasksWithoutDueDate,
    statusSummary: {
      counts: Array.from(statusCounts.entries())
        .map(([label, count], index) => ({
          id: `clickup-status-${index + 1}`,
          label,
          count,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR')),
    },
    assigneeRanking: Array.from(assigneeCounts.values())
      .sort((left, right) => right.totalTasks - left.totalTasks || left.name.localeCompare(right.name, 'pt-BR'))
      .slice(0, 8),
    listSummary: Array.from(listCounts.entries())
      .map(([label, totalTasks], index) => ({
        id: `clickup-list-${index + 1}`,
        label,
        totalTasks,
      }))
      .sort((left, right) => right.totalTasks - left.totalTasks || left.label.localeCompare(right.label, 'pt-BR'))
      .slice(0, 8),
  }
}
