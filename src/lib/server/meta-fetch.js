function isTimeoutError(error) {
  return error?.message === 'fetch failed' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
}

function isInvalidMetaTokenPayload(payload) {
  const error = payload?.error
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === 190 ||
    message.includes('error validating access token') ||
    message.includes('session is invalid') ||
    message.includes('user logged out') ||
    message.includes('session has been invalidated')
  )
}

function replaceMetaAccessToken(url, nextToken) {
  if (!nextToken || typeof url !== 'string' || !url.includes('access_token=')) return url

  try {
    const parsed = new URL(url)
    parsed.searchParams.set('access_token', nextToken)
    return parsed.toString()
  } catch {
    return url.replace(/access_token=[^&]+/, `access_token=${encodeURIComponent(nextToken)}`)
  }
}

const META_RESPONSE_CACHE = new Map()
const META_IN_FLIGHT_REQUESTS = new Map()
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
  const envToken = String(process.env.META_ACCESS_TOKEN || '').trim()
  const maxPages = Number.isFinite(Number(options.maxPages)) ? Number(options.maxPages) : META_MAX_PAGES
  const fetchOptions = { ...options }
  delete fetchOptions.maxPages

  if (cachedEntry && Date.now() - cachedEntry.timestamp < META_CACHE_TTL_MS) {
    return cachedEntry.data
  }

  if (META_IN_FLIGHT_REQUESTS.has(cacheKey)) {
    return META_IN_FLIGHT_REQUESTS.get(cacheKey)
  }

  const requestPromise = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let requestUrl = url
        let pageCount = 0
        let mergedData = null
        let hasRetriedWithEnvToken = false

        while (requestUrl && pageCount < maxPages) {
          const response = await fetch(requestUrl, fetchOptions)
          const data = await response.json()

          if (data?.error) {
            if (
              envToken &&
              !hasRetriedWithEnvToken &&
              isInvalidMetaTokenPayload(data) &&
              requestUrl.includes('access_token=') &&
              !requestUrl.includes(`access_token=${encodeURIComponent(envToken)}`)
            ) {
              requestUrl = replaceMetaAccessToken(requestUrl, envToken)
              hasRetriedWithEnvToken = true
              continue
            }

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
  })()

  META_IN_FLIGHT_REQUESTS.set(cacheKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    META_IN_FLIGHT_REQUESTS.delete(cacheKey)
  }
}
