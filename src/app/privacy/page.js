import Link from 'next/link'

export const metadata = {
  title: 'Política e Privacidade | Dash',
  description: 'Política de Privacidade do aplicativo Dash para integrações com Meta Ads, Facebook Login, Google Calendar e fontes de dados operacionais.',
}

const POLICY_SECTIONS = [
  {
    title: '1. Visão geral',
    body:
      'Esta Política de Privacidade descreve como o Dash coleta, utiliza, armazena e protege dados acessados por meio do aplicativo para fins de visualização de métricas, gestão operacional e conexão com plataformas de anúncios e produtividade.',
  },
  {
    title: '2. Dados que podem ser acessados',
    body:
      'Dependendo das integrações habilitadas na conta, o aplicativo pode acessar dados de campanhas, contas de anúncio, calendários, tarefas, quadros, funis, métricas de desempenho, identificadores básicos de conta e informações necessárias para autenticação segura nas plataformas conectadas.',
  },
  {
    title: '3. Uso das informações',
    body:
      'Os dados são utilizados exclusivamente para autenticar integrações, exibir dashboards, gerar relatórios e insights, permitir o vínculo de contas de anúncio com perfis autorizados, consolidar indicadores operacionais e facilitar a administração do ambiente contratado.',
  },
  {
    title: '4. Integração com Meta Ads e Facebook',
    body:
      'Quando a integração com Meta é utilizada, o aplicativo pode receber permissões necessárias para autenticar o usuário, listar contas de anúncio vinculadas e permitir a conexão dessas contas dentro do ambiente do Dash. Esses dados são usados apenas para leitura, vínculo operacional e exibição das informações autorizadas pelo próprio usuário ou administrador.',
  },
  {
    title: '5. Compartilhamento',
    body:
      'O Dash não comercializa dados pessoais nem compartilha informações com terceiros fora do escopo técnico necessário para funcionamento das integrações solicitadas pelo usuário. O compartilhamento ocorre somente com os provedores oficialmente conectados ao aplicativo, como Meta, Google e ferramentas operacionais habilitadas pela conta.',
  },
  {
    title: '6. Armazenamento e retenção',
    body:
      'Credenciais e configurações podem ser armazenadas para manter as integrações ativas e preservar a operação da conta. Os dados permanecem retidos somente pelo período necessário para funcionamento do aplicativo, cumprimento de obrigações técnicas e manutenção do histórico operacional da conta.',
  },
  {
    title: '7. Segurança',
    body:
      'São adotadas medidas técnicas e administrativas razoáveis para reduzir risco de acesso indevido, uso não autorizado, alteração ou divulgação indevida das informações processadas pelo aplicativo.',
  },
  {
    title: '8. Direitos do usuário',
    body:
      'O titular pode solicitar revisão de acessos, atualização de informações, revogação de integrações e exclusão de dados vinculados à sua conta, observadas as limitações técnicas, legais e contratuais aplicáveis ao ambiente onde o Dash estiver implantado.',
  },
  {
    title: '9. Exclusão de dados e revogação de acesso',
    body:
      'A revogação de acesso às plataformas conectadas pode ser feita diretamente no provedor de autenticação utilizado, como Meta ou Google, além da desconexão realizada dentro do próprio aplicativo quando disponível. Solicitações adicionais de exclusão podem ser encaminhadas ao responsável pela implantação ou administração da conta do Dash.',
  },
  {
    title: '10. Atualizações desta política',
    body:
      'Esta política pode ser atualizada periodicamente para refletir mudanças no produto, em integrações externas ou em requisitos regulatórios. A versão publicada nesta página é a versão vigente para fins de referência pública.',
  },
]

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <section className="privacy-hero">
        <div className="privacy-brand">
          <span className="privacy-badge">Documento público</span>
          <h1>Política e Privacidade</h1>
          <p>
            Página pública do Dash para uso em integrações com Meta Ads, Facebook Login e demais plataformas conectadas ao aplicativo.
          </p>
        </div>

        <div className="privacy-meta-card">
          <span>Aplicativo</span>
          <strong>Dash</strong>
          <small>Última atualização: 27 de março de 2026</small>
          <Link href="/" className="privacy-back-link">
            Voltar ao app
          </Link>
        </div>
      </section>

      <section className="privacy-card">
        <div className="privacy-intro">
          <span className="privacy-section-kicker">Uso em revisão e integrações</span>
          <h2>Informações para plataformas parceiras</h2>
          <p>
            Esta página pode ser utilizada como URL pública de política de privacidade no processo de configuração do aplicativo junto ao Facebook Developers e serviços equivalentes.
          </p>
        </div>

        <div className="privacy-highlight-grid">
          <article className="privacy-highlight">
            <small>Escopo</small>
            <strong>Dashboards, integrações e operação</strong>
          </article>
          <article className="privacy-highlight">
            <small>Integrações</small>
            <strong>Meta, Google e ferramentas operacionais</strong>
          </article>
          <article className="privacy-highlight">
            <small>Finalidade</small>
            <strong>Autenticação, leitura autorizada e exibição de dados</strong>
          </article>
        </div>
      </section>

      <section className="privacy-sections">
        {POLICY_SECTIONS.map((section) => (
          <article key={section.title} className="privacy-card privacy-section-card">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className="privacy-card privacy-footer-card">
        <div>
          <span className="privacy-section-kicker">Contato e governança</span>
          <h2>Solicitações relacionadas à conta</h2>
          <p>
            Para dúvidas sobre acesso, privacidade, revogação de integrações ou exclusão de dados, o titular deve entrar em contato com o responsável pela implantação, administração ou operação da conta que utiliza o Dash.
          </p>
        </div>
      </section>

      <style jsx>{`
        .privacy-page {
          min-height: 100vh;
          padding: 48px 20px 72px;
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          gap: 24px;
        }

        .privacy-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.8fr);
          gap: 24px;
          align-items: stretch;
        }

        .privacy-card,
        .privacy-meta-card {
          background: var(--bg-panel);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          box-shadow: var(--panel-shadow);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .privacy-brand,
        .privacy-meta-card,
        .privacy-card {
          padding: 28px;
        }

        .privacy-brand {
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 26%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
        }

        .privacy-badge,
        .privacy-section-kicker {
          width: fit-content;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(147, 197, 253, 0.2);
          background: rgba(59, 130, 246, 0.12);
          color: #bfdbfe;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .privacy-brand h1 {
          margin-top: 18px;
          font-size: clamp(42px, 7vw, 68px);
          line-height: 0.95;
          letter-spacing: -0.05em;
        }

        .privacy-brand p,
        .privacy-card p,
        .privacy-meta-card small {
          margin-top: 14px;
          color: var(--text-secondary);
          line-height: 1.7;
          font-size: 16px;
        }

        .privacy-meta-card {
          display: grid;
          align-content: space-between;
          gap: 14px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.025)),
            radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 34%);
        }

        .privacy-meta-card span,
        .privacy-highlight small {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .privacy-meta-card strong,
        .privacy-highlight strong {
          font-size: 28px;
          line-height: 1.1;
          color: var(--text-primary);
        }

        .privacy-back-link {
          width: fit-content;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          font-weight: 600;
        }

        .privacy-intro h2,
        .privacy-footer-card h2 {
          margin-top: 14px;
          font-size: 30px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .privacy-highlight-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .privacy-highlight {
          min-height: 140px;
          padding: 20px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          display: grid;
          align-content: space-between;
          gap: 12px;
        }

        .privacy-sections {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .privacy-section-card h3 {
          font-size: 22px;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .privacy-section-card p {
          margin-top: 12px;
        }

        @media (max-width: 960px) {
          .privacy-hero,
          .privacy-highlight-grid,
          .privacy-sections {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .privacy-page {
            padding: 24px 16px 48px;
          }

          .privacy-brand,
          .privacy-card,
          .privacy-meta-card {
            padding: 22px;
          }

          .privacy-brand h1 {
            font-size: 38px;
          }

          .privacy-intro h2,
          .privacy-footer-card h2,
          .privacy-section-card h3 {
            font-size: 24px;
          }
        }
      `}</style>
    </main>
  )
}
