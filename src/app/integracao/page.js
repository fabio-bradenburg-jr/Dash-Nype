import styles from './page.module.css'

export const metadata = {
  title: 'Integração do Cliente | Método LP',
  description: 'Página de boas-vindas e orientação para a integração de clientes da Assessoria LP.',
}

const flowSteps = [
  {
    title: 'Reunião de integração',
    text: 'Conversa inicial para entender o cenário da empresa, validar expectativas e alinhar prioridades.',
    deliverable: 'Ata de integração e definição dos próximos pontos a coletar.',
    icon: 'bx-calendar',
  },
  {
    title: 'Envio das informações e acessos',
    text: 'Cliente envia logins, materiais, dados comerciais e referências. Equipe centraliza tudo em um só lugar.',
    deliverable: 'Acessos validados e materiais organizados em pasta única.',
    icon: 'bx-paper-plane',
  },
  {
    title: 'Planejamento estratégico',
    text: 'Definição de público, produto foco, região, posicionamento, oferta, metas e indicadores.',
    deliverable: 'Documento estratégico aprovado pelo cliente.',
    icon: 'bx-target-lock',
  },
  {
    title: 'Criação das campanhas',
    text: 'Produção de criativos, textos, segmentações e estrutura de testes para os primeiros anúncios.',
    deliverable: 'Campanhas montadas e revisadas, prontas para publicação.',
    icon: 'bx-megaphone',
  },
  {
    title: 'Início dos anúncios',
    text: 'Publicação das campanhas, ativação do processo de captação e início do recebimento de leads.',
    deliverable: 'Operação no ar e leads chegando para o comercial.',
    icon: 'bx-bolt-circle',
  },
  {
    title: 'Acompanhamento comercial mensal',
    text: 'Reuniões mensais para analisar campanhas, leads, atendimento, oportunidades e próximos ajustes.',
    deliverable: 'Plano de ajustes para o próximo ciclo, com base nos dados.',
    icon: 'bx-bar-chart-alt-2',
  },
]

const methodCards = [
  {
    step: 'P1',
    title: 'Planejamento Estratégico',
    text: 'Diagnóstico profundo do negócio e definição de metas claras. Construímos o mapa de crescimento tático específico para a sua indústria.',
    items: ['Definição de público e persona', 'Produto foco e oferta', 'Regiões de atuação', 'Metas e indicadores'],
  },
  {
    step: 'P2',
    title: 'Processos Comerciais',
    text: 'Estruturação da máquina de vendas. Implementamos CRM e processos padronizados para eliminar a perda de negócios.',
    items: ['Funil de vendas estruturado', 'CRM ou planilha de controle', 'Roteiro comercial', 'Padrão de follow-up'],
  },
  {
    step: 'P3',
    title: 'Potenciais Clientes',
    text: 'Geração de demanda B2B. Atraímos potenciais clientes qualificados e com poder de decisão através de tráfego pago avançado.',
    items: ['Tráfego pago em Meta Ads', 'Segmentações refinadas', 'Criativos e testes A/B', 'Otimização contínua'],
  },
  {
    step: 'P4',
    title: 'PAC — Programa de Aceleração',
    text: 'Acompanhamento individual e contínuo. Encontros mensais para ajustar estratégias na prática e garantir crescimento previsível.',
    items: ['Reuniões mensais de acompanhamento', 'Diagnóstico de gargalos', 'Ajustes estratégicos', 'Plano de evolução'],
  },
  {
    step: 'P5',
    title: 'Prestação de Contas',
    text: 'Decisões guiadas por dados. Entregamos relatórios mensais com análise de ROI e métricas de desempenho.',
    items: ['Relatório mensal completo', 'Análise de ROI', 'KPIs por etapa do funil', 'Recomendações claras'],
    featured: true,
  },
]

const commitmentItems = [
  ['Responder às solicitações com agilidade', 'Quanto mais rápido as informações chegam, mais cedo a operação entra no ar.'],
  ['Enviar materiais da empresa', 'Logo, cores, fotos, vídeos, apresentações e tudo que represente a marca.'],
  ['Liberar os acessos necessários', 'Meta Ads, Instagram, WhatsApp Business e outros canais essenciais.'],
  ['Validar informações estratégicas', 'Confirmar oferta, posicionamento, regiões e prioridades antes da publicação.'],
  ['Usar o CRM ou planilha de controle', 'Todo lead precisa ser registrado e atualizado em um único lugar.'],
  ['Participar das reuniões de acompanhamento', 'Encontros mensais para analisar resultados e definir próximos passos.'],
  ['Garantir que os leads sejam atendidos com rapidez', 'Tempo de resposta curto é o principal fator de conversão.'],
]

const checklistItems = [
  ['Acesso ao Meta Ads', 'Conta de Business Manager com permissão de administrador para gerenciar campanhas.'],
  ['Acesso ao Instagram da empresa', 'Vinculado ao Business Manager, com permissão para criar e publicar anúncios.'],
  ['Login e senha (quando necessário)', 'Para sistemas, ferramentas ou plataformas próprias que precisem ser acessadas.'],
  ['Lista de clientes ou perfil de clientes ideais', 'Base atual de clientes ou descrição clara do ICP — Ideal Customer Profile.'],
  ['Materiais da marca', 'Logo em alta, paleta de cores, fontes, fotos, vídeos e apresentações comerciais.'],
  ['Pasta no Drive com mídias', 'Imagens e vídeos dos produtos/serviços organizados por categoria.'],
  ['WhatsApp Business da empresa', 'Número oficial usado para receber e atender os leads gerados.'],
  ['Cartão virtual para anúncios', 'Nome, número e código para crédito das campanhas em Meta Ads.'],
  ['Produtos ou serviços prioritários', 'O que será divulgado primeiro, com descrição completa e diferenciais.'],
  ['Dados comerciais', 'Ticket médio, regiões atendidas, principais objeções e metas comerciais.'],
]

const leadTrackingItems = [
  'Nome do lead',
  'Origem do contato',
  'Data e horário do primeiro contato',
  'Produto ou serviço de interesse',
  'Status do atendimento',
  'Proposta enviada (sim/não)',
  'Motivo de perda (se houver)',
  'Próximo passo combinado',
]

const salesPractices = [
  ['Responder rápido', 'O tempo de resposta é o maior fator de conversão. Idealmente, em até 5 minutos.', 'bx-time-five'],
  ['Entender a necessidade', 'Antes de oferecer, escutar. Diagnóstico claro evita propostas desalinhadas.', 'bx-message-square-detail'],
  ['Seguir o roteiro comercial', 'Estrutura de perguntas, abordagem e apresentação da oferta padronizadas.', 'bx-file'],
  ['Registrar tudo no CRM ou planilha', 'Cada interação atualizada para que ninguém perca o histórico do lead.', 'bx-clipboard'],
  ['Fazer follow-up', 'A maior parte das vendas acontece a partir do segundo ou terceiro contato.', 'bx-paper-plane'],
  ['Conduzir até a proposta', 'O comercial guia o lead de forma ativa até o momento da decisão.', 'bx-target-lock'],
  ['Atualizar os status do funil', 'Funil sempre vivo permite identificar gargalos e ajustar a rota.', 'bx-trending-up'],
]

const meetingItems = [
  ['Quantidade de leads gerados', 'Volume total no período.'],
  ['Qualidade dos contatos', 'Aderência ao perfil ideal.'],
  ['Custo por lead', 'Eficiência do investimento em mídia.'],
  ['Conversas iniciadas', 'Quantos leads passaram para o atendimento.'],
  ['Propostas enviadas', 'Avanço efetivo no funil comercial.'],
  ['Vendas realizadas', 'Resultado final do ciclo.'],
  ['Gargalos no atendimento', 'Onde os leads estão sendo perdidos.'],
  ['Ajustes nas campanhas e processo', 'Plano de ação para o próximo ciclo.'],
]

function SlideShell({ eyebrow, slide, children, className = '', id }) {
  return (
    <section id={id} className={`${styles.slide} ${className}`}>
      <div className={styles.slideMeta}>
        <span className={styles.pill}>{eyebrow}</span>
        <span className={styles.slideNumber}>SLIDE {String(slide).padStart(2, '0')} / 10</span>
      </div>
      {children}
    </section>
  )
}

function Highlight({ children }) {
  return <span className={styles.highlight}>{children}</span>
}

export default function IntegracaoPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.navbar} aria-label="Navegação da integração">
        <a className={styles.logoLink} href="#inicio" aria-label="Voltar ao início">
          <span className={styles.logoMark} aria-hidden="true" />
        </a>
      </nav>

      <SlideShell eyebrow="Apresentação de integração" slide={1} className={styles.heroSlide} id="inicio">
        <p className={styles.kicker}>Método LP — onboarding do cliente</p>
        <h1>Bem-vindo ao <Highlight>Método LP</Highlight></h1>
        <p className={styles.lead}>
          A partir de agora, sua empresa entra em uma jornada de crescimento com mais <strong>processo,
          previsibilidade e acompanhamento comercial.</strong>
        </p>
        <p className={styles.bodyCopy}>
          Esta página foi criada para organizar sua integração com a Assessoria LP. Aqui você vai entender os próximos
          passos, enviar as informações necessárias e garantir que o início dos anúncios e da estrutura comercial
          aconteça da forma mais ágil possível.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href="#como-funciona">Iniciar minha integração <i className="bx bx-right-arrow-alt" /></a>
          <a className={styles.secondaryButton} href="#metodo">Ir para o Método 5 P&apos;s</a>
        </div>
      </SlideShell>

      <SlideShell eyebrow="Como funciona a partir de agora" slide={2} className={styles.flowSlide}>
        <h2>Agora começa a estruturação da sua <Highlight>máquina comercial</Highlight></h2>
        <p className={styles.sectionIntro}>
          Após a assinatura do contrato, iniciamos uma etapa de organização estratégica para entender o cenário da empresa,
          preparar os acessos, alinhar produtos prioritários e definir os primeiros caminhos de geração de demanda.
        </p>
        <div id="como-funciona" className={styles.flowList}>
          {flowSteps.map((step, index) => (
            <article className={styles.flowCard} key={step.title}>
              <span className={styles.flowIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.flowIcon}><i className={`bx ${step.icon}`} /></span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
              <aside>
                <small>Entregável</small>
                <strong>{step.deliverable}</strong>
              </aside>
            </article>
          ))}
        </div>
        <div className={styles.impactBox}>Quanto mais completa for essa etapa, <Highlight>mais rápido</Highlight> conseguimos colocar sua operação para rodar.</div>
      </SlideShell>

      <SlideShell eyebrow="O que vamos construir juntos" slide={3} className={styles.methodSlide}>
        <div id="metodo" className={styles.centerTitle}>
          <p className={styles.kicker}>Nosso método exclusivo</p>
          <h2>5 P&apos;s</h2>
          <p>Uma metodologia prática, validada e orientada por dados, que transforma seu comercial em uma máquina de vendas previsível.</p>
        </div>
        <div className={styles.methodGrid}>
          {methodCards.map((card) => (
            <article className={`${styles.methodCard} ${card.featured ? styles.featuredMethod : ''}`} key={card.step}>
              <span>{card.step}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
              <ul>
                {card.items.map((item) => (
                  <li key={item}><i className="bx bx-check" />{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SlideShell>

      <SlideShell eyebrow="Seu papel nessa etapa" slide={4} className={styles.splitSlide}>
        <div className={styles.splitContent}>
          <div>
            <h2>Para tudo funcionar, precisamos do seu <Highlight>comprometimento</Highlight></h2>
            <p className={styles.sectionIntro}>
              A Assessoria LP entra com estratégia, execução e acompanhamento. Mas o resultado também depende da participação
              ativa da empresa, principalmente no envio das informações, liberação dos acessos e rotina de atendimento aos leads.
            </p>
            <div className={styles.callout}><i className="bx bx-handshake" /><strong>Anúncio gera oportunidade.</strong> Processo comercial transforma oportunidade em venda.</div>
          </div>
          <div className={styles.numberedList}>
            {commitmentItems.map(([title, text], index) => (
              <article key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </SlideShell>

      <SlideShell eyebrow="Checklist de integração" slide={5}>
        <h2>Antes de iniciar os anúncios, <Highlight>precisamos destes itens</Highlight></h2>
        <p className={styles.sectionIntro}>Depois da reunião de integração, esse checklist será usado para organizar o início das campanhas.</p>
        <div className={styles.checklistGrid}>
          {checklistItems.map(([title, text], index) => (
            <article className={styles.checkCard} key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </SlideShell>

      <SlideShell eyebrow="Formulário de integração" slide={6} className={styles.formIntroSlide}>
        <div className={styles.formPanel}>
          <span className={styles.pill}>Próximo passo</span>
          <h2>Agora precisamos conhecer melhor sua <Highlight>empresa</Highlight></h2>
          <p>
            As respostas de integração vão ajudar nossa equipe a montar uma estratégia mais alinhada com a realidade do seu negócio.
          </p>
          <a className={styles.primaryButton} href="#encerramento">Preencher formulário de integração <i className="bx bx-right-arrow-alt" /></a>
        </div>
      </SlideShell>

      <SlideShell eyebrow="Organização dos leads" slide={7} className={styles.splitSlide}>
        <div className={styles.splitContent}>
          <div>
            <h2>Todos os leads precisam ser <Highlight>acompanhados</Highlight></h2>
            <p className={styles.sectionIntro}>
              Os contatos gerados pelos anúncios devem ser registrados e acompanhados em um único lugar. Isso evita perda
              de oportunidades e permite analisar o que está acontecendo em cada etapa do funil.
            </p>
            <div className={styles.callout}><i className="bx bx-group" />Lead sem acompanhamento vira oportunidade perdida.</div>
          </div>
          <div className={styles.trackingPanel}>
            <p>O que deve ser acompanhado</p>
            {leadTrackingItems.map((item, index) => (
              <div key={item}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i className="bx bx-check" />
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>
      </SlideShell>

      <SlideShell eyebrow="Atendimento comercial" slide={8}>
        <h2>Velocidade e processo <Highlight>fazem diferença</Highlight></h2>
        <p className={styles.sectionIntro}>
          O comercial recebe o lead e precisa seguir um processo claro para aumentar as chances de conversão.
        </p>
        <div className={styles.practiceGrid}>
          {salesPractices.map(([title, text, icon]) => (
            <article className={styles.practiceCard} key={title}>
              <span><i className={`bx ${icon}`} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className={styles.impactBox}>Venda não depende só de interesse. Depende de <Highlight>método, constância e acompanhamento.</Highlight></div>
      </SlideShell>

      <SlideShell eyebrow="Reuniões e acompanhamento" slide={9}>
        <h2>Mensalmente, acompanhamos os <Highlight>indicadores</Highlight></h2>
        <p className={styles.sectionIntro}>
          Durante o projeto, realizamos reuniões de acompanhamento para analisar campanhas, leads, atendimento comercial,
          oportunidades e próximos ajustes.
        </p>
        <div className={styles.meetingGrid}>
          {meetingItems.map(([title, text], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </SlideShell>

      <SlideShell eyebrow="Encerramento" slide={10} className={styles.closingSlide}>
        <div id="encerramento" className={styles.closingPanel}>
          <span className={styles.pill}>Sua jornada começa agora</span>
          <h2>Bem-vindo ao <Highlight>Método LP</Highlight></h2>
          <p>Com as informações preenchidas e os acessos enviados, nossa equipe inicia a organização estratégica para colocar sua empresa em movimento.</p>
          <strong>A partir daqui, crescimento deixa de ser tentativa e passa a ser <Highlight>processo.</Highlight></strong>
          <div className={styles.nextSteps}>
            <span><b>01</b>Reunião de integração</span>
            <span><b>02</b>Envio de informações</span>
            <span><b>03</b>Início das campanhas</span>
          </div>
          <a className={styles.primaryButton} href="#inicio">Preencher formulário de integração <i className="bx bx-right-arrow-alt" /></a>
        </div>
      </SlideShell>
    </main>
  )
}
