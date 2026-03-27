import Link from 'next/link'
import styles from './page.module.css'

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
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.brand}>
          <span className={styles.badge}>Documento público</span>
          <h1>Política e Privacidade</h1>
          <p>
            Página pública do Dash para uso em integrações com Meta Ads, Facebook Login e demais plataformas conectadas ao aplicativo.
          </p>
        </div>

        <div className={styles.metaCard}>
          <span>Aplicativo</span>
          <strong>Dash</strong>
          <small>Última atualização: 27 de março de 2026</small>
          <Link href="/" className={styles.backLink}>
            Voltar ao app
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.intro}>
          <span className={styles.sectionKicker}>Uso em revisão e integrações</span>
          <h2>Informações para plataformas parceiras</h2>
          <p>
            Esta página pode ser utilizada como URL pública de política de privacidade no processo de configuração do aplicativo junto ao Facebook Developers e serviços equivalentes.
          </p>
        </div>

        <div className={styles.highlightGrid}>
          <article className={styles.highlight}>
            <small>Escopo</small>
            <strong>Dashboards, integrações e operação</strong>
          </article>
          <article className={styles.highlight}>
            <small>Integrações</small>
            <strong>Meta, Google e ferramentas operacionais</strong>
          </article>
          <article className={styles.highlight}>
            <small>Finalidade</small>
            <strong>Autenticação, leitura autorizada e exibição de dados</strong>
          </article>
        </div>
      </section>

      <section className={styles.sections}>
        {POLICY_SECTIONS.map((section) => (
          <article key={section.title} className={`${styles.card} ${styles.sectionCard}`}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className={`${styles.card} ${styles.footerCard}`}>
        <div>
          <span className={styles.sectionKicker}>Contato e governança</span>
          <h2>Solicitações relacionadas à conta</h2>
          <p>
            Para dúvidas sobre acesso, privacidade, revogação de integrações ou exclusão de dados, o titular deve entrar em contato com o responsável pela implantação, administração ou operação da conta que utiliza o Dash.
          </p>
        </div>
      </section>
    </main>
  )
}
