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

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

function createWelcomeMessage(clientName = ''): AssistantMessageItem {
  return {
    id: `assistant-welcome-${Date.now()}`,
    role: 'assistant',
    content: clientName
      ? `Estou pronto para conversar sobre o negócio. Posso te ajudar com leituras sobre ${clientName}, operação, campanhas, CRM e próximos passos.`
      : 'Estou pronto para conversar sobre o negócio. Posso te ajudar com clientes, operação, campanhas, CRM e próximos passos.',
  }
}

function normalizeStoredConversationId(value: unknown): string {
  return String(value || '').trim()
}

export default function AssistantPage({ embeddedOverride = null }: AssistantPageProps = {}) {
  const { access, loading, user, profile } = useUser()
  const canViewDashboard = access?.canViewDashboard !== false
  const canUseAi = access?.canUseAi !== false && canViewDashboard
  const [detectedEmbedded, setDetectedEmbedded] = useState(false)
  const isEmbedded = embeddedOverride ?? detectedEmbedded

  const [dashboardState, setDashboardState] = useState<AssistantDashboardState | null>(null)
  const [isLoadingState, setIsLoadingState] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [chatError, setChatError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [focusMode, setFocusMode] = useState<FocusMode>('operation')
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<AssistantMessageItem[]>([])
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('copilot')
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false)
  const [isVoiceSupported, setIsVoiceSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const agentMenuRef = useRef<HTMLDivElement | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const storedConversationIdRef = useRef('')

  const availableClients = useMemo(
    () => (Array.isArray(dashboardState?.clients) ? dashboardState.clients : []),
    [dashboardState]
  )
  const focusLabel = useMemo(
    () => FOCUS_OPTIONS.find((option) => option.value === focusMode)?.label || 'Operação',
    [focusMode]
  )
  const availableAgents = useMemo(
    () => (Array.isArray(dashboardState?.globalIntegrations?.aiAgents) ? dashboardState.globalIntegrations.aiAgents : []),
    [dashboardState]
  )
  const selectedAgent = useMemo(
    () => availableAgents.find((agent) => agent.id === selectedAgentId) || availableAgents[0] || null,
    [availableAgents, selectedAgentId]
  )
  const userDisplayName = useMemo(
    () =>
      profile?.full_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Usuário',
    [profile?.full_name, user?.email, user?.user_metadata?.full_name]
  )
  const userPlanLabel = access?.canManageClients ? 'Workspace Owner' : 'Workspace Member'
  const aiAccessLevel = dashboardState?.access?.aiAccessLevel || access?.aiAccessLevel || 'team'
  const aiAccessLabel = aiAccessLevel === 'master' ? 'IA Master' : 'IA Time'
  const aiAccessDescription =
    aiAccessLevel === 'master'
      ? 'Acesso total ao contexto interno do workspace.'
      : 'Acesso restrito a dados de campanha.'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      setFocusMode(
        FOCUS_OPTIONS.some((option) => option.value === parsed.focusMode)
          ? (parsed.focusMode as FocusMode)
          : 'operation'
      )
      setSelectedAgentId(String(parsed.agentId || 'copilot'))
      storedConversationIdRef.current = normalizeStoredConversationId(parsed.conversationId)
    } catch {}
  }, [])

  useEffect(() => {
    if (embeddedOverride !== null) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setDetectedEmbedded(params.get('embed') === '1')
  }, [embeddedOverride])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEY,
        JSON.stringify({
          focusMode,
          agentId: selectedAgentId,
          conversationId: selectedConversationId,
        })
      )
  }, [focusMode, selectedAgentId, selectedConversationId])

  useEffect(() => {
    if (!availableAgents.length) return
    if (!availableAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(availableAgents[0].id)
    }
  }, [availableAgents, selectedAgentId])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSending])

  useEffect(() => {
    if (!isAgentMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!agentMenuRef.current?.contains(event.target as Node)) {
        setIsAgentMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isAgentMenuOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!Recognition) {
      setIsVoiceSupported(false)
      return
    }

    setIsVoiceSupported(true)

    const recognition = new Recognition()
    recognition.lang = DEFAULT_VOICE_LANGUAGE
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = String(result?.[0]?.transcript || '').trim()
        if (!transcript) continue

        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim()
        } else {
          interimText = `${interimText} ${transcript}`.trim()
        }
      }

      setVoiceTranscript(interimText)

      if (finalText) {
        setInputValue((current) => `${current.trim()} ${finalText}`.trim())
      }
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      setVoiceTranscript('')

      if (event.error === 'not-allowed') {
        setChatError('Permita o uso do microfone no navegador para conversar por voz.')
        return
      }

      if (event.error === 'no-speech') {
        return
      }

      setChatError('Não foi possível capturar o áudio agora. Tente novamente.')
    }

    recognition.onend = () => {
      setIsListening(false)
      setVoiceTranscript('')
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
      recognitionRef.current = null
      setIsListening(false)
      setVoiceTranscript('')
    }
  }, [])

  const loadDashboardState = useCallback(async () => {
    try {
      setIsLoadingState(true)
      setErrorMessage('')

      const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as AssistantDashboardState | null

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar o contexto do assistente.')
      }

      setDashboardState(data)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o contexto do assistente.'
      )
    } finally {
      setIsLoadingState(false)
    }
  }, [])

  const applyWelcomeConversation = useCallback(() => {
    setMessages([createWelcomeMessage(dashboardState?.clients?.[0]?.name || '')])
  }, [dashboardState?.clients])

  const loadConversationDetail = useCallback(
    async (conversationId: string) => {
      if (!conversationId) {
        setSelectedConversationId('')
        applyWelcomeConversation()
        return
      }

      setIsLoadingConversations(true)

      try {
        const response = await fetch(`/api/ai/conversations/${conversationId}`, { cache: 'no-store' })
        const data = (await response.json().catch(() => null)) as AssistantConversationDetail | null

        if (!response.ok) {
          throw new Error(data && 'conversation' in data ? 'Não foi possível abrir a conversa.' : 'Não foi possível abrir a conversa.')
        }

        setSelectedConversationId(conversationId)
        setMessages(
          data?.messages?.length
            ? data.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
              }))
            : [createWelcomeMessage(dashboardState?.clients?.[0]?.name || '')]
        )
      } catch (error) {
        setChatError(
          error instanceof Error ? error.message : 'Não foi possível abrir a conversa.'
        )
        applyWelcomeConversation()
      } finally {
        setIsLoadingConversations(false)
      }
    },
    [applyWelcomeConversation, dashboardState?.clients]
  )

  const loadConversations = useCallback(async () => {
    if (!dashboardState) return

    setIsLoadingConversations(true)

    try {
      const response = await fetch('/api/ai/conversations', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as { conversations?: AssistantConversationSummary[]; error?: string } | null

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar as conversas.')
      }

      const nextConversations = Array.isArray(data?.conversations) ? data.conversations : []
      setConversations(nextConversations)

      const preferredConversationId =
        storedConversationIdRef.current && nextConversations.some((conversation) => conversation.id === storedConversationIdRef.current)
          ? storedConversationIdRef.current
          : selectedConversationId && nextConversations.some((conversation) => conversation.id === selectedConversationId)
            ? selectedConversationId
            : nextConversations[0]?.id || ''

      if (preferredConversationId) {
        await loadConversationDetail(preferredConversationId)
      } else {
        setSelectedConversationId('')
        applyWelcomeConversation()
      }
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'Não foi possível carregar as conversas.'
      )
      applyWelcomeConversation()
    } finally {
      setIsLoadingConversations(false)
    }
  }, [applyWelcomeConversation, dashboardState, loadConversationDetail, selectedConversationId])

  useEffect(() => {
    if (loading || !canUseAi) return
    loadDashboardState()
  }, [loading, canUseAi, loadDashboardState])

  useEffect(() => {
    if (!dashboardState || isLoadingState || loading || !canUseAi) return
    loadConversations()
  }, [canUseAi, dashboardState, isLoadingState, loadConversations, loading])

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const prompt = inputValue.trim()
    if (!prompt || isSending) return

    const nextUserMessage: AssistantMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    }

    const nextMessages: AssistantMessageItem[] = [...messages, nextUserMessage]
    setMessages(nextMessages)
    setInputValue('')
    setChatError('')

    try {
      setIsSending(true)

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversationId,
          clientId: focusMode === 'operation' ? String(dashboardState?.activeClientId || '') : '',
          contextSnapshot: {
            focusMode,
            agentId: selectedAgentId,
          },
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const data = (await response.json().catch(() => null)) as AssistantReplyPayload | null

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível gerar a resposta do assistente.')
      }

      if (data?.conversation?.id) {
        setSelectedConversationId(data.conversation.id)
        setConversations((current) => {
          const nextItem = data.conversation as AssistantConversationSummary
          const remaining = current.filter((conversation) => conversation.id !== nextItem.id)
          return [nextItem, ...remaining].slice(0, 20)
        })
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: String(data?.reply || '').trim() || 'Não consegui formular uma resposta útil agora.',
        },
      ])
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar a resposta do assistente.'
      )
    } finally {
      setIsSending(false)
    }
  }

  const handleCreateConversation = async () => {
    recognitionRef.current?.stop()
    setChatError('')
    setVoiceTranscript('')
    setInputValue('')

    try {
      const response = await fetch('/api/ai/conversations', {
        method: 'POST',
      })
      const data = (await response.json().catch(() => null)) as { conversation?: AssistantConversationSummary; error?: string } | null

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível criar uma nova conversa.')
      }

      if (data?.conversation) {
        setSelectedConversationId(data.conversation.id)
        setConversations((current) => [data.conversation as AssistantConversationSummary, ...current].slice(0, 20))
      } else {
        setSelectedConversationId('')
      }

      applyWelcomeConversation()
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'Não foi possível criar uma nova conversa.'
      )
      setSelectedConversationId('')
      applyWelcomeConversation()
    }
  }

  const handleToggleListening = () => {
    if (!isVoiceSupported || !recognitionRef.current) {
      setChatError('O ditado por voz não é suportado neste navegador.')
      return
    }

    setChatError('')

    if (isListening) {
      recognitionRef.current.stop()
      return
    }

    setVoiceTranscript('')
    recognitionRef.current.start()
    setIsListening(true)
  }

  const AssistantContentTag = isEmbedded ? 'div' : 'main'

  const assistantMainContent = (
    <AssistantContentTag className={`${isEmbedded ? 'assistant-embedded-content' : 'main-content'} assistant-main ${isEmbedded ? 'assistant-main-embedded' : ''}`}>
      <header className={`header assistant-page-header ${isEmbedded ? 'assistant-page-header-embedded' : ''}`}>
        <div className="page-title">
          <h1>Assistente de Negócio</h1>
          <p>Converse com a IA da operação usando o mesmo contexto do app inteiro, sem sair do fluxo principal.</p>
        </div>
        <div className="header-actions assistant-header-actions">
          <button type="button" className="btn btn-secondary assistant-header-button" onClick={handleCreateConversation}>
            <i className="bx bx-message-square-add"></i>
            Nova conversa
          </button>
        </div>
      </header>

        {!canUseAi ? (
          <div className="assistant-empty glass-panel">
            <h3>Sem acesso ao assistente</h3>
            <p>Seu usuário ainda não possui liberação para usar a IA neste workspace.</p>
          </div>
        ) : isLoadingState ? (
          <div className="assistant-empty glass-panel">
            <h3>Carregando contexto do negócio</h3>
            <p>Estamos preparando os dados internos para a conversa.</p>
          </div>
        ) : (
          <div className="assistant-content">
            <section className="assistant-context-column">
              <div className="assistant-context-card glass-panel">
                <div className="assistant-section-head">
                  <span className="assistant-section-kicker">Contexto da conversa</span>
                </div>

                <label className="assistant-field">
                  <span>Foco</span>
                  <div className="assistant-select-wrap">
                    <select
                      value={focusMode}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setFocusMode(event.target.value as FocusMode)
                      }
                    >
                      {FOCUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <i className="bx bx-chevron-down"></i>
                  </div>
                </label>

                <div className="assistant-context-stats">
                  <div className="assistant-context-stat">
                    <div>
                      <i className="bx bx-group"></i>
                      <span>Clientes</span>
                    </div>
                    <strong>{availableClients.length}</strong>
                  </div>
                  <div className="assistant-context-stat">
                    <div>
                      <i className="bx bx-sitemap"></i>
                      <span>Grupos</span>
                    </div>
                    <strong>{dashboardState?.clientGroups?.length || 0}</strong>
                  </div>
                  <div className="assistant-context-stat assistant-context-stat-provider">
                    <div>
                      <i className="bx bx-chip"></i>
                      <span>Provider</span>
                    </div>
                    <strong>{dashboardState?.globalIntegrations?.aiProvider || 'Nao definido'}</strong>
                    <small>{dashboardState?.globalIntegrations?.aiModel || 'Modelo padrao'}</small>
                  </div>
                </div>

                <div className="assistant-chip-group">
                  <button type="button" className="assistant-chip" onClick={() => setInputValue('Me dê um resumo executivo da operação, com pontos positivos, atenção e urgência.')}>
                    Resumo executivo
                  </button>
                  <button
                    type="button"
                    className="assistant-chip"
                    onClick={() =>
                      setInputValue(
                        focusMode === 'clients'
                          ? 'Quais clientes estão com melhor momento, quais pedem atenção e quais estão em urgência?'
                          : focusMode === 'general'
                            ? 'Me dê uma leitura geral do app inteiro, cruzando operação, clientes, campanhas e gargalos.'
                            : `Como está a operação em foco? Quero leitura por campanha, impacto e depois um resumo com pontos positivos, atenção e urgência.`
                      )
                    }
                  >
                    {focusMode === 'clients' ? 'Leitura dos clientes' : focusMode === 'general' ? 'Visão geral do app' : 'Campanhas da operação'}
                  </button>
                  <button
                    type="button"
                    className="assistant-chip"
                    onClick={() =>
                      setInputValue(
                        focusMode === 'clients'
                          ? 'Quais riscos você vê hoje na base de clientes?'
                          : focusMode === 'general'
                            ? 'Quais riscos você vê hoje olhando o app inteiro como um copiloto da operação?'
                            : 'Quais riscos você vê hoje na operação em foco?'
                      )
                    }
                  >
                    {focusMode === 'general' ? 'Riscos gerais' : focusMode === 'clients' ? 'Riscos dos clientes' : 'Riscos da operação'}
                  </button>
                </div>

              </div>

              <div className="assistant-history-card glass-panel">
                <div className="assistant-section-head assistant-history-head">
                  <span className="assistant-section-kicker">Conversas salvas</span>
                  <button type="button" className="assistant-history-new" onClick={handleCreateConversation}>
                    <i className="bx bx-plus"></i>
                    Nova
                  </button>
                </div>

                <div className="assistant-history-list">
                  {conversations.length ? (
                    conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        className={`assistant-history-item ${selectedConversationId === conversation.id ? 'active' : ''}`}
                        onClick={() => loadConversationDetail(conversation.id)}
                      >
                        <strong>{conversation.title}</strong>
                        <span>{conversation.preview || 'Sem mensagens ainda.'}</span>
                      </button>
                    ))
                  ) : (
                    <div className="assistant-history-empty">
                      {isLoadingConversations ? 'Carregando conversas...' : 'Suas novas conversas vão aparecer aqui.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="assistant-status-card glass-panel">
                <div className="assistant-status-head">
                  <span className="assistant-status-dot"></span>
                  <span>Status do sistema</span>
                </div>
                <p>
                  Operação pronta para conversa com contexto interno do workspace. A próxima etapa pode conectar busca externa e ações automatizadas.
                </p>
                <div className="assistant-access-badge">
                  <strong>{aiAccessLabel}</strong>
                  <span>{aiAccessDescription}</span>
                </div>
              </div>
            </section>

            <section className="assistant-chat-panel glass-panel">
              <div className={`assistant-chat-intro ${isEmbedded ? 'assistant-chat-intro-embedded' : ''}`}>
                <h2>{isEmbedded ? 'Vamos organizar a operação?' : 'Assistente de Negócio'}</h2>
                <p>
                  {isEmbedded
                    ? 'Use esse espaço como copiloto do dia para cruzar clientes, campanhas, rotina e próximos passos.'
                    : 'Fale com sua IA para entender clientes, campanhas, gargalos e próximos passos da operação.'}
                </p>
              </div>

              {errorMessage && <div className="form-alert">{errorMessage}</div>}
              {chatError && <div className="form-alert">{chatError}</div>}

              <div className="assistant-messages" ref={messagesContainerRef}>
                <div className="assistant-date-separator">
                  <span>Hoje</span>
                </div>

                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`assistant-message-row assistant-message-row-${message.role}`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="assistant-avatar assistant-avatar-bot">
                        <i className="bx bx-bot"></i>
                      </div>
                    ) : null}

                    <div className={`assistant-message assistant-message-${message.role}`}>
                      <span className="assistant-message-role">
                        {message.role === 'assistant' ? 'Assistente' : 'Você'}
                      </span>
                      <p>{message.content}</p>
                      {message.role === 'assistant' ? (
                        <div className="assistant-message-actions">
                          <button type="button">
                            <i className="bx bx-like"></i>
                            Útil
                          </button>
                          <button type="button">
                            <i className="bx bx-dislike"></i>
                            Não ajudou
                          </button>
                          <button type="button" className="assistant-message-copy" onClick={() => navigator?.clipboard?.writeText(message.content)}>
                            <i className="bx bx-copy-alt"></i>
                            Copiar
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {message.role === 'user' ? (
                      <div className="assistant-avatar assistant-avatar-user">
                        <i className="bx bx-user"></i>
                      </div>
                    ) : null}
                  </article>
                ))}

                {isSending || isLoadingConversations ? (
                  <article className="assistant-message-row assistant-message-row-assistant">
                    <div className="assistant-avatar assistant-avatar-bot">
                      <i className="bx bx-bot"></i>
                    </div>
                    <div className="assistant-message assistant-message-assistant assistant-message-loading">
                      <span className="assistant-message-role">Assistente</span>
                      <p>{isLoadingConversations ? 'Abrindo conversa salva...' : 'Pensando na melhor resposta com base no contexto do negócio...'}</p>
                    </div>
                  </article>
                ) : null}
              </div>

              <form className="assistant-form-shell" onSubmit={handleSend}>
                <div className="assistant-form-panel">
                  <button type="button" className="assistant-form-icon" aria-label="Anexar">
                    <i className="bx bx-paperclip"></i>
                  </button>
                  <textarea
                    value={inputValue}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setInputValue(event.target.value)
                    }
                    placeholder="Pergunte sobre clientes, operação, campanhas, CRM, gargalos ou próximos passos..."
                    rows={1}
                  />
                  <div className="assistant-form-actions-inline">
                    <button
                      type="button"
                      className={`assistant-form-icon ${isListening ? 'assistant-form-icon-active' : ''}`}
                      aria-label={isListening ? 'Parar microfone' : 'Ativar microfone'}
                      aria-pressed={isListening}
                      onClick={handleToggleListening}
                    >
                      <i className={`bx ${isListening ? 'bx-microphone-off' : 'bx-microphone'}`}></i>
                    </button>
                    <button type="submit" className="assistant-submit" disabled={isSending || isLoadingConversations || !inputValue.trim()}>
                      <i className="bx bx-up-arrow-alt"></i>
                    </button>
                  </div>
                </div>
                <div className="assistant-form-footer">
                  <div className="assistant-form-signals">
                    {availableAgents.length ? (
                      <div className="assistant-agent-toolbar" ref={agentMenuRef}>
                        <button
                          type="button"
                          className={`assistant-agent-trigger ${isAgentMenuOpen ? 'active' : ''}`}
                          onClick={() => setIsAgentMenuOpen((current) => !current)}
                        >
                          <span className="assistant-agent-trigger-copy">
                            <i className="bx bx-bot"></i>
                            <span>{selectedAgent ? selectedAgent.name : 'Selecionar agente'}</span>
                          </span>
                          <i className={`bx bx-chevron-down assistant-agent-chevron ${isAgentMenuOpen ? 'open' : ''}`}></i>
                        </button>
                        <div className={`assistant-agent-menu ${isAgentMenuOpen ? 'open' : ''}`}>
                          {availableAgents.map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              className={`assistant-agent-option ${selectedAgent?.id === agent.id ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedAgentId(agent.id)
                                setIsAgentMenuOpen(false)
                              }}
                            >
                              <span className="assistant-agent-option-name">{agent.name}</span>
                              {agent.description ? (
                                <span className="assistant-agent-option-description">{agent.description}</span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <span><i className="bx bx-bolt-circle"></i> {dashboardState?.globalIntegrations?.aiModel || 'Modelo configurado'}</span>
                    <span><i className="bx bx-shield-quarter"></i> Contexto interno ativo</span>
                    <span><i className="bx bx-layout"></i> {focusLabel}</span>
                    <span><i className="bx bx-lock-open-alt"></i> {aiAccessLabel}</span>
                    <span>
                      <i className={`bx ${isListening ? 'bx-loader-circle' : isVoiceSupported ? 'bx-microphone' : 'bx-microphone-off'}`}></i>
                      {isListening
                        ? 'Ouvindo agora'
                        : isVoiceSupported
                          ? 'Ditado disponível'
                          : 'Ditado indisponível'}
                    </span>
                  </div>
                  <span>{voiceTranscript ? `Ouvindo: ${voiceTranscript}` : 'Enter para enviar / Shift+Enter para nova linha'}</span>
                </div>
              </form>
            </section>
          </div>
        )}
    </AssistantContentTag>
  )

  return (
    <div className={`${isEmbedded ? 'assistant-embedded-shell' : 'dashboard-container'} assistant-shell ${isEmbedded ? 'assistant-shell-embedded' : ''}`}>
      {!isEmbedded ? (
        <aside className="sidebar glass-panel assistant-sidebar">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <span>Dash</span>
        </div>

        <nav className="nav-menu">
          <Link href="/home" className="nav-item">
            <i className="bx bx-layout"></i>
            Apresentação
          </Link>
          <span className="nav-item active">
            <i className="bx bx-bot"></i>
            Assistente
          </span>
          <Link href="/calendar" className="nav-item">
            <i className="bx bx-calendar-event"></i>
            Agenda
          </Link>
          <Link href="/settings" className="nav-item">
            <i className="bx bx-cog"></i>
            Configurações
          </Link>
          <Link href="/privacy" className="nav-item" target="_blank" rel="noreferrer">
            <i className="bx bx-shield-quarter"></i>
            Política e Privacidade
          </Link>
        </nav>

        <div className="user-profile assistant-user-profile">
          <div className="assistant-profile-avatar">
            <i className="bx bx-user"></i>
          </div>
          <div className="user-info assistant-profile-copy">
            <p className="name">{userDisplayName}</p>
            <p className="role">{userPlanLabel}</p>
          </div>
        </div>
      </aside>
      ) : null}

      {assistantMainContent}

      <style jsx global>{`
        .assistant-shell-embedded {
          min-height: 100%;
        }

        .assistant-embedded-shell {
          min-height: 100%;
        }

        .assistant-shell {
          background:
            radial-gradient(circle at top center, rgba(59, 130, 246, 0.08), transparent 22%),
            linear-gradient(180deg, var(--bg-primary) 0%, #12151c 100%);
        }

        .assistant-main-embedded {
          min-height: 100%;
          padding: 0;
        }

        .assistant-embedded-content {
          width: 100%;
        }

        .assistant-page-header-embedded {
          display: none;
        }

        .assistant-sidebar {
          gap: 0;
        }

        .assistant-chat-intro h2 {
          margin: 0;
          font-size: clamp(24px, 4vw, 36px);
          line-height: 0.95;
          letter-spacing: -0.04em;
          color: var(--text-primary);
        }

        .assistant-chat-intro p,
        .assistant-status-card p,
        .assistant-message p,
        .assistant-context-card p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        .assistant-user-profile {
          align-items: center;
        }

        .assistant-profile-avatar,
        .assistant-avatar {
          display: grid;
          place-items: center;
          border-radius: 14px;
        }

        .assistant-profile-avatar {
          width: 38px;
          height: 38px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }

        .assistant-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .assistant-header-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .assistant-main {
          display: grid;
          gap: 24px;
          min-height: 0;
        }

        .assistant-empty {
          padding: 28px;
          border-radius: 24px;
        }

        .assistant-content {
          min-height: 0;
          height: calc(100vh - 180px);
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 24px;
          align-items: stretch;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid var(--border-color);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
        }

        .assistant-context-column {
          display: grid;
          align-content: start;
          gap: 18px;
          overflow-y: auto;
          padding-right: 4px;
          min-height: 0;
        }

        .assistant-context-card,
        .assistant-status-card,
        .assistant-history-card {
          padding: 24px;
          border-radius: 20px;
        }

        .assistant-section-head {
          margin-bottom: 18px;
        }

        .assistant-history-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .assistant-history-new {
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-history-list {
          display: grid;
          gap: 10px;
        }

        .assistant-history-item {
          width: 100%;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
          color: inherit;
          text-align: left;
          display: grid;
          gap: 6px;
          cursor: pointer;
          font: inherit;
        }

        .assistant-history-item strong {
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.35;
        }

        .assistant-history-item span,
        .assistant-history-empty {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .assistant-history-item.active {
          border-color: color-mix(in srgb, var(--accent-blue) 26%, transparent);
          background: color-mix(in srgb, var(--accent-blue) 10%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-blue) 10%, transparent);
        }

        .assistant-access-badge {
          margin-top: 18px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(147, 197, 253, 0.16);
          background: rgba(59, 130, 246, 0.08);
          display: grid;
          gap: 4px;
        }

        .assistant-access-badge strong {
          color: #dbeafe;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .assistant-access-badge span {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .assistant-section-kicker,
        .assistant-message-role {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: #93c5fd;
          font-weight: 800;
        }

        .assistant-field {
          display: grid;
          gap: 8px;
          margin-bottom: 18px;
        }

        .assistant-field span {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .assistant-select-wrap {
          position: relative;
        }

        .assistant-select-wrap select {
          width: 100%;
          min-height: 50px;
          border-radius: 14px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          padding: 0 44px 0 16px;
          outline: none;
          appearance: none;
        }

        .assistant-select-wrap i {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .assistant-context-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .assistant-context-stat {
          display: grid;
          gap: 10px;
          align-content: start;
          min-height: 104px;
          padding: 16px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid var(--border-color);
          transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
        }

        .assistant-context-stat:hover {
          border-color: color-mix(in srgb, var(--accent-blue) 24%, var(--border-color));
          background: rgba(255, 255, 255, 0.038);
          transform: translateY(-1px);
        }

        .assistant-context-stat div {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 600;
        }

        .assistant-context-stat i {
          color: #93c5fd;
          font-size: 18px;
        }

        .assistant-context-stat strong {
          font-size: 14px;
          color: var(--text-primary);
          line-height: 1.25;
          font-weight: 800;
          word-break: break-word;
        }

        .assistant-context-stat-provider small {
          color: var(--text-muted);
          font-size: 10px;
          line-height: 1.35;
          font-weight: 700;
          letter-spacing: 0.02em;
          word-break: break-word;
        }

        .assistant-chip-group {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .assistant-agent-toolbar {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }

        .assistant-agent-trigger {
          min-height: 28px;
          padding: 0 8px 0 10px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: 160ms ease;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-agent-trigger:hover,
        .assistant-agent-trigger.active {
          border-color: color-mix(in srgb, var(--accent-blue) 36%, transparent);
          color: #cfe2ff;
          background: rgba(59, 130, 246, 0.08);
        }

        .assistant-agent-trigger-copy {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .assistant-agent-chevron {
          font-size: 16px;
          color: var(--text-muted);
          transition: transform 160ms ease, color 160ms ease;
        }

        .assistant-agent-chevron.open {
          transform: rotate(180deg);
          color: #93c5fd;
        }

        .assistant-agent-menu {
          position: absolute;
          left: 0;
          bottom: calc(100% + 10px);
          min-width: 280px;
          max-width: 340px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid var(--border-color);
          background: rgba(19, 23, 32, 0.98);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.34);
          opacity: 0;
          pointer-events: none;
          transform: translateY(6px);
          transition: opacity 160ms ease, transform 160ms ease;
          z-index: 20;
        }

        .assistant-agent-menu.open {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .assistant-agent-option {
          width: 100%;
          display: grid;
          gap: 4px;
          text-align: left;
          padding: 12px 14px;
          border: 1px solid transparent;
          border-radius: 12px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: 160ms ease;
        }

        .assistant-agent-option:hover,
        .assistant-agent-option.active {
          border-color: color-mix(in srgb, var(--accent-blue) 30%, transparent);
          background: rgba(59, 130, 246, 0.08);
        }

        .assistant-agent-option-name {
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 800;
        }

        .assistant-agent-option-description {
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.45;
        }

        .assistant-chip {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.035);
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: 180ms ease;
        }

        .assistant-chip:hover {
          color: #93c5fd;
          border-color: color-mix(in srgb, var(--accent-blue) 36%, transparent);
        }

        .assistant-status-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .assistant-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 18px rgba(34, 197, 94, 0.8);
        }

        .assistant-chat-panel {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          border-radius: 20px;
          overflow: hidden;
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 28%),
            rgba(255, 255, 255, 0.03);
        }

        .assistant-chat-intro {
          padding: 30px 32px 14px;
          border-bottom: 1px solid var(--border-color);
        }

        .assistant-chat-intro-embedded {
          padding-top: 26px;
          padding-bottom: 20px;
        }

        .assistant-chat-intro p {
          margin-top: 8px;
          max-width: 680px;
          font-size: 15px;
          font-weight: 400;
          color: var(--text-secondary);
        }

        .assistant-messages {
          min-height: 0;
          overflow-y: auto;
          display: grid;
          gap: 20px;
          align-content: start;
          padding: 24px 32px 24px;
          overscroll-behavior: contain;
        }

        .assistant-date-separator {
          display: flex;
          justify-content: center;
        }

        .assistant-date-separator span {
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .assistant-message-row {
          display: flex;
          gap: 14px;
          max-width: min(900px, 100%);
        }

        .assistant-message-row-user {
          margin-left: auto;
          justify-content: flex-end;
        }

        .assistant-avatar {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          margin-top: 2px;
          border: 1px solid var(--border-color);
        }

        .assistant-avatar-bot {
          background: color-mix(in srgb, var(--accent-blue) 14%, transparent);
          color: #93c5fd;
          box-shadow: 0 0 24px rgba(59, 110, 228, 0.12);
        }

        .assistant-avatar-user {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
        }

        .assistant-message {
          display: grid;
          gap: 10px;
          padding: 20px 22px;
          border-radius: 18px;
          border: 1px solid var(--border-color);
        }

        .assistant-message-assistant {
          background: linear-gradient(180deg, rgba(31, 36, 47, 0.92) 0%, rgba(27, 31, 40, 0.98) 100%);
          border-top-left-radius: 10px;
        }

        .assistant-message-user {
          background: linear-gradient(180deg, rgba(37, 43, 55, 0.96) 0%, rgba(31, 36, 46, 0.98) 100%);
          border-top-right-radius: 10px;
        }

        .assistant-message p {
          font-size: 15px;
          white-space: pre-wrap;
        }

        .assistant-message-loading {
          opacity: 0.78;
        }

        .assistant-message-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-top: 8px;
        }

        .assistant-message-actions button {
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .assistant-message-actions button:hover {
          color: #93c5fd;
        }

        .assistant-message-copy {
          margin-left: auto;
        }

        .assistant-form-shell {
          padding: 20px 28px 24px;
          border-top: 1px solid var(--border-color);
          background: linear-gradient(180deg, rgba(24, 28, 37, 0.1) 0%, rgba(16, 18, 24, 0.5) 100%);
        }

        .assistant-form-panel {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 10px;
          border-radius: 18px;
          background: rgba(12, 15, 22, 0.92);
          border: 1px solid var(--border-color);
          box-shadow:
            0 0 0 1px rgba(123, 209, 250, 0.03),
            0 20px 60px rgba(0, 0, 0, 0.28);
        }

        .assistant-form-panel textarea {
          flex: 1;
          min-height: 60px;
          max-height: 180px;
          resize: none;
          border: none;
          background: transparent;
          color: var(--text-primary);
          outline: none;
          padding: 14px 8px;
          line-height: 1.6;
        }

        .assistant-form-panel textarea::placeholder {
          color: rgba(194, 198, 215, 0.42);
        }

        .assistant-form-icon,
        .assistant-submit {
          width: 46px;
          height: 46px;
          border: none;
          border-radius: 14px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .assistant-form-icon {
          background: transparent;
          color: var(--text-muted);
        }

        .assistant-form-icon:hover {
          color: #93c5fd;
        }

        .assistant-form-icon-active {
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.14);
          box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.24);
        }

        .assistant-form-actions-inline {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .assistant-submit {
          background: linear-gradient(135deg, var(--accent-blue) 0%, #1d4ed8 100%);
          color: #eef5ff;
          box-shadow: 0 14px 30px rgba(52, 103, 233, 0.28);
        }

        .assistant-submit:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .assistant-form-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px 6px 0;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-form-signals {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: center;
        }

        .assistant-form-signals span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .assistant-main-embedded .assistant-content {
          min-height: 0;
          height: calc(100vh - 240px);
        }

        .assistant-main-embedded .assistant-context-card,
        .assistant-main-embedded .assistant-status-card,
        .assistant-main-embedded .assistant-chat-panel {
          border-radius: 24px;
        }

        :root[data-ui-mode='light'] .assistant-main .glass-panel {
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .assistant-section-kicker,
        :root[data-ui-mode='light'] .assistant-message-role,
        :root[data-ui-mode='light'] .assistant-context-stat i,
        :root[data-ui-mode='light'] .assistant-agent-chevron.open {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .assistant-select-wrap select,
        :root[data-ui-mode='light'] .assistant-context-stat,
        :root[data-ui-mode='light'] .assistant-chip,
        :root[data-ui-mode='light'] .assistant-agent-trigger {
          background: rgba(15, 23, 42, 0.025);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .assistant-context-stat:hover,
        :root[data-ui-mode='light'] .assistant-chip:hover,
        :root[data-ui-mode='light'] .assistant-agent-trigger:hover,
        :root[data-ui-mode='light'] .assistant-history-item:hover,
        :root[data-ui-mode='light'] .assistant-agent-trigger.active {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08));
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .assistant-chat-panel {
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent-blue) 10%, transparent), transparent 28%),
            rgba(255, 255, 255, 0.72);
        }

        :root[data-ui-mode='light'] .assistant-date-separator span {
          background: rgba(15, 23, 42, 0.05);
          color: var(--text-muted);
        }

        :root[data-ui-mode='light'] .assistant-avatar-bot {
          background: color-mix(in srgb, var(--accent-blue) 10%, white);
          color: var(--accent-blue);
          box-shadow: 0 0 20px color-mix(in srgb, var(--accent-blue) 16%, transparent);
        }

        :root[data-ui-mode='light'] .assistant-avatar-user {
          background: rgba(255, 255, 255, 0.88);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .assistant-message {
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .assistant-message-assistant {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
        }

        :root[data-ui-mode='light'] .assistant-message-user {
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--accent-blue) 10%, white) 0%,
            color-mix(in srgb, var(--accent-blue) 6%, white) 100%
          );
        }

        :root[data-ui-mode='light'] .assistant-message-actions button,
        :root[data-ui-mode='light'] .assistant-message-copy {
          color: var(--text-muted);
        }

        :root[data-ui-mode='light'] .assistant-message-actions button:hover {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .assistant-form-shell {
          background: linear-gradient(180deg, rgba(248, 250, 252, 0.22) 0%, rgba(226, 232, 240, 0.34) 100%);
        }

        :root[data-ui-mode='light'] .assistant-form-panel {
          background: rgba(255, 255, 255, 0.92);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow:
            0 0 0 1px rgba(78, 137, 255, 0.03),
            0 18px 40px rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .assistant-form-panel textarea {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .assistant-form-panel textarea::placeholder {
          color: rgba(71, 85, 105, 0.6);
        }

        :root[data-ui-mode='light'] .assistant-form-icon {
          color: var(--text-muted);
        }

        :root[data-ui-mode='light'] .assistant-form-icon:hover {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .assistant-form-icon-active {
          background: color-mix(in srgb, var(--accent-blue) 12%, white);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-blue) 16%, transparent);
        }

        :root[data-ui-mode='light'] .assistant-submit {
          background: linear-gradient(
            135deg,
            var(--accent-blue) 0%,
            color-mix(in srgb, var(--accent-blue) 72%, #0f172a) 100%
          );
          color: #f8fbff;
          box-shadow: 0 14px 28px color-mix(in srgb, var(--accent-blue) 18%, transparent);
        }

        :root[data-ui-mode='light'] .assistant-agent-menu {
          background: rgba(255, 255, 255, 0.98);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
        }

        :root[data-ui-mode='light'] .assistant-history-new,
        :root[data-ui-mode='light'] .assistant-history-item {
          background: rgba(255, 255, 255, 0.88);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .assistant-history-item.active,
        :root[data-ui-mode='light'] .assistant-access-badge {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .assistant-access-badge strong {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .assistant-agent-option:hover,
        :root[data-ui-mode='light'] .assistant-agent-option.active {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(15, 23, 42, 0.08));
        }

        @media (max-width: 1120px) {
          .assistant-content {
            grid-template-columns: 1fr;
            height: auto;
          }

          .assistant-context-column {
            overflow: visible;
          }

          .assistant-context-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

        }

        @media (max-width: 860px) {
          .assistant-main {
            gap: 18px;
          }

          .assistant-chat-intro,
          .assistant-messages,
          .assistant-form-shell {
            padding-left: 18px;
            padding-right: 18px;
          }

          .assistant-message-row {
            max-width: 100%;
          }

          .assistant-context-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
