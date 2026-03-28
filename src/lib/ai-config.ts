import type {
  AiAgent,
  AiProviderConfig,
  AiProviderOption,
  AiProviderValue,
  AiProvidersMap,
  AiSettings,
  PromptInspectionResult,
} from '@/lib/types/ai'

type JsonLikePrompt = Record<string, unknown> | unknown[] | string | number | boolean | null

type PartialAiProviderConfig = Partial<AiProviderConfig>
type PartialAiAgent = Partial<AiAgent>
type PartialAiSettingsInput = Partial<
  AiSettings & {
    aiProvider: string
    aiProviders: Partial<Record<string, PartialAiProviderConfig>>
    aiAgents: PartialAiAgent[]
  }
>

export function createDefaultAiAgents(): AiAgent[] {
  return [
    {
      id: 'copilot',
      name: 'Copiloto',
      description: 'Leitura geral da operação, cruzando clientes, campanhas e gargalos.',
      prompt:
        'Atue como copiloto principal da operação. Priorize clareza, priorização e próximos passos. Cruze clientes, campanhas, operação, CRM e contexto interno antes de responder.',
    },
    {
      id: 'copywriter',
      name: 'Copywriter',
      description: 'Headlines, copies, ângulos e CTAs alinhados ao cliente.',
      prompt:
        'Atue como copywriter senior. Gere headlines, copies, ganchos, argumentos e CTAs alinhados ao cliente, ao produto e ao material contextual disponível. Mantenha aderência à oferta real e evite promessas não sustentadas.',
    },
    {
      id: 'media',
      name: 'Analista de mídia',
      description: 'Leitura técnica de campanhas, criativos, conjuntos e orçamento.',
      prompt:
        'Atue como analista senior de mídia paga. Leia campanhas, conjuntos, anúncios, criativos, orçamento e breakdowns. Explique o impacto dos números, identifique gargalos e proponha ajustes objetivos.',
    },
    {
      id: 'operations',
      name: 'Operação',
      description: 'Gargalos, prioridades, rotina e execução do time.',
      prompt:
        'Atue como líder de operações. Priorize backlog, bloqueios, responsáveis, vencimentos e próximas ações. Organize a resposta em diagnóstico, impacto, prioridade e encaminhamento.',
    },
  ]
}

export const DEFAULT_AI_DASHBOARD_PROMPT = `Voce e um analista senior de marketing e performance.

Sua funcao e analisar apenas os numeros recebidos do dashboard e devolver insights uteis para tomada de decisao.

Regras:
- nao invente dados;
- nao assuma causalidade sem evidencias;
- destaque oportunidades, alertas e proximos passos;
- use linguagem objetiva em portugues do Brasil;
- retorne somente JSON valido.

Formato esperado:
{
  "headline": "string curta",
  "summary": "resumo executivo em 2 a 4 frases",
  "campaignAnalyses": [
    {
      "campaignName": "nome da campanha",
      "status": "positive | attention | urgent",
      "summary": "leitura objetiva da campanha",
      "evidence": "numeros principais da campanha",
      "action": "acao sugerida para a campanha"
    }
  ],
  "focusSummary": {
    "positives": ["ponto positivo 1", "ponto positivo 2"],
    "attention": ["ponto de atencao 1", "ponto de atencao 2"],
    "urgency": ["ponto urgente 1", "ponto urgente 2"]
  },
  "insights": [
    {
      "type": "opportunity | alert | anomaly | win",
      "title": "titulo curto",
      "evidence": "evidencia numerica objetiva",
      "action": "acao recomendada"
    }
  ],
  "nextActions": ["acao 1", "acao 2", "acao 3"]
}`

export const DEFAULT_AI_DASHBOARD_PROMPT_JSON = JSON.stringify(
  {
    role: 'Analista senior de marketing e performance',
    objective: 'Analisar apenas os numeros recebidos do dashboard e devolver insights uteis para tomada de decisao.',
    rules: [
      'Nao invente dados.',
      'Nao assuma causalidade sem evidencias.',
      'Destaque oportunidades, alertas e proximos passos.',
      'Analise tambem as campanhas listadas em topCampaigns, falando de cada uma com objetividade.',
      'Depois traga um resumo separado em pontos positivos, pontos de atencao e urgencias.',
      'Use linguagem objetiva em portugues do Brasil.',
      'Retorne somente JSON valido.',
    ],
    output: {
      headline: 'string curta',
      summary: 'resumo executivo em 2 a 4 frases',
      campaignAnalyses: [
        {
          campaignName: 'nome da campanha',
          status: 'positive | attention | urgent',
          summary: 'leitura objetiva da campanha',
          evidence: 'numeros principais da campanha',
          action: 'acao sugerida para a campanha',
        },
      ],
      focusSummary: {
        positives: ['ponto positivo 1', 'ponto positivo 2'],
        attention: ['ponto de atencao 1', 'ponto de atencao 2'],
        urgency: ['ponto urgente 1', 'ponto urgente 2'],
      },
      insights: [
        {
          type: 'opportunity | alert | anomaly | win',
          title: 'titulo curto',
          evidence: 'evidencia numerica objetiva',
          action: 'acao recomendada',
        },
      ],
      nextActions: ['acao 1', 'acao 2', 'acao 3'],
    },
  },
  null,
  2
)

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    description: 'API oficial da OpenAI.',
    modelPlaceholder: 'ex.: gpt-5-mini',
  },
  {
    value: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    description: 'API oficial da Anthropic para modelos Claude.',
    modelPlaceholder: 'ex.: claude-3-7-sonnet-latest',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    description: 'Endpoint compatível da API Gemini para uso no mesmo fluxo da dashboard.',
    modelPlaceholder: 'ex.: gemini-2.0-flash',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    description: 'Roteador de modelos com API compativel e suporte a modelos gratuitos.',
    modelPlaceholder: 'ex.: meta-llama/llama-3.3-8b-instruct:free',
  },
  {
    value: 'manus',
    label: 'Manus',
    baseUrl: '',
    description: 'Provider configuravel. Informe a Base URL e o modelo/rota disponibilizados pela sua conta Manus.',
    modelPlaceholder: 'Informe o modelo ou deployment aceito pela sua conta Manus',
  },
  {
    value: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    description: 'Providers com API no formato OpenAI.',
    modelPlaceholder: 'ex.: llama-3.3-70b-versatile',
  },
  {
    value: 'custom',
    label: 'Compativel com OpenAI',
    baseUrl: '',
    description: 'Qualquer endpoint proprio no formato /chat/completions.',
    modelPlaceholder: 'Informe o modelo aceito pela sua API',
  },
]

function buildDefaultProviderConfig(option: AiProviderOption): AiProviderConfig {
  return {
    baseUrl: option.baseUrl || '',
    apiKey: '',
    model: '',
  }
}

export function createDefaultAiProviders(): AiProvidersMap {
  return Object.fromEntries(
    AI_PROVIDER_OPTIONS.map((option) => [option.value, buildDefaultProviderConfig(option)])
  ) as AiProvidersMap
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  aiAnalysisEnabled: false,
  aiProvider: 'openai',
  aiProviders: createDefaultAiProviders(),
  aiAgents: createDefaultAiAgents(),
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: '',
  aiDashboardPrompt: DEFAULT_AI_DASHBOARD_PROMPT,
}

export function getAiProviderOption(providerValue: string): AiProviderOption {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === providerValue) || AI_PROVIDER_OPTIONS[0]
}

function isJsonLikePrompt(value: unknown): boolean {
  const normalized = String(value || '').trim()
  return normalized.startsWith('{') || normalized.startsWith('[')
}

function stringifyPromptSection(value: JsonLikePrompt, depth = 0): string {
  if (depth > 4 || value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyPromptSection(item as JsonLikePrompt, depth + 1))
      .filter(Boolean)
      .map((item) => `- ${item}`)
      .join('\n')
      .trim()
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => {
        const normalizedKey = key.replace(/([a-z])([A-Z])/g, '$1 $2')
        const normalizedValue = stringifyPromptSection(item as JsonLikePrompt, depth + 1)
        if (!normalizedValue) return ''
        if (normalizedValue.includes('\n')) {
          return `${normalizedKey}:\n${normalizedValue}`
        }
        return `${normalizedKey}: ${normalizedValue}`
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

export function resolveAiDashboardPromptText(value: unknown): string {
  const rawPrompt = String(value || '').trim()
  if (!rawPrompt) return DEFAULT_AI_DASHBOARD_PROMPT

  if (!isJsonLikePrompt(rawPrompt)) return rawPrompt

  try {
    const parsed = JSON.parse(rawPrompt) as JsonLikePrompt

    if (typeof parsed === 'string') {
      return parsed.trim() || DEFAULT_AI_DASHBOARD_PROMPT
    }

    if (!parsed || typeof parsed !== 'object') {
      return rawPrompt
    }

    const parsedRecord = parsed as Record<string, JsonLikePrompt>
    const sections = [
      parsedRecord.role ? `Funcao:\n${stringifyPromptSection(parsedRecord.role)}` : '',
      parsedRecord.objective ? `Objetivo:\n${stringifyPromptSection(parsedRecord.objective)}` : '',
      parsedRecord.instructions ? `Instrucoes:\n${stringifyPromptSection(parsedRecord.instructions)}` : '',
      parsedRecord.rules ? `Regras:\n${stringifyPromptSection(parsedRecord.rules)}` : '',
      parsedRecord.style ? `Estilo:\n${stringifyPromptSection(parsedRecord.style)}` : '',
      parsedRecord.context ? `Contexto:\n${stringifyPromptSection(parsedRecord.context)}` : '',
      parsedRecord.output ? `Saida esperada:\n${stringifyPromptSection(parsedRecord.output)}` : '',
      parsedRecord.outputSchema ? `Schema de saida:\n${stringifyPromptSection(parsedRecord.outputSchema)}` : '',
    ].filter(Boolean)

    if (sections.length > 0) {
      return sections.join('\n\n').trim()
    }

    return stringifyPromptSection(parsed) || rawPrompt
  } catch {
    return rawPrompt
  }
}

export function inspectAiDashboardPrompt(value: unknown): PromptInspectionResult {
  const rawPrompt = String(value || '').trim()

  if (!rawPrompt || !isJsonLikePrompt(rawPrompt)) {
    return {
      mode: 'text',
      isJson: false,
      isValid: true,
      error: '',
    }
  }

  try {
    JSON.parse(rawPrompt)
    return {
      mode: 'json',
      isJson: true,
      isValid: true,
      error: '',
    }
  } catch (error) {
    return {
      mode: 'json',
      isJson: true,
      isValid: false,
      error: error instanceof Error ? error.message : 'JSON invalido.',
    }
  }
}

export function normalizeAiSettings(value: PartialAiSettingsInput | null | undefined): AiSettings {
  const raw = value && typeof value === 'object' ? value : {}
  const provider = getAiProviderOption(String(raw.aiProvider || '')).value
  const providerOption = getAiProviderOption(provider)
  const defaultProviders = createDefaultAiProviders()
  const rawProviders =
    raw.aiProviders && typeof raw.aiProviders === 'object'
      ? raw.aiProviders
      : ({} as Partial<Record<string, PartialAiProviderConfig>>)

  const aiProviders = Object.fromEntries(
    AI_PROVIDER_OPTIONS.map((option) => {
      const rawProviderCandidate = rawProviders[option.value]
      const currentProvider =
        rawProviderCandidate && typeof rawProviderCandidate === 'object'
          ? rawProviderCandidate
          : {}

      const legacyProviderValues: PartialAiProviderConfig =
        option.value === provider
          ? {
              baseUrl: raw.aiBaseUrl,
              apiKey: raw.aiApiKey,
              model: raw.aiModel,
            }
          : {}

      return [
        option.value,
        {
          baseUrl: String(
            currentProvider.baseUrl ||
              legacyProviderValues.baseUrl ||
              defaultProviders[option.value].baseUrl ||
              ''
          ).trim(),
          apiKey: String(currentProvider.apiKey || legacyProviderValues.apiKey || '').trim(),
          model: String(currentProvider.model || legacyProviderValues.model || '').trim(),
        },
      ]
    })
  ) as AiProvidersMap

  const activeProviderConfig = aiProviders[provider] || buildDefaultProviderConfig(providerOption)
  const defaultAgents = createDefaultAiAgents()
  const rawAgents = Array.isArray(raw.aiAgents) ? raw.aiAgents : []
  const normalizedCustomAgents = rawAgents
    .map((agent, index) => ({
      id: String(agent?.id || `agent-${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-'),
      name: String(agent?.name || '').trim(),
      description: String(agent?.description || '').trim(),
      prompt: String(agent?.prompt || '').trim(),
    }))
    .filter((agent) => agent.id && agent.name && agent.prompt)

  const aiAgents = normalizedCustomAgents.length
    ? normalizedCustomAgents
    : defaultAgents

  return {
    aiAnalysisEnabled: Boolean(raw.aiAnalysisEnabled),
    aiProvider: provider as AiProviderValue,
    aiProviders,
    aiAgents,
    aiBaseUrl: String(activeProviderConfig.baseUrl || providerOption.baseUrl || '').trim(),
    aiApiKey: String(activeProviderConfig.apiKey || '').trim(),
    aiModel: String(activeProviderConfig.model || '').trim(),
    aiDashboardPrompt:
      String(raw.aiDashboardPrompt || DEFAULT_AI_DASHBOARD_PROMPT).trim() ||
      DEFAULT_AI_DASHBOARD_PROMPT,
  }
}
