function isTimeoutError(error) {
  return error?.message === 'fetch failed' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
}

export function normalizeMetaError(error, fallbackMessage) {
  const message = error?.message || ''

  if (isTimeoutError(error)) {
    return fallbackMessage
  }

  if (message.includes('breakdowns[0] must be one of the following values')) {
    return 'A Meta não liberou esse tipo de ranking para a conta ou período selecionado.'
  }

  return message || fallbackMessage
}

export async function fetchMetaJson(url, fallbackMessage, options = {}) {
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, options)
      const data = await response.json()

      if (data?.error) {
        throw new Error(data.error.message || fallbackMessage)
      }

      return data
    } catch (error) {
      lastError = error

      if (!isTimeoutError(error) || attempt === 1) {
        throw new Error(normalizeMetaError(error, fallbackMessage))
      }
    }
  }

  throw new Error(normalizeMetaError(lastError, fallbackMessage))
}
