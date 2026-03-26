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
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
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
  const providerMessage =
    errorBody?.error?.message ||
    errorBody?.message ||
    errorBody?.detail ||
    fallbackMessage

  return String(providerMessage || fallbackMessage).trim()
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

  const response = await fetch(`${trimTrailingSlash(normalizedConfig.aiBaseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedConfig.aiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: normalizedConfig.aiModel,
      temperature: 0.2,
      max_tokens: 1400,
      messages: buildDashboardAnalysisMessages(normalizedConfig.aiDashboardPrompt, payload),
    }),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar insights com a IA configurada para o dashboard.'
      )
    )
  }

  const content = normalizeMessageContent(responseBody?.choices?.[0]?.message?.content)

  if (!content) {
    throw new Error('A IA respondeu sem conteudo para a analise do dashboard.')
  }

  const parsed = tryParseJson(content)

  return {
    provider: normalizedConfig.aiProvider,
    model: normalizedConfig.aiModel,
    structured: normalizeStructuredInsight(parsed, content),
    rawText: content,
    usage: responseBody?.usage || null,
  }
}
