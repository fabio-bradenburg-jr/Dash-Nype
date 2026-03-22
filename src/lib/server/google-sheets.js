function normalizeHeaderLabel(value, index) {
  const trimmed = String(value || '').trim()
  return trimmed || `Coluna ${index + 1}`
}

function toMetricKey(label, index) {
  const normalized = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `sheet-col-${normalized || 'coluna'}-${index + 1}`
}

function slugifyLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function detectDelimiter(text) {
  const candidates = [',', ';', '\t']
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)

  if (!lines.length) return ','

  const scores = candidates.map((delimiter) => {
    const counts = lines.map((line) => {
      let insideQuotes = false
      let count = 0

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index]
        const nextChar = line[index + 1]

        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            index += 1
          } else {
            insideQuotes = !insideQuotes
          }
          continue
        }

        if (char === delimiter && !insideQuotes) {
          count += 1
        }
      }

      return count
    })

    const linesWithDelimiter = counts.filter((count) => count > 0).length
    const totalCount = counts.reduce((sum, count) => sum + count, 0)

    return {
      delimiter,
      linesWithDelimiter,
      totalCount,
    }
  })

  scores.sort((left, right) => (
    right.linesWithDelimiter - left.linesWithDelimiter
    || right.totalCount - left.totalCount
  ))

  return scores[0]?.linesWithDelimiter > 0 ? scores[0].delimiter : ','
}

function parseDelimitedText(text, delimiter = ',') {
  const rows = []
  let currentCell = ''
  let currentRow = []
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }

      currentRow.push(currentCell)
      rows.push(currentRow)
      currentCell = ''
      currentRow = []
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
    .map((row) => row.map((cell) => String(cell || '').trim()))
    .filter((row) => row.some((cell) => cell !== ''))
}

function parsePossibleNumber(value) {
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw) return null

  let normalized = raw
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/US\$/gi, '')
    .replace(/€/gi, '')
    .replace(/£/gi, '')
    .replace(/%/g, '')

  if (!/[0-9]/.test(normalized)) return null

  const hasComma = normalized.includes(',')
  const hasDot = normalized.includes('.')

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasComma) {
    const parts = normalized.split(',')
    const decimalPart = parts[parts.length - 1]
    if (decimalPart.length === 2 || decimalPart.length === 1) {
      normalized = `${parts.slice(0, -1).join('')}.${decimalPart}`
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  }

  normalized = normalized.replace(/[^0-9.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.') return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function inferMetricType(label, sampleValues) {
  const normalizedLabel = String(label || '').toLowerCase()

  if (/(taxa|percent|percentual|ctr|convers[aã]o %)/i.test(normalizedLabel)) return 'percent'
  if (/(roas|roi|multiplicador)/i.test(normalizedLabel)) return 'multiplier'
  if (/(receita|faturamento|valor|ticket|investimento|custo|pre[cç]o|venda)/i.test(normalizedLabel)) return 'currency'

  const hasDecimal = sampleValues.some((value) => !Number.isInteger(value))
  return hasDecimal ? 'decimal' : 'number'
}

function findStatusColumnIndex(headers, requestedStatusColumn) {
  const normalizedRequested = String(requestedStatusColumn || '').trim().toLowerCase()

  if (normalizedRequested) {
    const exactIndex = headers.findIndex((header) => header.toLowerCase() === normalizedRequested)
    if (exactIndex >= 0) return exactIndex

    const includesIndex = headers.findIndex((header) => header.toLowerCase().includes(normalizedRequested))
    if (includesIndex >= 0) return includesIndex
  }

  return headers.findIndex((header) => /(status|etapa|pipeline|fase|coluna)/i.test(header))
}

function countFilledCells(row = []) {
  return row.filter((cell) => String(cell || '').trim() !== '').length
}

function resolveHeaderIndex(rows, requestedHeaderIndex) {
  const safeRequestedIndex = Math.max(0, requestedHeaderIndex)

  if (rows.length <= safeRequestedIndex + 1) {
    const detectedIndex = rows
      .slice(0, Math.max(0, rows.length - 1))
      .reduce((bestIndex, row, index, allRows) => {
        const currentScore = countFilledCells(row)
        const bestScore = countFilledCells(allRows[bestIndex] || [])
        return currentScore > bestScore ? index : bestIndex
      }, 0)

    return detectedIndex
  }

  const requestedRowScore = countFilledCells(rows[safeRequestedIndex] || [])
  const nextRowScore = countFilledCells(rows[safeRequestedIndex + 1] || [])

  if (requestedRowScore > 1 && nextRowScore > 0) {
    return safeRequestedIndex
  }

  const detectedIndex = rows
    .slice(0, Math.max(0, rows.length - 1))
    .reduce((bestIndex, row, index, allRows) => {
      const currentScore = countFilledCells(row)
      const currentNextScore = countFilledCells(allRows[index + 1] || [])
      const bestScore = countFilledCells(allRows[bestIndex] || [])
      const bestNextScore = countFilledCells(allRows[bestIndex + 1] || [])

      const currentComposite = currentScore + Math.min(currentNextScore, currentScore)
      const bestComposite = bestScore + Math.min(bestNextScore, bestScore)

      return currentComposite > bestComposite ? index : bestIndex
    }, safeRequestedIndex)

  return detectedIndex
}

function extractGoogleSheetId(input) {
  const trimmed = String(input || '').trim()
  const directMatch = trimmed.match(/^[a-zA-Z0-9-_]{20,}$/)
  if (directMatch) return trimmed

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return idMatch?.[1] || ''
}

function extractGoogleSheetGid(input) {
  const trimmed = String(input || '').trim()
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/)
  return gidMatch?.[1] || '0'
}

function buildGoogleSheetsCsvUrl(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) {
    throw new Error('Informe a URL da planilha do Google Sheets.')
  }

  if (/^https?:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/i.test(trimmed)) {
    return trimmed
  }

  const sheetId = extractGoogleSheetId(trimmed)
  if (!sheetId) {
    throw new Error('Não foi possível identificar a planilha do Google Sheets. Cole a URL completa ou o ID da planilha.')
  }

  const gid = extractGoogleSheetGid(trimmed)
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

export async function readGoogleSheetSummary({ sourceUrl, headerRow = 1, statusColumn = '' }) {
  const csvUrl = buildGoogleSheetsCsvUrl(sourceUrl)

  const response = await fetch(csvUrl, {
    cache: 'no-store',
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error('Não foi possível ler a planilha. Verifique se ela está publicada ou compartilhada para leitura.')
  }

  if (!text.trim()) {
    throw new Error('A planilha retornou vazia.')
  }

  if (/<!doctype html/i.test(text) || /<html/i.test(text)) {
    throw new Error('A planilha não está pública para leitura. Publique ou compartilhe o Google Sheets para que o app consiga importar os dados.')
  }

  const detectedDelimiter = detectDelimiter(text)
  const rows = parseDelimitedText(text, detectedDelimiter)
  const requestedHeaderIndex = Math.max(0, Number(headerRow || 1) - 1)
  const headerIndex = resolveHeaderIndex(rows, requestedHeaderIndex)

  if (rows.length <= headerIndex) {
    throw new Error('A linha de cabeçalho informada não existe na planilha.')
  }

  const rawHeaders = rows[headerIndex]
  const headers = rawHeaders.map((header, index) => normalizeHeaderLabel(header, index))
  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))

  const previewRows = dataRows.slice(0, 12).map((row, rowIndex) => ({
    id: `row-${rowIndex + 1}`,
    cells: headers.map((header, columnIndex) => ({
      key: `${header}-${columnIndex}`,
      header,
      value: row[columnIndex] || '',
    })),
  }))

  const numericColumns = headers
    .map((header, columnIndex) => {
      const parsedValues = dataRows
        .map((row) => parsePossibleNumber(row[columnIndex]))
        .filter((value) => value !== null)

      if (!parsedValues.length) return null

      const sum = parsedValues.reduce((total, value) => total + value, 0)
      const avg = sum / parsedValues.length
      const min = Math.min(...parsedValues)
      const max = Math.max(...parsedValues)
      const last = parsedValues[parsedValues.length - 1]

      return {
        id: toMetricKey(header, columnIndex),
        header,
        type: inferMetricType(header, parsedValues),
        sum,
        avg,
        min,
        max,
        last,
        valueCount: parsedValues.length,
      }
    })
    .filter(Boolean)

  const statusColumnIndex = findStatusColumnIndex(headers, statusColumn)
  const statusSummary = statusColumnIndex >= 0
    ? (() => {
        const countsMap = new Map()

        dataRows.forEach((row) => {
          const rawValue = String(row[statusColumnIndex] || '').trim()
          const label = rawValue || 'Sem status'
          countsMap.set(label, (countsMap.get(label) || 0) + 1)
        })

        const counts = Array.from(countsMap.entries())
          .map(([label, count], index) => ({
            id: `sheet-status-${slugifyLabel(label) || 'sem-status'}-${index + 1}`,
            label,
            count,
          }))
          .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'))

        return {
          header: headers[statusColumnIndex],
          counts,
        }
      })()
    : null

  return {
    sourceUrl,
    csvUrl,
    detectedDelimiter,
    headers,
    totalRows: dataRows.length,
    resolvedHeaderRow: headerIndex + 1,
    rowMetric: {
      id: 'sheet-total-rows',
      label: 'Registros totais',
      type: 'number',
      value: dataRows.length,
    },
    previewRows,
    numericColumns,
    statusSummary,
  }
}
