import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { extractKnowledgeSources, resolveKnowledgeSourceSnippets } from '@/lib/server/client-knowledge'
import { resolveSaasAiSettings } from '@/lib/server/saas-ai-settings'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const SAAS_AI_AGENTS = [
  {
    id: 'copilot',
    name: 'Copiloto',
    prompt:
      'Atue como copiloto principal de marketing. Priorize clareza, leitura de carteira, campanhas, CRM, arquivos vinculados e próximos passos comerciais.',
  },
  {
    id: 'media',
    name: 'Analista de mídia',
    prompt:
      'Atue como analista senior de mídia paga. Leia campanhas, conjuntos, anúncios, criativos, orçamento e breakdowns. Explique impacto dos números, gargalos e ajustes objetivos.',
  },
  {
    id: 'copywriter',
    name: 'Copywriter',
    prompt:
      'Atue como copywriter senior. Gere headlines, copies, ganchos, argumentos e CTAs alinhados ao cliente, ao produto e ao material contextual disponível.',
  },
]

function summarizeBusinessData(data: Record<string, unknown>) {
  return Object.entries(data)
    .filter(([key, value]) => key !== 'knowledge_sources' && value != null && String(value).trim() !== '')
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('\n')
}

function normalizeForSearch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findMentionedClient(question: string, clients: any[], fallbackClientId: string) {
  const normalizedQuestion = normalizeForSearch(question)
  if (!normalizedQuestion || !Array.isArray(clients)) {
    return clients.find((client) => client.id === fallbackClientId) || null
  }

  const ranked = clients
    .map((client) => {
      const names = [client.name, client.company].map(normalizeForSearch).filter(Boolean)
      const score = names.reduce((total, name) => {
        if (!name) return total
        if (normalizedQuestion.includes(name)) return total + name.length + 100
        const tokens = name.split(' ').filter((token) => token.length >= 3)
        return total + tokens.filter((token) => normalizedQuestion.includes(token)).length
      }, 0)

      return { client, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.client || clients.find((client) => client.id === fallbackClientId) || null
}

function buildFallbackReply(input: {
  client?: any
  dashboard?: any
  clients?: any[]
  integrations: any[]
  snippets: Awaited<ReturnType<typeof resolveKnowledgeSourceSnippets>>
  question: string
}) {
  if (!input.client) {
    const clientNames = (input.clients || []).slice(0, 8).map((client) => client.name).filter(Boolean)
    const integrationCount = Array.isArray(input.integrations) ? input.integrations.length : 0

    return [
      'Leitura geral da carteira:',
      clientNames.length ? `- Clientes cadastrados: ${clientNames.join(', ')}.` : '- Ainda não há clientes cadastrados.',
      `- Integrações registradas: ${integrationCount}.`,
      '- Para uma análise com métricas, cite o nome do cliente ou selecione um cliente no campo acima.',
      '',
      `Pergunta recebida: ${input.question}`,
    ].join('\n')
  }

  const overview = Array.isArray(input.dashboard?.overview_metrics) ? input.dashboard.overview_metrics : []
  const spend = overview.find((item: any) => String(item.label).toLowerCase().includes('invest'))
  const roas = overview.find((item: any) => String(item.label).toLowerCase().includes('roas'))
  const conversions = overview.find((item: any) => String(item.label).toLowerCase().includes('convers'))
  const campaigns = Array.isArray(input.dashboard?.campaigns) ? input.dashboard.campaigns : []
  const worstCampaigns = campaigns
    .filter((item: any) => Number(item.roas || 0) < Number(input.client?.target_roas || 0))
    .slice(0, 2)
  const readableSources = input.snippets.filter((item) => item.readable)

  return [
    `Leitura rápida para ${input.client?.name || 'o cliente'}:`,
    spend ? `- Investimento atual: ${spend.value}` : '',
    conversions ? `- Conversões atuais: ${conversions.value}` : '',
    roas ? `- ROAS atual: ${roas.value} vs meta ${input.client?.target_roas ?? 'n/d'}` : '',
    worstCampaigns.length
      ? `- Campanhas abaixo da meta de ROAS: ${worstCampaigns.map((item: any) => item.campaign_name).join(', ')}.`
      : '- Não identifiquei campanhas críticas abaixo da meta no recorte atual.',
    readableSources.length
      ? `- Fontes lidas no Google: ${readableSources.map((item) => item.title).join(', ')}.`
      : '- Não encontrei fontes do Google legíveis no momento; confira compartilhamento/publicação.',
    '',
    `Pergunta recebida: ${input.question}`,
    'Posso aprofundar em mídia, CRM ou material do Drive com base nesse contexto.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const clientId = String(body.clientId || '').trim()
    const question = String(body.message || '').trim()
    const agentId = String(body.agentId || 'copilot').trim()
    const history = Array.isArray(body.messages) ? (body.messages as ChatMessage[]).slice(-8) : []

    if (!question) {
      return NextResponse.json({ error: 'Mensagem é obrigatória.' }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const clientsResponse = await fetch(`${API_URL}/clients`, { headers, cache: 'no-store' })
    const clients = clientsResponse.ok ? await clientsResponse.json() : []
    const targetClient = findMentionedClient(question, clients, clientId)
    const targetClientId = String(targetClient?.id || '')

    if (!targetClientId) {
      const integrationsResponse = await fetch(`${API_URL}/integrations`, { headers, cache: 'no-store' })
      const integrations = integrationsResponse.ok ? await integrationsResponse.json() : []
      const agent = SAAS_AI_AGENTS.find((item) => item.id === agentId) || SAAS_AI_AGENTS[0]
      const aiConfig = await resolveSaasAiSettings(token)
      const context = `
Carteira:
${JSON.stringify(clients, null, 2)}

Integrações:
${JSON.stringify(integrations, null, 2)}

Observação:
- Nenhum cliente foi selecionado.
- Se a pergunta citar um cliente pelo nome e ele existir na carteira, use essa referência.
      `.trim()

      if (!aiConfig.apiKey) {
        return NextResponse.json({
          reply: buildFallbackReply({
            clients,
            integrations,
            snippets: [],
            question,
          }),
          mode: 'fallback',
          sources: [],
        })
      }

      const response = await fetch(`${aiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content:
                'Você é a IA de marketing do Nype Orbit. Responda em português do Brasil, com objetividade e visão executiva. Nunca invente números que não estão no contexto.',
            },
            {
              role: 'system',
              content: `Agente ativo: ${agent.name}. Instrução especializada: ${agent.prompt}`,
            },
            {
              role: 'system',
              content: `Use este contexto geral antes de responder:\n${context}`,
            },
            ...history.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              role: 'user',
              content: question,
            },
          ],
        }),
        cache: 'no-store',
      })

      const payload = await response.json().catch(() => ({}))
      const reply = payload?.choices?.[0]?.message?.content

      if (!response.ok || !reply) {
        return NextResponse.json({
          reply: buildFallbackReply({
            clients,
            integrations,
            snippets: [],
            question,
          }),
          mode: 'fallback',
          sources: [],
        })
      }

      return NextResponse.json({
        reply,
        mode: 'llm',
        sources: [],
        analyzedClientId: null,
        analyzedClientName: null,
      })
    }

    const [clientResponse, dashboardResponse, integrationsResponse] = await Promise.all([
      fetch(`${API_URL}/clients/${targetClientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/dashboards/clients/${targetClientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/integrations`, { headers, cache: 'no-store' }),
    ])

    if (!clientResponse.ok) {
      const payload = await clientResponse.json().catch(() => ({}))
      return NextResponse.json(payload, { status: clientResponse.status })
    }

    const [client, dashboard, integrations] = await Promise.all([
      clientResponse.json(),
      dashboardResponse.json(),
      integrationsResponse.json(),
    ])

    const agent = SAAS_AI_AGENTS.find((item) => item.id === agentId) || SAAS_AI_AGENTS[0]
    const knowledgeSources = extractKnowledgeSources(client.business_data)
    const snippets = await resolveKnowledgeSourceSnippets(knowledgeSources)

    const context = `
Cliente:
- Nome: ${client.name}
- Empresa: ${client.company}
- Nicho: ${client.niche}
- Objetivo: ${client.main_goal}
- Ticket médio: ${client.average_ticket}
- LTV: ${client.ltv}
- Meta de ROAS: ${client.target_roas}

Dados cadastrais e de negócio:
${summarizeBusinessData(client.business_data || {}) || 'Sem dados adicionais cadastrados.'}

Métricas do dashboard:
${JSON.stringify(dashboard, null, 2)}

Integrações:
${JSON.stringify(Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === targetClientId) : [], null, 2)}

Fontes vinculadas do cliente:
${JSON.stringify(snippets, null, 2)}

Observação de roteamento:
- Cliente selecionado na tela: ${clientId}
- Cliente analisado nesta resposta: ${targetClientId}
- Se a pergunta citou outro cliente pelo nome, o dashboard usado foi o cliente citado.
    `.trim()

    const aiConfig = await resolveSaasAiSettings(token)
    if (!aiConfig.apiKey) {
      return NextResponse.json({
        reply: buildFallbackReply({
          client,
          dashboard,
          integrations: Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === targetClientId) : [],
          snippets,
          question,
        }),
        mode: 'fallback',
        sources: snippets,
      })
    }

    const response = await fetch(`${aiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'Você é a IA de marketing do Nype Orbit. Responda em português do Brasil, com objetividade, visão executiva e próximos passos acionáveis. Nunca invente números que não estão no contexto.',
          },
          {
            role: 'system',
            content: `Agente ativo: ${agent.name}. Instrução especializada: ${agent.prompt}`,
          },
          {
            role: 'system',
            content: `Use este contexto do cliente antes de responder:\n${context}`,
          },
          ...history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: 'user',
            content: question,
          },
        ],
      }),
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => ({}))
    const reply = payload?.choices?.[0]?.message?.content

    if (!response.ok || !reply) {
      return NextResponse.json({
        reply: buildFallbackReply({
          client,
          dashboard,
          integrations: Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === targetClientId) : [],
          snippets,
          question,
        }),
        mode: 'fallback',
        sources: snippets,
      })
    }

    return NextResponse.json({
      reply,
      mode: 'llm',
      sources: snippets,
      analyzedClientId: targetClientId,
      analyzedClientName: client.name,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Não foi possível gerar a resposta da IA.',
      },
      { status: 500 }
    )
  }
}
