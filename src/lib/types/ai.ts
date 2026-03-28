export type AiProviderValue =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'manus'
  | 'groq'
  | 'custom'

export interface AiProviderOption {
  value: AiProviderValue
  label: string
  baseUrl: string
  description: string
  modelPlaceholder: string
}

export interface AiProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export type AiProvidersMap = Record<AiProviderValue, AiProviderConfig>

export interface AiSettings {
  aiAnalysisEnabled: boolean
  aiProvider: AiProviderValue
  aiProviders: AiProvidersMap
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
  aiDashboardPrompt: string
}

export interface PromptInspectionResult {
  mode: 'text' | 'json'
  isJson: boolean
  isValid: boolean
  error: string
}

export interface AssistantMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AssistantContextSnapshot {
  focusMode?: string | null
  [key: string]: unknown
}

export interface AssistantChatBody {
  clientId: string
  messages: AssistantMessage[]
  contextSnapshot: AssistantContextSnapshot | null
}

export interface AssistantReplyContext {
  selectedClientName: string
  clientCount: number
}

export interface AssistantReplyResult {
  reply: string
  provider: AiProviderValue
  model: string
  usage: unknown
  context: AssistantReplyContext
}
