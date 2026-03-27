import { normalizeAiSettings } from '@/lib/ai-config'

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

function tryParseJson(text) {
  const normalized = stripMarkdownCodeFence(text)
  if (!normalized) return null

  try {
    return JSON.parse(normalized)
  } catch (error) {
    const firstBrace = normalized.indexOf('{')
    const lastBrace = normalized.lastIndexOf('}')

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(normalized.slice(firstBrace, lastBrace + 1))
      } catch (nestedError) {
        return null
      }
    }

    return null
  }
}

function normalizeStructuredInsight(parsed, rawText) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      headline: 'Insight gerado',
      summary: rawText || 'A IA respondeu sem um JSON estruturado.',
      insights: [],
      nextActions: [],
    }
  }

  return {
    headline: String(parsed.headline || 'Insight gerado').trim(),
    summary: String(parsed.summary || rawText || '').trim(),
    insights: Array.isArray(parsed.insights)
      ? parsed.insights
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            type: String(item.type || 'insight').trim(),
            title: String(item.title || '').trim(),
            evidence: String(item.evidence || '').trim(),
            action: String(item.action || '').trim(),
          }))
      : [],
    nextActions: Array.isArray(parsed.nextActions)
      ? parsed.nextActions.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  }
}

function buildDashboardAnalysisMessages(prompt, payload) {
  return [
    {
      role: 'system',
      content: prompt,
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
  const anthropicBody = {
    model: normalizedConfig.aiModel,
    max_tokens: 1400,
    temperature: 0.2,
    system: normalizedConfig.aiDashboardPrompt,
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
        system: normalizedConfig.aiDashboardPrompt,
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

  const content = String(providerResponse.content || '').trim()
  const sanitizedContent = content === 'assistant' ? '' : content

  if (!sanitizedContent) {
    throw new Error(buildEmptyContentError(normalizedConfig.aiProvider, providerResponse.responseBody))
  }

  const parsed = tryParseJson(sanitizedContent)

  return {
    provider: normalizedConfig.aiProvider,
    model: normalizedConfig.aiModel,
    structured: normalizeStructuredInsight(parsed, sanitizedContent),
    rawText: sanitizedContent,
    usage: providerResponse.usage || null,
  }
}
