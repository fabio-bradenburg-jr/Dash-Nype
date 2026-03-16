'use client'

import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div className="dashboard-container">
      <aside className="sidebar glass-panel">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <span>Dash</span>
        </div>
      </aside>

      <main className="main-content">
        <section className="glass-panel settings-message">
          <h1>Configurações centralizadas no dashboard</h1>
          <p>
            A gestão de clientes, contas e integrações agora acontece direto na home, dentro das abas
            <strong> Clientes</strong>, <strong>Integrações</strong> e <strong>Apresentação</strong>.
          </p>
          <Link href="/" className="btn btn-primary">
            Voltar para o dashboard
          </Link>
        </section>
      </main>

      <style jsx>{`
        .settings-message {
          padding: 32px;
          max-width: 720px;
        }

        .settings-message h1 {
          font-size: 28px;
          margin-bottom: 12px;
        }

        .settings-message p {
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  )
}
