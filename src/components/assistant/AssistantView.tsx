'use client'

import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import type {
  AiAgent,
  AssistantAiAccessLevel,
  AssistantConversationDetail,
  AssistantConversationSummary,
} from '@/lib/types/ai'

const STORAGE_KEY = 'nype-assistant-chat-v1'
const DEFAULT_VOICE_LANGUAGE = 'pt-BR'
const FOCUS_OPTIONS = [
  { value: 'operation', label: 'Operação' },
  { value: 'clients', label: 'Clientes' },
  { value: 'general', label: 'Geral' },
]

type FocusMode = (typeof FOCUS_OPTIONS)[number]['value']
type AssistantMessageRole = 'assistant' | 'user'

interface AssistantMessageItem {
  id: string
  role: AssistantMessageRole
  content: string
}

interface AssistantClient {
  id?: string
  name?: string
}

interface AssistantDashboardState {
  clients?: AssistantClient[]
  activeClientId?: string
  clientGroups?: unknown[]
  error?: string
  access?: {
    aiAccessLevel?: AssistantAiAccessLevel
    canUseAi?: boolean
  }
  globalIntegrations?: {
    aiProvider?: string
    aiModel?: string
    aiAgents?: AiAgent[]
    aiProviders?: Record<string, { apiKey?: string; model?: string; baseUrl?: string } | undefined>
  }
}

interface AssistantReplyPayload {
  reply?: string
  error?: string
  conversation?: AssistantConversationSummary
}

interface AssistantPageProps {
  embeddedOverride?: boolean | null
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0?: {
    transcript?: string
  }
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

function formatTimestamp(ts: string | number | null | undefined): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AssistantPage({ embeddedOverride }: AssistantPageProps = {}) {
  const { user } = useUser()
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<AssistantMessageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [focusMode, setFocusMode] = useState<FocusMode>('general')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [currentConversation, setCurrentConversation] = useState<AssistantConversationDetail | null>(null)
  const [dashboardState, setDashboardState] = useState<AssistantDashboardState | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [voiceLanguage] = useState(DEFAULT_VOICE_LANGUAGE)
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isEmbedded = embeddedOverride ?? false

  const agents: AiAgent[] = useMemo(() => {
    return dashboardState?.globalIntegrations?.aiAgents ?? []
  }, [dashboardState])

  const activeAgent: AiAgent | undefined = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId)
  }, [agents, selectedAgentId])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!user?.id) return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.userId === user.id) {
          setMessages(parsed.messages ?? [])
          setConversationId(parsed.conversationId ?? null)
          setFocusMode(parsed.focusMode ?? 'general')
        }
      } catch {
        // ignore
      }
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId: user.id, messages, conversationId, focusMode }),
    )
  }, [user?.id, messages, conversationId, focusMode])

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          setDashboardState(data)
        }
      } catch {
        // ignore
      }
    }
    fetchDashboard()
  }, [])

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/assistant/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations ?? [])
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleShowHistory = useCallback(async () => {
    setShowHistory((prev) => !prev)
    if (!showHistory) {
      await loadHistory()
    }
  }, [showHistory, loadHistory])

  const handleLoadConversation = useCallback(async (id: string) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`)
      if (res.ok) {
        const data: AssistantConversationDetail = await res.json()
        setCurrentConversation(data)
        setConversationId(id)
        const mapped: AssistantMessageItem[] = (data.messages ?? []).map((m) => ({
          id: generateLocalId(),
          role: m.role as AssistantMessageRole,
          content: m.content,
        }))
        setMessages(mapped)
        setShowHistory(false)
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleNewConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setCurrentConversation(null)
    setShowHistory(false)
    setErrorMsg(null)
  }, [])

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault()
      const text = inputValue.trim()
      if (!text || isLoading) return
      setInputValue('')
      setErrorMsg(null)
      const userMsg: AssistantMessageItem = {
        id: generateLocalId(),
        role: 'user',
        content: text,
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      try {
        const payload = {
          message: text,
          conversationId,
          focusMode,
          agentId: selectedAgentId || undefined,
          dashboardContext: dashboardState,
        }
        const res = await fetch('/api/assistant/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data: AssistantReplyPayload = await res.json()
        if (!res.ok || data.error) {
          setErrorMsg(data.error ?? 'Erro ao obter resposta.')
        } else {
          const botMsg: AssistantMessageItem = {
            id: generateLocalId(),
            role: 'assistant',
            content: data.reply ?? '',
          }
          setMessages((prev) => [...prev, botMsg])
          if (data.conversation?.id) {
            setConversationId(data.conversation.id)
          }
        }
      } catch {
        setErrorMsg('Erro de rede. Tente novamente.')
      } finally {
        setIsLoading(false)
      }
    },
    [inputValue, isLoading, conversationId, focusMode, selectedAgentId, dashboardState],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setErrorMsg('Reconhecimento de voz não suportado neste navegador.')
      return
    }
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = voiceLanguage
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        transcript += result[0]?.transcript ?? ''
        if (result.isFinal) {
          setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript))
        }
      }
    }
    recognition.onerror = () => {
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
    }
    speechRecognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [voiceLanguage])

  const stopListening = useCallback(() => {
    speechRecognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  const accessLevel = dashboardState?.access?.aiAccessLevel
  const canUseAi = dashboardState?.access?.canUseAi ?? false

  if (!canUseAi) {
    return (
      <div
        className="assistant-page-wrapper"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: isEmbedded ? '300px' : '100vh',
          padding: '32px',
          fontFamily: 'var(--font-sans, sans-serif)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: '480px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary, #111)',
              marginBottom: '8px',
            }}
          >
            Assistente de IA
          </h2>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: '14px' }}>
            {accessLevel === 'none'
              ? 'Você não tem acesso ao assistente de IA. Entre em contato com o administrador.'
              : 'Configure a integração de IA nas configurações para usar o assistente.'}
          </p>
          {!isEmbedded && (
            <Link
              href="/settings"
              style={{
                display: 'inline-block',
                marginTop: '16px',
                padding: '8px 20px',
                background: 'var(--accent, #006c44)',
                color: '#fff',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Ir para Configurações
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="assistant-page-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isEmbedded ? '100%' : '100vh',
        fontFamily: 'var(--font-sans, sans-serif)',
        background: 'var(--bg-primary, #f9fafb)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      {!isEmbedded && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            background: 'var(--bg-surface, #fff)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--text-secondary, #666)',
                textDecoration: 'none',
                fontSize: '13px',
              }}
            >
              ← Voltar
            </Link>
            <span
              style={{
                fontWeight: 600,
                fontSize: '16px',
                color: 'var(--text-primary, #111)',
              }}
            >
              Assistente IA
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleShowHistory}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text-secondary, #666)',
              }}
            >
              {showHistory ? 'Fechar Histórico' : 'Histórico'}
            </button>
            <button
              onClick={handleNewConversation}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text-secondary, #666)',
              }}
            >
              Nova Conversa
            </button>
          </div>
        </header>
      )}

      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* History Sidebar */}
        {showHistory && (
          <aside
            style={{
              width: '260px',
              flexShrink: 0,
              borderRight: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg-surface, #fff)',
              overflowY: 'auto',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: '13px',
                marginBottom: '8px',
                color: 'var(--text-primary, #111)',
              }}
            >
              Conversas
            </div>
            {historyLoading ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: '13px' }}>
                Carregando...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: '13px' }}>
                Nenhuma conversa salva.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleLoadConversation(conv.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    marginBottom: '4px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background:
                      conv.id === conversationId
                        ? 'var(--accent-light, #e6f4ee)'
                        : 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-primary, #111)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {conv.title ?? 'Conversa sem título'}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary, #666)',
                      marginTop: '2px',
                    }}
                  >
                    {formatTimestamp(conv.updatedAt)}
                  </div>
                </button>
              ))
            )}
          </aside>
        )}

        {/* Main Chat Area */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg-surface, #fff)',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            {/* Focus selector */}
            <select
              value={focusMode}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setFocusMode(e.target.value as FocusMode)
              }
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '6px',
                fontSize: '12px',
                background: 'var(--bg-surface, #fff)',
                color: 'var(--text-primary, #111)',
              }}
            >
              {FOCUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Agent selector */}
            {agents.length > 0 && (
              <select
                value={selectedAgentId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setSelectedAgentId(e.target.value)
                }
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: 'var(--bg-surface, #fff)',
                  color: 'var(--text-primary, #111)',
                }}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            )}

            {activeAgent?.description && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary, #666)',
                  flexShrink: 0,
                  maxWidth: '240px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeAgent.description}
              </span>
            )}

            {isEmbedded && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleShowHistory}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-secondary, #666)',
                  }}
                >
                  {showHistory ? 'Chat' : 'Histórico'}
                </button>
                <button
                  onClick={handleNewConversation}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-secondary, #666)',
                  }}
                >
                  Nova
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            className="assistant-messages-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-secondary, #666)',
                  fontSize: '14px',
                  marginTop: '32px',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                <p>Como posso ajudar você hoje?</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background:
                      msg.role === 'user'
                        ? 'var(--accent, #006c44)'
                        : 'var(--bg-surface, #fff)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #111)',
                    border:
                      msg.role === 'assistant' ? '1px solid var(--border, #e5e7eb)' : 'none',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    background: 'var(--bg-surface, #fff)',
                    border: '1px solid var(--border, #e5e7eb)',
                    fontSize: '14px',
                    color: 'var(--text-secondary, #666)',
                  }}
                >
                  Digitando...
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '13px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg-surface, #fff)',
              flexShrink: 0,
            }}
          >
            <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={toggleListening}
                title={isListening ? 'Parar gravação' : 'Gravar voz'}
                style={{
                  flexShrink: 0,
                  width: '36px',
                  height: '36px',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '8px',
                  background: isListening ? '#fef2f2' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  color: isListening ? '#b91c1c' : 'var(--text-secondary, #666)',
                }}
              >
                {isListening ? '⏹' : '🎤'}
              </button>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem... (Enter para enviar)"
                rows={1}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  minHeight: '36px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  background: 'var(--bg-primary, #f9fafb)',
                  color: 'var(--text-primary, #111)',
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  background: 'var(--accent, #006c44)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: isLoading || !inputValue.trim() ? 0.6 : 1,
                  height: '36px',
                }}
              >
                Enviar
              </button>
            </form>
          </div>
        </main>
      </div>

      <style>{`
        .assistant-page-wrapper {
          box-sizing: border-box;
        }
        .assistant-page-wrapper * {
          box-sizing: border-box;
        }
        .assistant-messages-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--border, #e5e7eb) transparent;
        }
        .assistant-messages-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .assistant-messages-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .assistant-messages-scroll::-webkit-scrollbar-thumb {
          background-color: var(--border, #e5e7eb);
          border-radius: 2px;
        }
        @media (max-width: 640px) {
          .assistant-context-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}

