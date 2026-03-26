function isTimeoutError(error) {
  return error?.message === 'fetch failed' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
}

const META_RESPONSE_CACHE = new Map()
const META_CACHE_TTL_MS = 60_000
const META_MAX_PAGES = 40

export function normalizeMetaError(error, fallbackMessage) {
  const message = error?.message || ''

  if (isTimeoutError(error)) {
    return fallbackMessage
  }

  if (/rate limit|request limit|too many calls|too many requests/i.test(message)) {
    return 'A Meta limitou temporariamente as chamadas desta conta. Aguarde alguns instantes e tente novamente.'
  }

  if (message.includes('breakdowns[0] must be one of the following values')) {
    return 'A Meta não liberou esse tipo de ranking para a conta ou período selecionado.'
  }

  return message || fallbackMessage
}

export async function fetchMetaJson(url, fallbackMessage, options = {}) {
  let lastError = null
  const cacheKey = `${options.method || 'GET'}:${url}`
  const cachedEntry = META_RESPONSE_CACHE.get(cacheKey)

  if (cachedEntry && Date.now() - cachedEntry.timestamp < META_CACHE_TTL_MS) {
    return cachedEntry.data
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let requestUrl = url
      let pageCount = 0
      let mergedData = null

      while (requestUrl && pageCount < META_MAX_PAGES) {
        const response = await fetch(requestUrl, options)
        const data = await response.json()

        if (data?.error) {
          throw new Error(data.error.message || fallbackMessage)
        }

        if (!mergedData) {
          mergedData = {
            ...data,
            data: Array.isArray(data?.data) ? [...data.data] : data?.data,
          }
        } else if (Array.isArray(mergedData.data) && Array.isArray(data?.data)) {
          mergedData.data.push(...data.data)
        }

        requestUrl = data?.paging?.next || ''
        pageCount += 1
      }

      const finalData = mergedData || {}

      META_RESPONSE_CACHE.set(cacheKey, {
        data: finalData,
        timestamp: Date.now(),
      })

      return finalData
    } catch (error) {
      lastError = error

      if (!isTimeoutError(error) || attempt === 1) {
        throw new Error(normalizeMetaError(error, fallbackMessage))
      }
    }
  }

  throw new Error(normalizeMetaError(lastError, fallbackMessage))
}
