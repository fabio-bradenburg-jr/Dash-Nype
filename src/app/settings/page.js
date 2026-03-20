'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'
import { DEFAULT_PREFERENCES, loadDashboardPreferences, saveDashboardPreferences } from '@/lib/dashboard-storage'

const GLOBAL_INTEGRATION_GROUPS = [
  {
    title: 'Meta Ads',
    description: 'Token principal da Meta para listar contas, campanhas, breakdowns e métricas dos clientes.',
    icon: 'bxl-meta',
    accent: '#3b82f6',
    field: {
      name: 'metaAccessToken',
      label: 'Token da Meta',
      placeholder: 'Cole aqui o token de acesso da Meta',
    },
  },
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
  const [globalIntegrations, setGlobalIntegrations] = useState(() => {
    const preferences = loadDashboardPreferences()
    return {
      ...DEFAULT_PREFERENCES.globalIntegrations,
      ...(preferences.globalIntegrations || {}),
    }
  })

  const handleGlobalIntegrationChange = (fieldName, value) => {
    setGlobalIntegrations((current) => {
      const nextIntegrations = {
        ...current,
        [fieldName]: value,
      }

      const preferences = loadDashboardPreferences()
      saveDashboardPreferences({
        ...preferences,
        globalIntegrations: nextIntegrations,
      })

      return nextIntegrations
    })
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

        @media (max-width: 980px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }

          .settings-integrations-grid {
            grid-template-columns: 1fr;
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
