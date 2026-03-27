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
  const { access, loading, user, profile } = useUser()
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
  const userDisplayName = useMemo(
    () =>
      profile?.full_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Usuário',
    [profile?.full_name, user?.email, user?.user_metadata?.full_name]
  )
  const userPlanLabel = access?.canManageClients ? 'Workspace Owner' : 'Workspace Member'

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
    <div className="assistant-shell">
      <aside className="assistant-sidenav">
        <div className="assistant-brand">
          <h1>Luminous AI</h1>
          <p>The Synthetic Ether</p>
        </div>

        <button type="button" className="assistant-new-chat" onClick={handleResetChat}>
          <i className="bx bx-plus"></i>
          Novo Chat
        </button>

        <nav className="assistant-nav">
          <Link href="/dashboard" className="assistant-nav-item">
            <i className="bx bx-line-chart"></i>
            Apresentação
          </Link>
          <span className="assistant-nav-item active">
            <i className="bx bx-bot"></i>
            Assistente
          </span>
          <Link href="/calendar" className="assistant-nav-item">
            <i className="bx bx-calendar-event"></i>
            Agenda
          </Link>
          <Link href="/settings" className="assistant-nav-item">
            <i className="bx bx-cog"></i>
            Configurações
          </Link>
          <Link href="/privacy" className="assistant-nav-item assistant-nav-item-footer" target="_blank" rel="noreferrer">
            <i className="bx bx-shield-quarter"></i>
            Política e Privacidade
          </Link>
        </nav>

        <div className="assistant-profile">
          <div className="assistant-profile-avatar">
            <i className="bx bx-user"></i>
          </div>
          <div className="assistant-profile-copy">
            <strong>{userDisplayName}</strong>
            <span>{userPlanLabel}</span>
          </div>
        </div>
      </aside>

      <div className="assistant-main-shell">
        <header className="assistant-topbar">
          <div className="assistant-topbar-title">
            <strong>Assistente de Negócio</strong>
          </div>
          <div className="assistant-topbar-actions">
            <button type="button" className="assistant-icon-button" onClick={handleResetChat} aria-label="Limpar conversa">
              <i className="bx bx-refresh"></i>
            </button>
            <button type="button" className="assistant-icon-button" aria-label="Mais opções">
              <i className="bx bx-dots-vertical-rounded"></i>
            </button>
            <div className="assistant-topbar-user">
              <i className="bx bx-user"></i>
            </div>
          </div>
        </header>

        <main className="assistant-main">
          {!canViewDashboard ? (
            <div className="assistant-empty glass-panel">
              <h3>Sem acesso ao assistente</h3>
              <p>Seu usuário ainda não possui dashboards liberados neste workspace.</p>
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
                    <span>Cliente em foco</span>
                    <div className="assistant-select-wrap">
                      <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                        <option value="">Operação inteira</option>
                        {availableClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
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
                        <span>Configuração</span>
                      </div>
                      <strong>{dashboardState?.clientGroups?.length || 0} grupos</strong>
                    </div>
                    <div className="assistant-context-stat">
                      <div>
                        <i className="bx bx-chip"></i>
                        <span>Provider</span>
                      </div>
                      <strong>{dashboardState?.globalIntegrations?.aiProvider || 'Não definido'}</strong>
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
                          selectedClient?.name
                            ? `Como estão as campanhas de ${selectedClient.name}? Quero leitura por campanha e depois um resumo com pontos positivos, atenção e urgência.`
                            : 'Como estão as campanhas do cliente em foco? Quero leitura por campanha e depois um resumo com pontos positivos, atenção e urgência.'
                        )
                      }
                    >
                      Campanhas do cliente
                    </button>
                    <button type="button" className="assistant-chip" onClick={() => setInputValue('Quais riscos você vê no contexto atual desse cliente?')}>
                      Riscos do cliente
                    </button>
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
                </div>
              </section>

              <section className="assistant-chat-panel glass-panel">
                <div className="assistant-chat-intro">
                  <h2>Assistente de Negócio</h2>
                  <p>Fale com sua IA para entender clientes, campanhas, gargalos e próximos passos da operação.</p>
                </div>

                {errorMessage && <div className="form-alert">{errorMessage}</div>}
                {chatError && <div className="form-alert">{chatError}</div>}

                <div className="assistant-messages">
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

                  {isSending ? (
                    <article className="assistant-message-row assistant-message-row-assistant">
                      <div className="assistant-avatar assistant-avatar-bot">
                        <i className="bx bx-bot"></i>
                      </div>
                      <div className="assistant-message assistant-message-assistant assistant-message-loading">
                        <span className="assistant-message-role">Assistente</span>
                        <p>Pensando na melhor resposta com base no contexto do negócio...</p>
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
                      onChange={(event) => setInputValue(event.target.value)}
                      placeholder="Pergunte sobre clientes, operação, campanhas, CRM, gargalos ou próximos passos..."
                      rows={1}
                    />
                    <div className="assistant-form-actions-inline">
                      <button type="button" className="assistant-form-icon" aria-label="Microfone">
                        <i className="bx bx-microphone"></i>
                      </button>
                      <button type="submit" className="assistant-submit" disabled={isSending || !inputValue.trim()}>
                        <i className="bx bx-up-arrow-alt"></i>
                      </button>
                    </div>
                  </div>
                  <div className="assistant-form-footer">
                    <div className="assistant-form-signals">
                      <span><i className="bx bx-bolt-circle"></i> {dashboardState?.globalIntegrations?.aiModel || 'Modelo configurado'}</span>
                      <span><i className="bx bx-shield-quarter"></i> Contexto interno ativo</span>
                    </div>
                    <span>Enter para enviar / Shift+Enter para nova linha</span>
                  </div>
                </form>
              </section>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .assistant-shell {
          min-height: 100vh;
          background:
            radial-gradient(circle at top center, rgba(123, 209, 250, 0.08), transparent 24%),
            linear-gradient(180deg, #0b1326 0%, #0a1020 100%);
          color: #dae2fd;
        }

        .assistant-sidenav {
          position: fixed;
          inset: 0 auto 0 0;
          width: 264px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 28px 18px 20px;
          background: rgba(19, 27, 46, 0.94);
          border-right: 1px solid rgba(66, 70, 85, 0.35);
          z-index: 30;
        }

        .assistant-brand h1,
        .assistant-chat-intro h2 {
          margin: 0;
          font-size: clamp(24px, 4vw, 36px);
          line-height: 0.95;
          letter-spacing: -0.04em;
          color: #f6f7fb;
        }

        .assistant-brand p,
        .assistant-chat-intro p,
        .assistant-status-card p,
        .assistant-message p,
        .assistant-context-card p {
          margin: 0;
          color: #b5bfd6;
          line-height: 1.65;
        }

        .assistant-brand p {
          margin-top: 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(194, 198, 215, 0.72);
        }

        .assistant-new-chat {
          border: none;
          border-radius: 16px;
          min-height: 52px;
          background: linear-gradient(135deg, #b0c6ff 0%, #558dff 100%);
          color: #071326;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 18px 40px rgba(85, 141, 255, 0.2);
        }

        .assistant-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .assistant-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 48px;
          padding: 0 16px;
          border-radius: 0 16px 16px 0;
          color: #c2c6d7;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          transition: 180ms ease;
        }

        .assistant-nav-item i {
          font-size: 18px;
        }

        .assistant-nav-item:hover {
          background: rgba(34, 42, 61, 0.65);
          color: #e7ecfb;
        }

        .assistant-nav-item.active {
          background: rgba(34, 42, 61, 0.95);
          border-left: 4px solid #7bd1fa;
          color: #7bd1fa;
          padding-left: 12px;
        }

        .assistant-nav-item-footer {
          margin-top: auto;
        }

        .assistant-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 8px 4px;
          border-top: 1px solid rgba(66, 70, 85, 0.24);
        }

        .assistant-profile-avatar,
        .assistant-topbar-user,
        .assistant-avatar {
          display: grid;
          place-items: center;
          border-radius: 14px;
        }

        .assistant-profile-avatar {
          width: 38px;
          height: 38px;
          background: rgba(45, 52, 73, 0.88);
          border: 1px solid rgba(176, 198, 255, 0.16);
          color: #dae2fd;
        }

        .assistant-profile-copy {
          display: grid;
          gap: 3px;
        }

        .assistant-profile-copy strong {
          font-size: 13px;
          color: #f6f7fb;
        }

        .assistant-profile-copy span {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(194, 198, 215, 0.62);
        }

        .assistant-main-shell {
          margin-left: 264px;
          min-height: 100vh;
          display: grid;
          grid-template-rows: 72px minmax(0, 1fr);
        }

        .assistant-topbar {
          position: sticky;
          top: 0;
          z-index: 20;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          background: rgba(11, 19, 38, 0.82);
          backdrop-filter: blur(22px);
          border-bottom: 1px solid rgba(66, 70, 85, 0.22);
        }

        .assistant-topbar-title strong {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .assistant-topbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .assistant-icon-button {
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: #c2c6d7;
          cursor: pointer;
          transition: 180ms ease;
        }

        .assistant-icon-button:hover {
          background: rgba(34, 42, 61, 0.7);
          color: #7bd1fa;
        }

        .assistant-topbar-user {
          width: 38px;
          height: 38px;
          background: rgba(34, 42, 61, 0.8);
          border: 1px solid rgba(66, 70, 85, 0.3);
          color: #dae2fd;
        }

        .assistant-main {
          padding: 24px;
        }

        .assistant-empty {
          padding: 28px;
          border-radius: 24px;
        }

        .assistant-content {
          height: calc(100vh - 120px);
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 24px;
        }

        .glass-panel {
          background: rgba(23, 31, 51, 0.68);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(66, 70, 85, 0.18);
          box-shadow: 0 18px 60px rgba(2, 6, 23, 0.32);
        }

        .assistant-context-column {
          display: grid;
          align-content: start;
          gap: 18px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .assistant-context-card,
        .assistant-status-card {
          padding: 22px;
          border-radius: 22px;
        }

        .assistant-section-head {
          margin-bottom: 18px;
        }

        .assistant-section-kicker,
        .assistant-message-role {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: #7bd1fa;
          font-weight: 800;
        }

        .assistant-field {
          display: grid;
          gap: 8px;
          margin-bottom: 18px;
        }

        .assistant-field span {
          font-size: 12px;
          color: #c2c6d7;
          font-weight: 600;
        }

        .assistant-select-wrap {
          position: relative;
        }

        .assistant-select-wrap select {
          width: 100%;
          min-height: 50px;
          border-radius: 16px;
          border: 1px solid rgba(66, 70, 85, 0.34);
          background: rgba(45, 52, 73, 0.74);
          color: #dae2fd;
          padding: 0 44px 0 16px;
          outline: none;
          appearance: none;
        }

        .assistant-select-wrap i {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #8c90a0;
          pointer-events: none;
        }

        .assistant-context-stats {
          display: grid;
          gap: 12px;
          margin-bottom: 18px;
        }

        .assistant-context-stat {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(19, 27, 46, 0.62);
          border: 1px solid rgba(66, 70, 85, 0.16);
        }

        .assistant-context-stat div {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #c2c6d7;
          font-size: 12px;
          font-weight: 600;
        }

        .assistant-context-stat i {
          color: #b0c6ff;
          font-size: 18px;
        }

        .assistant-context-stat strong {
          font-size: 14px;
          color: #f6f7fb;
        }

        .assistant-chip-group {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .assistant-chip {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(66, 70, 85, 0.2);
          background: rgba(34, 42, 61, 0.8);
          color: #c2c6d7;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: 180ms ease;
        }

        .assistant-chip:hover {
          color: #7bd1fa;
          border-color: rgba(123, 209, 250, 0.35);
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
          color: #c2c6d7;
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
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          border-radius: 28px;
          overflow: hidden;
        }

        .assistant-chat-intro {
          padding: 36px 36px 10px;
        }

        .assistant-chat-intro p {
          margin-top: 8px;
          max-width: 680px;
          font-size: 18px;
          font-weight: 300;
        }

        .assistant-messages {
          min-height: 0;
          overflow-y: auto;
          display: grid;
          gap: 24px;
          align-content: start;
          padding: 18px 36px 24px;
        }

        .assistant-date-separator {
          display: flex;
          justify-content: center;
        }

        .assistant-date-separator span {
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(34, 42, 61, 0.88);
          color: rgba(194, 198, 215, 0.7);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .assistant-message-row {
          display: flex;
          gap: 14px;
          max-width: min(780px, 100%);
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
          border: 1px solid rgba(66, 70, 85, 0.24);
        }

        .assistant-avatar-bot {
          background: rgba(123, 209, 250, 0.14);
          color: #7bd1fa;
          box-shadow: 0 0 24px rgba(123, 209, 250, 0.12);
        }

        .assistant-avatar-user {
          background: rgba(34, 42, 61, 0.88);
          color: #dae2fd;
        }

        .assistant-message {
          display: grid;
          gap: 10px;
          padding: 22px 24px;
          border-radius: 22px;
          border: 1px solid rgba(66, 70, 85, 0.18);
        }

        .assistant-message-assistant {
          background: rgba(45, 52, 73, 0.55);
          border-top-left-radius: 8px;
        }

        .assistant-message-user {
          background: rgba(34, 42, 61, 0.8);
          border-top-right-radius: 8px;
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
          color: #aeb6ca;
          font-size: 11px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .assistant-message-actions button:hover {
          color: #e6ebfb;
        }

        .assistant-message-copy {
          margin-left: auto;
        }

        .assistant-form-shell {
          padding: 18px 28px 24px;
        }

        .assistant-form-panel {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 8px;
          border-radius: 24px;
          background: rgba(6, 14, 32, 0.92);
          border: 1px solid rgba(66, 70, 85, 0.22);
          box-shadow:
            0 0 0 1px rgba(123, 209, 250, 0.04),
            0 20px 60px rgba(2, 6, 23, 0.38);
        }

        .assistant-form-panel textarea {
          flex: 1;
          min-height: 60px;
          max-height: 180px;
          resize: none;
          border: none;
          background: transparent;
          color: #dae2fd;
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
          border-radius: 16px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .assistant-form-icon {
          background: transparent;
          color: #9fa8bd;
        }

        .assistant-form-icon:hover {
          color: #7bd1fa;
        }

        .assistant-form-actions-inline {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .assistant-submit {
          background: linear-gradient(135deg, #b0c6ff 0%, #558dff 100%);
          color: #0a1628;
          box-shadow: 0 14px 30px rgba(85, 141, 255, 0.24);
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
          color: rgba(194, 198, 215, 0.56);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .assistant-form-signals {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }

        .assistant-form-signals span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        @media (max-width: 1120px) {
          .assistant-content {
            grid-template-columns: 1fr;
            height: auto;
          }

          .assistant-context-column {
            overflow: visible;
          }
        }

        @media (max-width: 860px) {
          .assistant-sidenav {
            position: static;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid rgba(66, 70, 85, 0.28);
          }

          .assistant-main-shell {
            margin-left: 0;
            grid-template-rows: auto minmax(0, 1fr);
          }

          .assistant-shell {
            display: block;
          }

          .assistant-topbar,
          .assistant-main {
            padding-left: 18px;
            padding-right: 18px;
          }

          .assistant-topbar {
            height: auto;
            min-height: 72px;
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
        }
      `}</style>
    </div>
  )
}
