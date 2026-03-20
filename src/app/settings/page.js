'use client'

import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'

export default function SettingsPage() {
  const { appearance, updateAppearance } = useUser()

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
              <h1>Aparência do usuário</h1>
              <p>Personalize a interface da sua conta com cor de destaque e modo claro ou escuro.</p>
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
