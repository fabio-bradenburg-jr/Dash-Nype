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

export interface AiAgent {
  id: string
  name: string
  description: string
  prompt: string
}

export type AssistantAiAccessLevel = 'master' | 'team'

export interface AiSettings {
  aiAnalysisEnabled: boolean
  aiProvider: AiProviderValue
  aiProviders: AiProvidersMap
  aiAgents: AiAgent[]
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
  agentId?: string | null
  [key: string]: unknown
}

export interface AssistantChatBody {
  clientId: string
  conversationId?: string
  messages: AssistantMessage[]
  contextSnapshot: AssistantContextSnapshot | null
}

export interface AssistantConversationSummary {
  id: string
  title: string
  updatedAt: string
  lastMessageAt: string
  preview: string
}

export interface AssistantConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface AssistantConversationDetail {
  conversation: AssistantConversationSummary
  messages: AssistantConversationMessage[]
}

export interface AssistantReplyContext {
  selectedClientName: string
  clientCount: number
}

export interface AssistantReplyResult {
  reply: string
  conversation?: AssistantConversationSummary
  provider: AiProviderValue
  model: string
  usage: unknown
  context: AssistantReplyContext
}
