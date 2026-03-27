import { normalizeAiSettings, resolveAiDashboardPromptText } from '@/lib/ai-config'

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text' && typeof item.text === 'string') return item.text
        if (item?.type === 'output_text' && typeof item.text === 'string') return item.text
        if (item?.text && typeof item.text?.value === 'string') return item.text.value
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        if (typeof item?.value === 'string') return item.value
        if (typeof item?.output_text === 'string') return item.output_text
        if (Array.isArray(item?.parts)) {
          return item.parts
            .map((part) => {
              if (typeof part === 'string') return part
              if (typeof part?.text === 'string') return part.text
              return ''
            })
            .join('\n')
        }
        return ''
      })
      .join('\n')
      .trim()
  }

  if (content && typeof content === 'object') {
    if (Array.isArray(content.content)) return normalizeMessageContent(content.content)
    if (typeof content.text === 'string') return content.text.trim()
    if (content.text && typeof content.text?.value === 'string') return content.text.value.trim()
    if (typeof content.content === 'string') return content.content.trim()
    if (typeof content.value === 'string') return content.value.trim()
    if (typeof content.output_text === 'string') return content.output_text.trim()
    if (Array.isArray(content.parts)) {
      return content.parts
        .map((part) => {
          if (typeof part === 'string') return part
          if (typeof part?.text === 'string') return part.text
          return ''
        })
        .join('\n')
        .trim()
    }
  }

  return ''
}

function collectTextSnippets(value, depth = 0) {
  if (depth > 6 || value == null) return []
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? [normalized] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextSnippets(item, depth + 1))
  }

  if (typeof value === 'object') {
    const preferredKeys = [
      'output_text',
      'text',
      'content',
      'value',
      'refusal',
      'reasoning',
      'message',
      'delta',
      'parts',
    ]

    const snippets = preferredKeys.flatMap((key) => collectTextSnippets(value[key], depth + 1))
    if (snippets.length > 0) return snippets

    return Object.entries(value)
      .filter(([key]) => !['role', 'type', 'finish_reason', 'index', 'id', 'object'].includes(key))
      .flatMap(([, item]) => collectTextSnippets(item, depth + 1))
  }

  return []
}

function extractChoiceMessageContent(choice) {
  if (!choice || typeof choice !== 'object') return ''

  return (
    normalizeMessageContent(choice?.message?.content) ||
    normalizeMessageContent(choice?.message) ||
    normalizeMessageContent(choice?.delta?.content) ||
    normalizeMessageContent(choice?.delta) ||
    normalizeMessageContent(choice?.text) ||
    normalizeMessageContent(choice?.content) ||
    ''
  )
}

function stripMarkdownCodeFence(text) {
  const normalized = String(text || '').trim()
  return normalized.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function createLooseJsonCandidates(text) {
  const normalized = stripMarkdownCodeFence(text)
  if (!normalized) return []

  const candidates = new Set([normalized])

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(normalized)
      if (typeof unwrapped === 'string' && unwrapped.trim()) {
        candidates.add(unwrapped.trim())
      }
    } catch {}
  }

  const repaired = normalized
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()

  if (repaired) candidates.add(repaired)

  const firstBrace = repaired.indexOf('{')
  const lastBrace = repaired.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(repaired.slice(firstBrace, lastBrace + 1).trim())
  }

  const firstBracket = repaired.indexOf('[')
  const lastBracket = repaired.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.add(repaired.slice(firstBracket, lastBracket + 1).trim())
  }

  return Array.from(candidates).filter(Boolean)
}

function tryParseJson(text) {
  const candidates = createLooseJsonCandidates(text)
  if (!candidates.length) return null

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)

      if (typeof parsed === 'string') {
        const nestedParsed = tryParseJson(parsed)
        return nestedParsed ?? parsed
      }

      return parsed
    } catch (error) {
      const firstBrace = candidate.indexOf('{')
      const lastBrace = candidate.lastIndexOf('}')

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1))

          if (typeof parsed === 'string') {
            const nestedParsed = tryParseJson(parsed)
            return nestedParsed ?? parsed
          }

          return parsed
        } catch {}
      }
    }
  }

  return null
}

function toCleanString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function looksLikeJsonPayload(value) {
  const normalized = toCleanString(value)
  return normalized.startsWith('{') || normalized.startsWith('[')
}

function toTitleCaseLabel(value, fallback = 'Insight') {
  const normalized = toCleanString(value)
  if (!normalized) return fallback

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase())
}

function normalizeInsightType(value, fallback = 'insight') {
  const normalized = toCleanString(value).toLowerCase()

  if (!normalized) return fallback
  if (['opportunity', 'oportunidade'].includes(normalized)) return 'opportunity'
  if (['alert', 'alerta', 'problema'].includes(normalized)) return 'alert'
  if (['anomaly', 'anomalia'].includes(normalized)) return 'anomaly'
  if (['win', 'destaque', 'ganho'].includes(normalized)) return 'win'

  return fallback
}

function normalizeInsightItem(item, fallbackType = 'insight') {
  if (!item || typeof item !== 'object') return null

  const title =
    toCleanString(item.title) ||
    toCleanString(item.titulo) ||
    toTitleCaseLabel(item.area, '') ||
    toTitleCaseLabel(item.category, '') ||
    'Leitura do período'

  const evidenceParts = [
    toCleanString(item.evidence),
    toCleanString(item.evidencia),
    toCleanString(item.description),
    toCleanString(item.descricao),
    toCleanString(item.impact),
    toCleanString(item.impacto),
    toCleanString(item.summary),
    toCleanString(item.resumo),
  ].filter(Boolean)

  const action =
    toCleanString(item.action) ||
    toCleanString(item.acao) ||
    toCleanString(item.recommendation) ||
    toCleanString(item.recomendacao) ||
    ''

  return {
    type: normalizeInsightType(item.type || item.tipo || item.status || item.gravidade, fallbackType),
    title,
    evidence: evidenceParts.join(' ').trim(),
    action,
  }
}

function normalizeInsightArray(items, fallbackType) {
  if (!Array.isArray(items)) return []
  return items.map((item) => normalizeInsightItem(item, fallbackType)).filter(Boolean)
}

function buildSummaryFromDiagnostic(diagnostic, rawText) {
  if (!diagnostic || typeof diagnostic !== 'object') return toCleanString(rawText)

  const parts = [
    toCleanString(diagnostic.summary),
    toCleanString(diagnostic.resumo),
    toCleanString(diagnostic.status) ? `Status: ${toCleanString(diagnostic.status)}.` : '',
  ].filter(Boolean)

  return parts.join(' ').trim()
}

function extractQuotedValue(text, key) {
  const pattern = new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`, 'i')
  const match = String(text || '').match(pattern)
  return match?.[1]?.trim() || ''
}

function extractLooseInsightObjects(text, sectionKey, fallbackType) {
  const source = String(text || '')
  const sectionPattern = new RegExp(`["']${sectionKey}["']\\s*:\\s*\\[(.*?)](?=\\s*,\\s*["'][^"']+["']\\s*:|\\s*}$)`, 'is')
  const sectionMatch = source.match(sectionPattern)
  const sectionBody = sectionMatch?.[1] || ''
  if (!sectionBody) return []

  const objectMatches = sectionBody.match(/\{[^{}]*\}/g) || []

  return objectMatches
    .map((item) => ({
      title: extractQuotedValue(item, 'titulo') || extractQuotedValue(item, 'title'),
      evidence:
        extractQuotedValue(item, 'descricao') ||
        extractQuotedValue(item, 'description') ||
        extractQuotedValue(item, 'impacto') ||
        extractQuotedValue(item, 'impact'),
      action:
        extractQuotedValue(item, 'acao') ||
        extractQuotedValue(item, 'action') ||
        extractQuotedValue(item, 'recomendacao') ||
        extractQuotedValue(item, 'recommendation'),
      type: fallbackType,
    }))
    .filter((item) => item.title || item.evidence || item.action)
}

function extractLooseNextActions(text) {
  const source = String(text || '')
  const arrayPattern = /["'](?:nextActions|proximos_passos)["']\s*:\s*\[(.*?)](?=\s*,\s*["'][^"']+["']\s*:|\s*}$)/is
  const match = source.match(arrayPattern)
  const body = match?.[1] || ''
  if (!body) return []

  return Array.from(body.matchAll(/["']([^"']+)["']/g))
    .map((item) => item?.[1]?.trim() || '')
    .filter(Boolean)
}

function extractLooseStructuredInsight(rawText) {
  const headline =
    extractQuotedValue(rawText, 'headline') ||
    extractQuotedValue(rawText, 'titulo') ||
    extractQuotedValue(rawText, 'status') ||
    'Insight gerado'

  const summary =
    extractQuotedValue(rawText, 'summary') ||
    extractQuotedValue(rawText, 'resumo') ||
    toCleanString(rawText)

  const insights = [
    ...extractLooseInsightObjects(rawText, 'principais_problemas', 'alert'),
    ...extractLooseInsightObjects(rawText, 'oportunidades', 'opportunity'),
    ...extractLooseInsightObjects(rawText, 'anomalias', 'anomaly'),
    ...extractLooseInsightObjects(rawText, 'destaques', 'win'),
    ...extractLooseInsightObjects(rawText, 'insights', 'insight'),
  ]

  const nextActions = extractLooseNextActions(rawText)

  return {
    headline: toTitleCaseLabel(headline, 'Insight gerado'),
    summary,
    insights,
    nextActions,
  }
}

function normalizeStructuredInsight(parsed, rawText) {
  if (!parsed || typeof parsed !== 'object') {
    return extractLooseStructuredInsight(rawText)
  }

  const directInsights = normalizeInsightArray(parsed.insights, 'insight')
  const problemInsights = normalizeInsightArray(parsed.principais_problemas, 'alert')
  const opportunityInsights = normalizeInsightArray(parsed.oportunidades, 'opportunity')
  const anomalyInsights = normalizeInsightArray(parsed.anomalias, 'anomaly')
  const winInsights = normalizeInsightArray(parsed.destaques || parsed.ganhos, 'win')

  const nextActions = Array.isArray(parsed.nextActions)
    ? parsed.nextActions.map((item) => toCleanString(item)).filter(Boolean)
    : Array.isArray(parsed.proximos_passos)
      ? parsed.proximos_passos.map((item) => toCleanString(item)).filter(Boolean)
      : normalizeInsightArray(parsed.oportunidades, 'opportunity')
          .map((item) => item?.action || item?.title || '')
          .filter(Boolean)

  const headline =
    toCleanString(parsed.headline) ||
    toCleanString(parsed.titulo) ||
    toCleanString(parsed.diagnostico_geral?.headline) ||
    toCleanString(parsed.diagnostico_geral?.titulo) ||
    'Insight gerado'

  const summary =
    toCleanString(parsed.summary) ||
    toCleanString(parsed.resumo) ||
    buildSummaryFromDiagnostic(parsed.diagnostico_geral, rawText) ||
    toCleanString(rawText)

  const insights = [
    ...directInsights,
    ...problemInsights,
    ...opportunityInsights,
    ...anomalyInsights,
    ...winInsights,
  ]

  return {
    headline,
    summary,
    insights,
    nextActions,
  }
}

function buildDashboardAnalysisMessages(prompt, payload) {
  const resolvedPrompt = resolveAiDashboardPromptText(prompt)

  return [
    {
      role: 'system',
      content: resolvedPrompt,
    },
    {
      role: 'user',
      content: [
        'Analise os dados estruturados abaixo do dashboard.',
        'Use somente os numeros recebidos.',
        'Retorne somente JSON valido no formato solicitado no prompt de sistema.',
        '',
        JSON.stringify(payload, null, 2),
      ].join('\n'),
    },
  ]
}

function formatProviderErrorMessage(errorBody, fallbackMessage) {
  const nestedError = errorBody?.error
  const providerMessage =
    (typeof nestedError === 'string' ? nestedError : nestedError?.message) ||
    nestedError?.code ||
    errorBody?.message ||
    errorBody?.detail ||
    (errorBody?.status === 'failed' ? 'A resposta da IA falhou antes de gerar conteúdo.' : '') ||
    fallbackMessage

  return String(providerMessage || fallbackMessage).trim()
}

function shouldRetryWithCompatiblePayload(errorBody) {
  const message = formatProviderErrorMessage(errorBody, '').toLowerCase()

  return (
    message.includes('unsupported parameter') ||
    message.includes('not supported with this model') ||
    message.includes('max_completion_tokens') ||
    message.includes('max_tokens') ||
    message.includes('temperature')
  )
}

async function postChatCompletion(baseUrl, apiKey, body) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function postOpenAiResponse(baseUrl, apiKey, body) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function getOpenAiResponse(baseUrl, apiKey, responseId) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/responses/${responseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function postAnthropicMessage(baseUrl, apiKey, body) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

function extractAnthropicContent(responseBody) {
  if (!Array.isArray(responseBody?.content)) return ''

  return responseBody.content
    .map((item) => {
      if (item?.type === 'text' && typeof item.text === 'string') return item.text
      return ''
    })
    .join('\n')
    .trim()
}

function extractOpenAiCompatibleContent(responseBody) {
  const choicesContent = Array.isArray(responseBody?.choices)
    ? responseBody.choices.map((choice) => extractChoiceMessageContent(choice)).filter(Boolean).join('\n').trim()
    : ''
  const recursiveContent = collectTextSnippets(responseBody?.choices || responseBody).join('\n').trim()

  return (
    choicesContent ||
    normalizeMessageContent(responseBody?.choices?.[0]?.message?.content) ||
    normalizeMessageContent(responseBody?.choices?.[0]?.message) ||
    normalizeMessageContent(responseBody?.choices?.[0]?.text) ||
    normalizeMessageContent(responseBody?.choices?.[0]?.delta?.content) ||
    normalizeMessageContent(responseBody?.choices?.[0]?.delta) ||
    normalizeMessageContent(responseBody?.output_text) ||
    normalizeMessageContent(responseBody?.content) ||
    normalizeMessageContent(responseBody?.candidates?.[0]?.content?.parts) ||
    normalizeMessageContent(responseBody?.candidates?.[0]?.content) ||
    normalizeMessageContent(responseBody?.result?.message?.content) ||
    normalizeMessageContent(responseBody?.result?.content) ||
    recursiveContent ||
    ''
  )
}

function extractOpenAiResponsesContent(responseBody) {
  return (
    normalizeMessageContent(responseBody?.output_text) ||
    normalizeMessageContent(responseBody?.output?.[0]?.content) ||
    normalizeMessageContent(responseBody?.output?.[0]?.content?.[0]?.text) ||
    normalizeMessageContent(responseBody?.content) ||
    collectTextSnippets(responseBody?.output || responseBody).join('\n').trim() ||
    ''
  )
}

function buildEmptyContentError(provider, responseBody) {
  const nestedErrorMessage = formatProviderErrorMessage(responseBody, '')
  const topLevelKeys = responseBody && typeof responseBody === 'object'
    ? Object.keys(responseBody).slice(0, 8).join(', ')
    : 'sem chaves'

  if (nestedErrorMessage) {
    return `A IA não concluiu a análise. Provider: ${provider || 'desconhecido'}. Motivo: ${nestedErrorMessage}`
  }

  return `A IA respondeu sem conteúdo textual para análise. Provider: ${provider || 'desconhecido'}. Campos recebidos: ${topLevelKeys || 'sem dados'}.`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestOpenAiCompatibleInsights(normalizedConfig, payload) {
  const messages = buildDashboardAnalysisMessages(normalizedConfig.aiDashboardPrompt, payload)
  const attemptBodies = [
    {
      model: normalizedConfig.aiModel,
      temperature: 0.2,
      max_completion_tokens: 1400,
      response_format: { type: 'json_object' },
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      temperature: 0.2,
      max_tokens: 1400,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      temperature: 0.2,
      max_completion_tokens: 1400,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      max_completion_tokens: 1400,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      max_tokens: 1400,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      messages,
    },
  ]

  let response = null
  let responseBody = null

  for (let index = 0; index < attemptBodies.length; index += 1) {
    const attempt = await postChatCompletion(
      normalizedConfig.aiBaseUrl,
      normalizedConfig.aiApiKey,
      attemptBodies[index]
    )

    response = attempt.response
    responseBody = attempt.responseBody

    if (response.ok) {
      break
    }

    const canRetry =
      index < attemptBodies.length - 1 &&
      response.status >= 400 &&
      response.status < 500 &&
      shouldRetryWithCompatiblePayload(responseBody)

    if (!canRetry) {
      break
    }
  }

  if (!response?.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar insights com a IA configurada para o dashboard.'
      )
    )
  }

  return {
    content: extractOpenAiCompatibleContent(responseBody),
    usage: responseBody?.usage || null,
    responseBody,
  }
}

async function requestOpenAiCompatibleFallbackInsights(normalizedConfig, payload) {
  const messages = buildDashboardAnalysisMessages(normalizedConfig.aiDashboardPrompt, payload)
  const attemptBodies = [
    {
      model: normalizedConfig.aiModel,
      messages,
      response_format: { type: 'json_object' },
    },
    {
      model: normalizedConfig.aiModel,
      messages,
    },
  ]

  for (let index = 0; index < attemptBodies.length; index += 1) {
    const { response, responseBody } = await postChatCompletion(
      normalizedConfig.aiBaseUrl,
      normalizedConfig.aiApiKey,
      attemptBodies[index]
    )

    if (!response.ok) {
      if (index < attemptBodies.length - 1 && shouldRetryWithCompatiblePayload(responseBody)) {
        continue
      }

      throw new Error(
        formatProviderErrorMessage(
          responseBody,
          'Nao foi possivel gerar insights com a IA configurada para o dashboard.'
        )
      )
    }

    const content = extractOpenAiCompatibleContent(responseBody)
    if (String(content || '').trim()) {
      return {
        content,
        usage: responseBody?.usage || null,
        responseBody,
      }
    }
  }

  return {
    content: '',
    usage: null,
    responseBody: null,
  }
}

async function requestNativeOpenAiInsights(normalizedConfig, payload) {
  const messages = buildDashboardAnalysisMessages(normalizedConfig.aiDashboardPrompt, payload)
  const userInput = String(messages.find((message) => message.role === 'user')?.content || '')
  const instructions = String(messages.find((message) => message.role === 'system')?.content || '')

  const attemptBodies = [
    {
      model: normalizedConfig.aiModel,
      reasoning: { effort: 'low' },
      instructions,
      text: {
        format: {
          type: 'json_object',
        },
      },
      max_output_tokens: 1400,
      background: false,
      input: userInput,
    },
    {
      model: normalizedConfig.aiModel,
      reasoning: { effort: 'low' },
      instructions,
      background: false,
      input: userInput,
    },
    {
      model: normalizedConfig.aiModel,
      instructions,
      background: false,
      input: userInput,
    },
  ]

  let response = null
  let responseBody = null

  for (let index = 0; index < attemptBodies.length; index += 1) {
    const attempt = await postOpenAiResponse(
      normalizedConfig.aiBaseUrl,
      normalizedConfig.aiApiKey,
      attemptBodies[index]
    )

    response = attempt.response
    responseBody = attempt.responseBody

    if (response.ok) {
      break
    }

    if (index >= attemptBodies.length - 1) {
      break
    }
  }

  if (!response?.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar insights com a IA configurada para o dashboard.'
      )
    )
  }

  if (responseBody?.error || responseBody?.status === 'failed') {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'A OpenAI retornou erro ao gerar os insights da dashboard.'
      )
    )
  }

  let resolvedResponseBody = responseBody
  let resolvedContent = extractOpenAiResponsesContent(responseBody)

  if (!resolvedContent && responseBody?.id) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0 || responseBody?.status !== 'completed') {
        await sleep(800)
      }

      const followUp = await getOpenAiResponse(
        normalizedConfig.aiBaseUrl,
        normalizedConfig.aiApiKey,
        responseBody.id
      )

      if (!followUp.response?.ok) {
        break
      }

      resolvedResponseBody = followUp.responseBody
      resolvedContent = extractOpenAiResponsesContent(followUp.responseBody)

      if (followUp.responseBody?.error || followUp.responseBody?.status === 'failed') {
        throw new Error(
          formatProviderErrorMessage(
            followUp.responseBody,
            'A OpenAI retornou erro ao concluir os insights da dashboard.'
          )
        )
      }

      if (resolvedContent || followUp.responseBody?.status === 'completed') {
        if (resolvedContent) break
      }
    }
  }

  return {
    content: resolvedContent,
    usage: resolvedResponseBody?.usage || null,
    responseBody: resolvedResponseBody,
  }
}

async function requestAnthropicInsights(normalizedConfig, payload) {
  const resolvedPrompt = resolveAiDashboardPromptText(normalizedConfig.aiDashboardPrompt)
  const anthropicBody = {
    model: normalizedConfig.aiModel,
    max_tokens: 1400,
    temperature: 0.2,
    system: resolvedPrompt,
    messages: [
      {
        role: 'user',
        content: [
          'Analise os dados estruturados abaixo do dashboard.',
          'Use somente os numeros recebidos.',
          'Retorne somente JSON valido no formato solicitado no prompt de sistema.',
          '',
          JSON.stringify(payload, null, 2),
        ].join('\n'),
      },
    ],
  }

  let { response, responseBody } = await postAnthropicMessage(
    normalizedConfig.aiBaseUrl,
    normalizedConfig.aiApiKey,
    anthropicBody
  )

  if (!response.ok && shouldRetryWithCompatiblePayload(responseBody)) {
    const retryAttempt = await postAnthropicMessage(
      normalizedConfig.aiBaseUrl,
      normalizedConfig.aiApiKey,
      {
        model: normalizedConfig.aiModel,
        max_tokens: 1400,
        system: resolvedPrompt,
        messages: anthropicBody.messages,
      }
    )
    response = retryAttempt.response
    responseBody = retryAttempt.responseBody
  }

  if (!response.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar insights com a IA configurada para o dashboard.'
      )
    )
  }

  return {
    content: extractAnthropicContent(responseBody),
    usage: responseBody?.usage || null,
    responseBody,
  }
}

export function resolveDashboardAiConfig(globalIntegrations) {
  return normalizeAiSettings(globalIntegrations)
}

export async function requestDashboardInsights(config, payload) {
  const normalizedConfig = normalizeAiSettings(config)

  if (!normalizedConfig.aiAnalysisEnabled) {
    throw new Error('A análise com IA está desativada nas configurações globais.')
  }

  if (!normalizedConfig.aiApiKey || !normalizedConfig.aiModel || !normalizedConfig.aiBaseUrl) {
    throw new Error('Preencha provider, endpoint, chave e modelo da IA antes de gerar insights.')
  }

  const supportsAnthropicMessages = normalizedConfig.aiProvider === 'anthropic'
  let providerResponse = supportsAnthropicMessages
    ? await requestAnthropicInsights(normalizedConfig, payload)
    : await requestOpenAiCompatibleInsights(normalizedConfig, payload)

  if (
    normalizedConfig.aiProvider === 'openai' &&
    !String(providerResponse?.content || '').trim()
  ) {
    providerResponse = await requestNativeOpenAiInsights(normalizedConfig, payload)
  }

  if (
    normalizedConfig.aiProvider === 'openai' &&
    !String(providerResponse?.content || '').trim()
  ) {
    providerResponse = await requestOpenAiCompatibleFallbackInsights(normalizedConfig, payload)
  }

  const content = String(providerResponse.content || '').trim()
  const sanitizedContent = content === 'assistant' ? '' : content

  if (!sanitizedContent) {
    throw new Error(buildEmptyContentError(normalizedConfig.aiProvider, providerResponse.responseBody))
  }

  const parsed = tryParseJson(sanitizedContent)
  const structured = normalizeStructuredInsight(parsed, sanitizedContent)
  const shouldLogDiagnostics =
    !parsed ||
    !structured.summary ||
    structured.insights.length === 0 ||
    looksLikeJsonPayload(structured.summary) ||
    looksLikeJsonPayload(structured.headline)

  if (shouldLogDiagnostics) {
    console.warn('Dashboard AI partial-parse diagnostic:', {
      provider: normalizedConfig.aiProvider,
      model: normalizedConfig.aiModel,
      parsedType: Array.isArray(parsed) ? 'array' : typeof parsed,
      parsedKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 20) : [],
      headlinePreview: String(structured.headline || '').slice(0, 160),
      summaryPreview: String(structured.summary || '').slice(0, 220),
      insightsCount: structured.insights.length,
      nextActionsCount: structured.nextActions.length,
      rawPreview: sanitizedContent.slice(0, 1200),
    })
  }

  return {
    provider: normalizedConfig.aiProvider,
    model: normalizedConfig.aiModel,
    structured,
    rawText: sanitizedContent,
    usage: providerResponse.usage || null,
  }
}
