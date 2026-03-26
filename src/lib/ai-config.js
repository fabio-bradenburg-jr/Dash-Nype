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

export const AI_PROVIDER_OPTIONS = [
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    description: 'API oficial da OpenAI.',
    modelPlaceholder: 'ex.: gpt-5-mini',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    description: 'Roteador de modelos de IA com API compativel.',
    modelPlaceholder: 'ex.: openai/gpt-4.1-mini',
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

export const DEFAULT_AI_SETTINGS = {
  aiAnalysisEnabled: false,
  aiProvider: 'openai',
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: '',
  aiDashboardPrompt: DEFAULT_AI_DASHBOARD_PROMPT,
}

export function getAiProviderOption(providerValue) {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === providerValue) || AI_PROVIDER_OPTIONS[0]
}

export function normalizeAiSettings(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const provider = getAiProviderOption(raw.aiProvider).value
  const providerOption = getAiProviderOption(provider)

  return {
    aiAnalysisEnabled: Boolean(raw.aiAnalysisEnabled),
    aiProvider: provider,
    aiBaseUrl: String(raw.aiBaseUrl || providerOption.baseUrl || '').trim(),
    aiApiKey: String(raw.aiApiKey || '').trim(),
    aiModel: String(raw.aiModel || '').trim(),
    aiDashboardPrompt: String(raw.aiDashboardPrompt || DEFAULT_AI_DASHBOARD_PROMPT).trim() || DEFAULT_AI_DASHBOARD_PROMPT,
  }
}
