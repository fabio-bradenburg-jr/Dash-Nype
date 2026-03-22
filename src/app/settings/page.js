'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'
import { DEFAULT_PREFERENCES, loadDashboardPreferences, saveDashboardPreferences } from '@/lib/dashboard-storage'

const GLOBAL_INTEGRATION_GROUPS = [
  {
    title: 'Google Ads',
    description: 'Espaço reservado para a credencial central do Google Ads da operação.',
    icon: 'bxl-google',
    accent: '#f59e0b',
    field: {
      name: 'googleAdsToken',
      label: 'Token do Google Ads',
      placeholder: 'Cole aqui o token do Google Ads',
    },
  },
  {
    title: 'TikTok Ads',
    description: 'Espaço reservado para a credencial central do TikTok Ads da operação.',
    icon: 'bxl-tiktok',
    accent: '#ec4899',
    field: {
      name: 'tiktokAdsToken',
      label: 'Token do TikTok Ads',
      placeholder: 'Cole aqui o token do TikTok Ads',
    },
  },
  {
    title: 'LinkedIn Ads',
    description: 'Espaço reservado para a credencial central do LinkedIn Ads da operação.',
    icon: 'bxl-linkedin-square',
    accent: '#22c55e',
    field: {
      name: 'linkedinAdsToken',
      label: 'Token do LinkedIn Ads',
      placeholder: 'Cole aqui o token do LinkedIn Ads',
    },
  },
  {
    title: 'RD Station CRM',
    description: 'Token central usado para leitura dos funis, negociações e métricas comerciais.',
    icon: 'bx-signal-5',
    accent: '#14b8a6',
    field: {
      name: 'rdStationToken',
      label: 'Token do RD Station',
      placeholder: 'Cole aqui o token do RD Station',
    },
  },
  {
    title: 'ClickUp',
    description: 'Espaço reservado para integrações operacionais com gestão de tarefas.',
    icon: 'bx-task',
    accent: '#8b5cf6',
    field: {
      name: 'clickUpToken',
      label: 'Token do ClickUp',
      placeholder: 'Cole aqui o token do ClickUp',
    },
  },
  {
    title: 'Salesforce',
    description: 'Espaço reservado para a credencial central do Salesforce.',
    icon: 'bxl-salesforce',
    accent: '#38bdf8',
    field: {
      name: 'salesforceToken',
      label: 'Token do Salesforce',
      placeholder: 'Cole aqui o token do Salesforce',
    },
  },
  {
    title: 'Agendor',
    description: 'Espaço reservado para a credencial central do Agendor.',
    icon: 'bx-briefcase-alt-2',
    accent: '#f97316',
    field: {
      name: 'agendorToken',
      label: 'Token do Agendor',
      placeholder: 'Cole aqui o token do Agendor',
    },
  },
]

export default function SettingsPage() {
  const { appearance, updateAppearance, access } = useUser()
  const canManageClients = Boolean(access?.canManageClients)
  const [serverState, setServerState] = useState(null)
  const [globalIntegrations, setGlobalIntegrations] = useState(() => {
    const preferences = loadDashboardPreferences()
    return {
      ...DEFAULT_PREFERENCES.globalIntegrations,
      ...(preferences.globalIntegrations || {}),
    }
  })
  const [metaConnection, setMetaConnection] = useState({
    connected: false,
    userId: '',
    userName: '',
    scopes: '',
    expiresAt: '',
  })
  const [isMetaConnectionLoading, setIsMetaConnectionLoading] = useState(false)
  const [metaConnectionError, setMetaConnectionError] = useState('')
  const [metaConnectionNotice, setMetaConnectionNotice] = useState('')
  const [metaConnectionSetupRequired, setMetaConnectionSetupRequired] = useState(false)
  const metaConnectionMode = globalIntegrations.metaConnectionMode === 'oauth' ? 'oauth' : 'manual'
  const hasMetaManualToken = Boolean(String(globalIntegrations.metaAccessToken || '').trim())
  const hasMetaOauthConnection = Boolean(metaConnection.connected)

  const persistGlobalIntegrations = useCallback(
    async (nextIntegrations) => {
      const preferences = loadDashboardPreferences()
      saveDashboardPreferences({
        ...preferences,
        globalIntegrations: nextIntegrations,
      })

      if (canManageClients && serverState) {
        const response = await fetch('/api/dashboard/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...serverState,
            globalIntegrations: nextIntegrations,
          }),
        })

        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível salvar as integrações globais.')
        }

        setServerState(data)
      }
    },
    [canManageClients, serverState]
  )

  useEffect(() => {
    if (!canManageClients) return

    let cancelled = false

    const loadServerState = async () => {
      try {
        const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = await response.json()
        if (cancelled) return

        setServerState(state)
        setGlobalIntegrations((current) => ({
          ...DEFAULT_PREFERENCES.globalIntegrations,
          ...current,
          ...(state.globalIntegrations || {}),
        }))
      } catch (error) {
        console.error('Erro ao carregar integrações globais do servidor:', error)
      }
    }

    loadServerState()

    return () => {
      cancelled = true
    }
  }, [canManageClients])

  useEffect(() => {
    if (!canManageClients) return

    let cancelled = false

    const loadMetaConnection = async () => {
      setIsMetaConnectionLoading(true)

      try {
        const response = await fetch('/api/meta/connection', { cache: 'no-store' })
        const data = await response.json().catch(() => null)

        if (cancelled) return

        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível carregar a conexão da Meta.')
        }

        setMetaConnection(
          data?.connection || {
            connected: false,
            userId: '',
            userName: '',
            scopes: '',
            expiresAt: '',
          }
        )
        setMetaConnectionSetupRequired(Boolean(data?.setupRequired))
        if (data?.error) {
          setMetaConnectionError(data.error)
        }
      } catch (error) {
        if (cancelled) return
        setMetaConnection({
          connected: false,
          userId: '',
          userName: '',
          scopes: '',
          expiresAt: '',
        })
        setMetaConnectionError(error.message || 'Não foi possível carregar a conexão da Meta.')
      } finally {
        if (!cancelled) {
          setIsMetaConnectionLoading(false)
        }
      }
    }

    loadMetaConnection()

    return () => {
      cancelled = true
    }
  }, [canManageClients])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const connected = params.get('meta_connected')
    const error = params.get('meta_error')

    if (connected === '1') {
      setMetaConnectionNotice('Conta da Meta conectada com sucesso.')
      setMetaConnectionError('')
      if (globalIntegrations.metaConnectionMode !== 'oauth') {
        const nextIntegrations = {
          ...globalIntegrations,
          metaConnectionMode: 'oauth',
        }
        setGlobalIntegrations(nextIntegrations)
        persistGlobalIntegrations(nextIntegrations).catch((persistError) => {
          console.error('Erro ao ativar o modo de conexão da Meta:', persistError)
        })
      }
    } else if (error) {
      setMetaConnectionError(error)
      setMetaConnectionNotice('')
    }
  }, [globalIntegrations, globalIntegrations.metaConnectionMode, persistGlobalIntegrations])

  const handleGlobalIntegrationChange = (fieldName, value) => {
    setGlobalIntegrations((current) => {
      const nextIntegrations = {
        ...current,
        [fieldName]: value,
      }

      persistGlobalIntegrations(nextIntegrations).catch((error) => {
        console.error('Erro ao salvar integrações globais no servidor:', error)
      })

      return nextIntegrations
    })
  }

  const handleMetaDisconnect = async () => {
    setMetaConnectionError('')
    setMetaConnectionNotice('')

    try {
      const response = await fetch('/api/meta/connection', { method: 'DELETE' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível desconectar a conta da Meta.')
      }

      setMetaConnection({
        connected: false,
        userId: '',
        userName: '',
        scopes: '',
        expiresAt: '',
      })
      setMetaConnectionNotice('Conta da Meta desconectada.')

      if (metaConnectionMode === 'oauth') {
        const nextIntegrations = {
          ...globalIntegrations,
          metaConnectionMode: 'manual',
        }

        setGlobalIntegrations(nextIntegrations)
        await persistGlobalIntegrations(nextIntegrations)
      }
    } catch (error) {
      setMetaConnectionError(error.message || 'Não foi possível desconectar a conta da Meta.')
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
          <Link href="/" className="nav-item">
            <i className="bx bx-arrow-back"></i>
            Voltar ao dashboard
          </Link>
          <Link href="/calendar" className="nav-item">
            <i className="bx bx-calendar-event"></i>
            Agenda
          </Link>
          <span className="nav-item active">
            <i className="bx bx-cog"></i>
            Configurações
          </span>
        </nav>
      </aside>

      <main className="main-content settings-main">
        <section className="glass-panel settings-panel">
          <div className="settings-head">
            <div>
              <h1>Configurações</h1>
              <p>Centralize aqui a aparência da sua conta e as credenciais globais da operação.</p>
            </div>
            <Link href="/" className="btn btn-secondary">
              Voltar
            </Link>
          </div>

          <div className="settings-grid">
            <div className="glass-item settings-block">
              <h2>Modo de visualização</h2>
              <p>Escolha se quer trabalhar com a interface clara ou escura.</p>
              <div className="settings-choice-row">
                <button
                  type="button"
                  className={`settings-choice ${appearance.mode === 'dark' ? 'active' : ''}`}
                  onClick={() => updateAppearance((current) => ({ ...current, mode: 'dark' }))}
                >
                  <i className="bx bx-moon"></i>
                  Escuro
                </button>
                <button
                  type="button"
                  className={`settings-choice ${appearance.mode === 'light' ? 'active' : ''}`}
                  onClick={() => updateAppearance((current) => ({ ...current, mode: 'light' }))}
                >
                  <i className="bx bx-sun"></i>
                  Claro
                </button>
              </div>
            </div>

            <div className="glass-item settings-block">
              <h2>Cor de destaque</h2>
              <p>Essa cor aparece nos botões, links ativos e detalhes principais da sua interface.</p>
              <div className="settings-color-picker">
                <input
                  type="color"
                  value={appearance.accent}
                  onChange={(event) => updateAppearance((current) => ({ ...current, accent: event.target.value }))}
                  aria-label="Selecionar cor de destaque"
                />
                <div className="settings-color-code">
                  <strong>{appearance.accent.toUpperCase()}</strong>
                  <span>Aplicado imediatamente na sua conta neste navegador.</span>
                </div>
              </div>
              <div className="settings-preset-grid">
                {USER_APPEARANCE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`settings-preset ${appearance.accent === preset.value ? 'active' : ''}`}
                    onClick={() => updateAppearance((current) => ({ ...current, accent: preset.value }))}
                  >
                    <span className="settings-preset-swatch" style={{ background: preset.value }}></span>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {canManageClients && (
            <div className="glass-item settings-block settings-block-full">
              <div className="settings-section-head">
                <div>
                  <h2>Integrações globais</h2>
                  <p>Essas credenciais abastecem a operação inteira. Depois, em cada cliente, você escolhe apenas as contas e funis vinculados.</p>
                </div>
              </div>

              <div className="settings-integrations-grid">
                <div className="integration-block integration-block-meta">
                  <div className="integration-heading">
                    <div className="integration-icon" style={{ color: '#3b82f6', borderColor: '#3b82f633' }}>
                      <i className="bx bxl-meta"></i>
                    </div>
                    <div>
                      <h3>Meta Ads</h3>
                      <p>Escolha entre token manual ou conta conectada via Meta Login, e use a forma que fizer mais sentido para cada operação.</p>
                    </div>
                  </div>

                  <div className="settings-choice-row settings-choice-row-compact">
                    <button
                      type="button"
                      className={`settings-choice ${metaConnectionMode === 'manual' ? 'active' : ''}`}
                      onClick={() => handleGlobalIntegrationChange('metaConnectionMode', 'manual')}
                    >
                      <i className="bx bx-key"></i>
                      Token manual
                    </button>
                    <button
                      type="button"
                      className={`settings-choice ${metaConnectionMode === 'oauth' ? 'active' : ''}`}
                      onClick={() => handleGlobalIntegrationChange('metaConnectionMode', 'oauth')}
                    >
                      <i className="bx bx-link-alt"></i>
                      Conta conectada
                    </button>
                  </div>

                  <div className="input-group">
                    <label>Token manual da Meta</label>
                    <input
                      type="password"
                      value={globalIntegrations.metaAccessToken || ''}
                      onChange={(event) => handleGlobalIntegrationChange('metaAccessToken', event.target.value)}
                      placeholder="Cole aqui o token de acesso da Meta"
                    />
                    <small className="settings-help-text">
                      {hasMetaManualToken
                        ? 'Token manual salvo. Você pode seguir usando esse modo normalmente.'
                        : 'Se preferir, deixe em branco e use a opção de conta conectada.'}
                    </small>
                  </div>

                  <div className="meta-connection-card">
                    <div className="meta-connection-copy">
                      <strong>{hasMetaOauthConnection ? 'Conta conectada' : 'Conta ainda não conectada'}</strong>
                      <span>
                        {hasMetaOauthConnection
                          ? `${metaConnection.userName || 'Usuário Meta'} conectado${metaConnection.expiresAt ? ` até ${new Date(metaConnection.expiresAt).toLocaleDateString('pt-BR')}` : ''}.`
                          : 'Conecte sua conta da Meta para listar contas de anúncio sem depender apenas do token manual.'}
                      </span>
                    </div>
                    <div className="meta-connection-actions">
                      <a href="/api/meta/auth/start?return_to=/settings" className="btn btn-primary">
                        {hasMetaOauthConnection ? 'Reconectar Meta' : 'Conectar Meta'}
                      </a>
                      {hasMetaOauthConnection && (
                        <button type="button" className="btn btn-secondary" onClick={handleMetaDisconnect}>
                          Desconectar
                        </button>
                      )}
                    </div>
                  </div>

                  {metaConnectionNotice ? <div className="settings-callout success">{metaConnectionNotice}</div> : null}
                  {metaConnectionError ? <div className="settings-callout error">{metaConnectionError}</div> : null}
                  {metaConnectionSetupRequired ? (
                    <div className="settings-callout warning">
                      Falta aplicar a migration da tabela <code>workspace_meta_connections</code> no Supabase para liberar a conexão da Meta.
                    </div>
                  ) : null}
                  {isMetaConnectionLoading ? <div className="settings-callout info">Carregando status da conexão da Meta...</div> : null}
                </div>

                {GLOBAL_INTEGRATION_GROUPS.map((group) => (
                  <div key={group.title} className="integration-block">
                    <div className="integration-heading">
                      <div className="integration-icon" style={{ color: group.accent, borderColor: `${group.accent}33` }}>
                        <i className={`bx ${group.icon}`}></i>
                      </div>
                      <div>
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>{group.field.label}</label>
                      <input
                        type="password"
                        value={globalIntegrations[group.field.name] || ''}
                        onChange={(event) => handleGlobalIntegrationChange(group.field.name, event.target.value)}
                        placeholder={group.field.placeholder}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .settings-main {
          width: 100%;
        }

        .settings-panel {
          padding: 32px;
          display: grid;
          gap: 24px;
        }

        .settings-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-head h1 {
          font-size: 30px;
          margin-bottom: 8px;
        }

        .settings-head p,
        .settings-block p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .settings-block-full {
          margin-top: 4px;
        }

        .settings-block {
          padding: 24px;
          display: grid;
          gap: 18px;
          border-radius: 20px;
        }

        .settings-block h2 {
          font-size: 22px;
        }

        .settings-choice-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .settings-choice,
        .settings-preset {
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 16px;
          cursor: pointer;
          font: inherit;
        }

        .settings-choice {
          min-width: 180px;
          padding: 16px 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .settings-choice-row-compact .settings-choice {
          min-width: 0;
          flex: 1 1 220px;
        }

        .settings-choice.active,
        .settings-preset.active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .settings-color-picker {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
        }

        .settings-color-picker input[type='color'] {
          width: 72px;
          min-width: 72px;
          height: 56px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .settings-color-code {
          display: grid;
          gap: 4px;
        }

        .settings-preset-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .settings-preset {
          padding: 14px 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .settings-section-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-integrations-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .integration-block-meta {
          grid-column: 1 / -1;
          display: grid;
          gap: 16px;
        }

        .integration-block {
          padding: 22px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .integration-heading {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .integration-icon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid;
          background: rgba(255, 255, 255, 0.03);
          font-size: 22px;
          flex-shrink: 0;
        }

        .integration-heading h3 {
          font-size: 18px;
          margin-bottom: 6px;
        }

        .integration-heading p {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .input-group {
          display: grid;
          gap: 8px;
        }

        .input-group label {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .input-group small,
        .settings-help-text {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .input-group input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .input-group input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .settings-preset-swatch {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          flex-shrink: 0;
        }

        .meta-connection-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
        }

        .meta-connection-copy {
          display: grid;
          gap: 6px;
        }

        .meta-connection-copy strong {
          font-size: 15px;
        }

        .meta-connection-copy span {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .meta-connection-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .settings-callout {
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 13px;
          line-height: 1.5;
        }

        .settings-callout.success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #bbf7d0;
        }

        .settings-callout.error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fecaca;
        }

        .settings-callout.warning {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #fde68a;
        }

        .settings-callout.info {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #bfdbfe;
        }

        @media (max-width: 980px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }

          .settings-integrations-grid {
            grid-template-columns: 1fr;
          }

          .meta-connection-card {
            flex-direction: column;
            align-items: stretch;
          }
        }

        @media (max-width: 768px) {
          .settings-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .settings-preset-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
