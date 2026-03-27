'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'

const STORAGE_KEY = 'nype-assistant-chat-v1'

function createWelcomeMessage(clientName = '') {
  return {
    id: `assistant-welcome-${Date.now()}`,
    role: 'assistant',
    content: clientName
      ? `Estou pronto para conversar sobre o negócio. Posso te ajudar com leituras sobre ${clientName}, operação, campanhas, CRM e próximos passos.`
      : 'Estou pronto para conversar sobre o negócio. Posso te ajudar com clientes, operação, campanhas, CRM e próximos passos.',
  }
}

function normalizeStoredMessages(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => ({
      id: String(item?.id || `msg-${Math.random().toString(16).slice(2)}`),
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content)
    .slice(-20)
}

export default function AssistantPage() {
  const { access, loading } = useUser()
  const canViewDashboard = access?.canViewDashboard !== false

  const [dashboardState, setDashboardState] = useState(null)
  const [isLoadingState, setIsLoadingState] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [chatError, setChatError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState([])

  const availableClients = useMemo(
    () => (Array.isArray(dashboardState?.clients) ? dashboardState.clients : []),
    [dashboardState]
  )
  const selectedClient = useMemo(
    () => availableClients.find((client) => client.id === selectedClientId) || null,
    [availableClients, selectedClientId]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      setMessages(normalizeStoredMessages(parsed.messages))
      setSelectedClientId(String(parsed.selectedClientId || ''))
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedClientId,
        messages: messages.slice(-20),
      })
    )
  }, [messages, selectedClientId])

  const loadDashboardState = useCallback(async () => {
    try {
      setIsLoadingState(true)
      setErrorMessage('')

      const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar o contexto do assistente.')
      }

      setDashboardState(data)
      setSelectedClientId((current) => current || data?.activeClientId || data?.clients?.[0]?.id || '')
      setMessages((current) => (current.length ? current : [createWelcomeMessage(data?.clients?.[0]?.name || '')]))
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar o contexto do assistente.')
    } finally {
      setIsLoadingState(false)
    }
  }, [])

  useEffect(() => {
    if (loading || !canViewDashboard) return
    loadDashboardState()
  }, [loading, canViewDashboard, loadDashboardState])

  const handleSend = async (event) => {
    event.preventDefault()

    const prompt = inputValue.trim()
    if (!prompt || isSending) return

    const nextUserMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    }

    const nextMessages = [...messages, nextUserMessage]
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
          clientId: selectedClientId,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível gerar a resposta do assistente.')
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
      setChatError(error.message || 'Não foi possível gerar a resposta do assistente.')
    } finally {
      setIsSending(false)
    }
  }

  const handleResetChat = () => {
    setMessages([createWelcomeMessage(selectedClient?.name || availableClients[0]?.name || '')])
    setChatError('')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <div className="dashboard-container">
      <aside className="sidebar glass-panel">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <span>Dash</span>
        </div>

        <nav className="nav-menu">
          <Link href="/dashboard" className="nav-item">
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
      </aside>

      <main className="main-content settings-main">
        <section className="glass-panel settings-panel assistant-panel">
          <div className="settings-head assistant-head">
            <div>
              <h1>Assistente do negócio</h1>
              <p>Converse com a IA usando o contexto do workspace, clientes, integrações e estrutura atual do app.</p>
            </div>
            <div className="assistant-head-actions">
              <button type="button" className="btn btn-secondary" onClick={handleResetChat}>
                Limpar conversa
              </button>
            </div>
          </div>

          {!canViewDashboard ? (
            <div className="empty-panel glass-item">
              <h3>Sem acesso ao assistente</h3>
              <p>Seu usuário ainda não possui dashboards liberados neste workspace.</p>
            </div>
          ) : isLoadingState ? (
            <div className="empty-panel glass-item">
              <h3>Carregando contexto do negócio</h3>
              <p>Estamos preparando os dados internos para a conversa.</p>
            </div>
          ) : (
            <div className="assistant-layout">
              <aside className="glass-item assistant-sidebar">
                <div className="assistant-sidebar-block">
                  <span className="assistant-kicker">Escopo</span>
                  <h2>Contexto da conversa</h2>
                  <p>Escolha um cliente para orientar melhor as respostas. Sem seleção específica, a IA responde olhando a operação como um todo.</p>
                </div>

                <label className="assistant-field">
                  <span>Cliente em foco</span>
                  <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                    <option value="">Operação inteira</option>
                    {availableClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="assistant-sidebar-block assistant-context-card">
                  <span className="assistant-kicker">Resumo</span>
                  <strong>{selectedClient?.name || 'Visão geral da operação'}</strong>
                  <ul>
                    <li>{availableClients.length} cliente(s) visível(is) no workspace</li>
                    <li>{dashboardState?.clientGroups?.length || 0} grupo(s) configurado(s)</li>
                    <li>Provider atual: {dashboardState?.globalIntegrations?.aiProvider || 'não configurado'}</li>
                  </ul>
                </div>

                <div className="assistant-sidebar-block assistant-suggestion-card">
                  <span className="assistant-kicker">Perguntas úteis</span>
                  <button type="button" className="assistant-suggestion" onClick={() => setInputValue('Me dê um resumo executivo da operação, com pontos positivos, atenção e urgência.')}>
                    Resumo executivo da operação
                  </button>
                  <button
                    type="button"
                    className="assistant-suggestion"
                    onClick={() =>
                      setInputValue(
                        selectedClient?.name
                          ? `Como estão as campanhas de ${selectedClient.name}? Quero leitura por campanha e depois um resumo com pontos positivos, atenção e urgência.`
                          : 'Como estão as campanhas do cliente em foco? Quero leitura por campanha e depois um resumo com pontos positivos, atenção e urgência.'
                      )
                    }
                  >
                    Campanhas do cliente em foco
                  </button>
                  <button type="button" className="assistant-suggestion" onClick={() => setInputValue('Quais riscos você vê no contexto atual desse cliente?')}>
                    Riscos do cliente em foco
                  </button>
                  <button type="button" className="assistant-suggestion" onClick={() => setInputValue('Quais integrações ou dados ainda parecem faltar para uma análise mais completa?')}>
                    Gaps de dados e integrações
                  </button>
                </div>
              </aside>

              <section className="glass-item assistant-chat-shell">
                {errorMessage && <div className="form-alert">{errorMessage}</div>}
                {chatError && <div className="form-alert">{chatError}</div>}

                <div className="assistant-messages">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`assistant-message assistant-message-${message.role}`}
                    >
                      <span className="assistant-message-role">
                        {message.role === 'assistant' ? 'Assistente' : 'Você'}
                      </span>
                      <p>{message.content}</p>
                    </article>
                  ))}
                  {isSending ? (
                    <article className="assistant-message assistant-message-assistant assistant-message-loading">
                      <span className="assistant-message-role">Assistente</span>
                      <p>Pensando na melhor resposta com base no contexto do negócio...</p>
                    </article>
                  ) : null}
                </div>

                <form className="assistant-form" onSubmit={handleSend}>
                  <textarea
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="Pergunte sobre clientes, operação, campanhas, CRM, gargalos ou próximos passos..."
                    rows={4}
                  />
                  <div className="assistant-form-actions">
                    <span className="assistant-form-hint">
                      Primeira versão com foco em dados internos do app. Busca externa pode entrar na próxima etapa.
                    </span>
                    <button type="submit" className="btn btn-primary" disabled={isSending || !inputValue.trim()}>
                      {isSending ? 'Respondendo...' : 'Enviar'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .assistant-panel {
          gap: 20px;
        }

        .assistant-layout {
          display: grid;
          grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
          gap: 18px;
        }

        .assistant-sidebar,
        .assistant-chat-shell {
          display: grid;
          gap: 18px;
          padding: 20px;
        }

        .assistant-sidebar {
          align-content: start;
        }

        .assistant-sidebar-block {
          display: grid;
          gap: 10px;
        }

        .assistant-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-sidebar h2,
        .assistant-head h1 {
          margin: 0;
          color: var(--text-primary);
        }

        .assistant-sidebar p,
        .assistant-context-card li,
        .assistant-form-hint,
        .assistant-message p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .assistant-field {
          display: grid;
          gap: 8px;
        }

        .assistant-field span {
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
        }

        .assistant-field select,
        .assistant-form textarea {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.58);
          color: var(--text-primary);
          padding: 14px 16px;
          outline: none;
        }

        .assistant-context-card,
        .assistant-suggestion-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 16px;
        }

        .assistant-context-card strong {
          color: var(--text-primary);
          font-size: 18px;
        }

        .assistant-context-card ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 8px;
        }

        .assistant-suggestion {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
          border-radius: 14px;
          padding: 12px 14px;
          text-align: left;
          cursor: pointer;
        }

        .assistant-suggestion:hover {
          border-color: rgba(59, 130, 246, 0.34);
          background: rgba(59, 130, 246, 0.08);
        }

        .assistant-chat-shell {
          min-height: 72vh;
          grid-template-rows: minmax(0, 1fr) auto;
        }

        .assistant-messages {
          min-height: 0;
          overflow-y: auto;
          display: grid;
          gap: 14px;
          align-content: start;
          padding-right: 4px;
        }

        .assistant-message {
          display: grid;
          gap: 8px;
          padding: 16px 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .assistant-message-user {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.24);
        }

        .assistant-message-assistant {
          background: rgba(255, 255, 255, 0.03);
        }

        .assistant-message-loading {
          opacity: 0.8;
        }

        .assistant-message-role {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-form {
          display: grid;
          gap: 12px;
        }

        .assistant-form textarea {
          min-height: 112px;
          resize: vertical;
        }

        .assistant-form-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .assistant-head-actions {
          display: flex;
          gap: 12px;
        }

        @media (max-width: 980px) {
          .assistant-layout {
            grid-template-columns: 1fr;
          }

          .assistant-chat-shell {
            min-height: auto;
          }
        }
      `}</style>
    </div>
  )
}
