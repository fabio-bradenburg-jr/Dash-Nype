import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'

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
const META_BACKGROUND_REFRESHES = new Set()
const META_CACHE_TTL_MS = 60_000
const META_PERSISTENT_CACHE_TTL_MS = 5 * 60_000
const META_HISTORICAL_CACHE_TTL_MS = 24 * 60 * 60_000
const META_PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60_000
const META_MAX_PAGES = 40

function normalizeClientKey(value) {
  return String(value || 'unassigned').replace(/^act_/, '') || 'unassigned'
}

function resolveMetaResourceKind(parsed, explicitKind) {
  if (explicitKind) return explicitKind
  if (parsed.pathname.endsWith('/previews')) return 'creative_preview'
  if (parsed.pathname.endsWith('/ads')) return 'creative_ranking'
  if (parsed.pathname.endsWith('/insights')) return 'insights'
  return 'meta_response'
}

function buildPersistentMetaCacheIdentity(url, method = 'GET', cacheContext = {}) {
  try {
    const parsed = new URL(url)
    const accountMatch = parsed.pathname.match(/\/act_([^/]+)/)
    parsed.searchParams.delete('access_token')
    parsed.searchParams.sort()

    const requestPath = `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`
    const clientKey = normalizeClientKey(cacheContext.clientKey || accountMatch?.[1])
    const resourceKind = resolveMetaResourceKind(parsed, cacheContext.resourceKind)
    const cacheKey = createHash('sha256')
      .update(`${method}:${requestPath}`)
      .digest('hex')

    return { cacheKey, clientKey, resourceKind, requestPath }
  } catch {
    return null
  }
}

function resolvePersistentMetaCacheTtlMs(url) {
  try {
    const parsed = new URL(url)

    if (parsed.pathname.endsWith('/previews')) {
      return META_PREVIEW_CACHE_TTL_MS
    }

    const timeRange = parsed.searchParams.get('time_range')
    if (timeRange) {
      const until = JSON.parse(timeRange)?.until || ''
      const yesterday = new Date()
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      const yesterdayInput = yesterday.toISOString().slice(0, 10)

      if (until && until < yesterdayInput) {
        return META_HISTORICAL_CACHE_TTL_MS
      }
    }
  } catch {
    return META_PERSISTENT_CACHE_TTL_MS
  }

  return META_PERSISTENT_CACHE_TTL_MS
}

async function readPersistentMetaCache({ cacheKey, requestPath }) {
  try {
    const supabase = createAdminClient()
    const { data: keyedData, error: keyedError } = await supabase
      .from('meta_api_cache')
      .select('payload, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle()

    if (keyedError) throw keyedError
    let data = keyedData

    if (!data) {
      const { data: pathData, error: pathError } = await supabase
        .from('meta_api_cache')
        .select('cache_key, client_key, resource_kind, request_path, payload, fetched_at, expires_at')
        .eq('request_path', requestPath)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pathError) throw pathError
      data = pathData

      if (pathData?.cache_key && pathData.cache_key !== cacheKey) {
        await supabase.from('meta_api_cache').upsert({
          cache_key: cacheKey,
          client_key: pathData.client_key,
          resource_kind: pathData.resource_kind,
          request_path: pathData.request_path,
          payload: pathData.payload,
          fetched_at: pathData.fetched_at,
          expires_at: pathData.expires_at,
        })
      }
    }

    if (!data?.payload) return null

    return {
      data: data.payload,
      isFresh: new Date(data.expires_at).getTime() > Date.now(),
    }
  } catch {
    return null
  }
}

async function writePersistentMetaCache({ cacheKey, clientKey, resourceKind, requestPath, data, ttlMs }) {
  try {
    const now = new Date()
    const supabase = createAdminClient()
    const fetchedAt = now.toISOString()
    const { error: latestCacheError } = await supabase
      .from('meta_api_cache')
      .upsert({
        cache_key: cacheKey,
        client_key: clientKey,
        resource_kind: resourceKind,
        request_path: requestPath,
        payload: data,
        fetched_at: fetchedAt,
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      })

    if (latestCacheError) throw latestCacheError

    const { error: historyError } = await supabase
      .from('meta_api_cache_history')
      .insert({
        cache_key: cacheKey,
        client_key: clientKey,
        resource_kind: resourceKind,
        request_path: requestPath,
        payload: data,
        fetched_at: fetchedAt,
      })

    if (historyError) throw historyError
  } catch {
    // Cache persistence must never prevent the live Meta response from reaching the dashboard.
  }
}

async function persistMetaResponse(cacheEntry) {
  try {
    after(() => writePersistentMetaCache(cacheEntry))
  } catch {
    await writePersistentMetaCache(cacheEntry)
  }
}

function canUseStaleMetaCache(error) {
  return (
    isTimeoutError(error) ||
    /rate limit|request limit|too many calls|too many requests|demorou/i.test(String(error?.message || ''))
  )
}

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
  const persistentCacheIdentity = buildPersistentMetaCacheIdentity(url, options.method || 'GET', options.cacheContext)
  const shouldForceRefresh = options.forceRefresh === true
  const envToken = String(process.env.META_ACCESS_TOKEN || '').trim()
  const maxPages = Number.isFinite(Number(options.maxPages)) ? Number(options.maxPages) : META_MAX_PAGES
  const fetchOptions = { ...options }
  delete fetchOptions.maxPages
  delete fetchOptions.cacheContext
  delete fetchOptions.forceRefresh

  if (!shouldForceRefresh && cachedEntry && Date.now() - cachedEntry.timestamp < META_CACHE_TTL_MS) {
    return cachedEntry.data
  }

  const persistentCacheEntry = !shouldForceRefresh && persistentCacheIdentity
    ? await readPersistentMetaCache(persistentCacheIdentity)
    : null

  if (persistentCacheEntry?.data) {
    META_RESPONSE_CACHE.set(cacheKey, {
      data: persistentCacheEntry.data,
      timestamp: Date.now(),
    })

    if (!persistentCacheEntry.isFresh && !META_BACKGROUND_REFRESHES.has(cacheKey)) {
      META_BACKGROUND_REFRESHES.add(cacheKey)

      try {
        after(async () => {
          try {
            await fetchMetaJson(url, fallbackMessage, {
              ...options,
              forceRefresh: true,
            })
          } catch {
            // The saved snapshot remains available if Meta cannot refresh it now.
          } finally {
            META_BACKGROUND_REFRESHES.delete(cacheKey)
          }
        })
      } catch {
        META_BACKGROUND_REFRESHES.delete(cacheKey)
      }
    }

    return persistentCacheEntry.data
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

        if (persistentCacheIdentity) {
          await persistMetaResponse({
            cacheKey: persistentCacheIdentity.cacheKey,
            clientKey: persistentCacheIdentity.clientKey,
            resourceKind: persistentCacheIdentity.resourceKind,
            requestPath: persistentCacheIdentity.requestPath,
            data: finalData,
            ttlMs: resolvePersistentMetaCacheTtlMs(url),
          })
        }

        return finalData
      } catch (error) {
        lastError = error

        if (persistentCacheEntry?.data && canUseStaleMetaCache(error)) {
          return persistentCacheEntry.data
        }

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
