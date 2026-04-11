import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { createDefaultAiAgents } from '@/lib/ai-config'
import { extractKnowledgeSources, resolveKnowledgeSourceSnippets } from '@/lib/server/client-knowledge'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function summarizeBusinessData(data: Record<string, unknown>) {
  return Object.entries(data)
    .filter(([key, value]) => key !== 'knowledge_sources' && value != null && String(value).trim() !== '')
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('\n')
}

function resolveAiProviderConfig() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || ''
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini'

  return {
    apiKey,
    baseUrl,
    model,
  }
}

function buildFallbackReply(input: {
  client: any
  dashboard: any
  tasks: any[]
  integrations: any[]
  snippets: Awaited<ReturnType<typeof resolveKnowledgeSourceSnippets>>
  question: string
}) {
  const overview = Array.isArray(input.dashboard?.overview_metrics) ? input.dashboard.overview_metrics : []
  const spend = overview.find((item: any) => String(item.label).toLowerCase().includes('invest'))
  const roas = overview.find((item: any) => String(item.label).toLowerCase().includes('roas'))
  const conversions = overview.find((item: any) => String(item.label).toLowerCase().includes('convers'))
  const campaigns = Array.isArray(input.dashboard?.campaigns) ? input.dashboard.campaigns : []
  const worstCampaigns = campaigns
    .filter((item: any) => Number(item.roas || 0) < Number(input.client?.target_roas || 0))
    .slice(0, 2)
  const openTasks = input.tasks.filter((task) => task.status !== 'done').slice(0, 3)
  const readableSources = input.snippets.filter((item) => item.readable)

  return [
    `Leitura rápida para ${input.client?.name || 'o cliente'}:`,
    spend ? `- Investimento atual: ${spend.value}` : '',
    conversions ? `- Conversões atuais: ${conversions.value}` : '',
    roas ? `- ROAS atual: ${roas.value} vs meta ${input.client?.target_roas ?? 'n/d'}` : '',
    worstCampaigns.length
      ? `- Campanhas abaixo da meta de ROAS: ${worstCampaigns.map((item: any) => item.campaign_name).join(', ')}.`
      : '- Não identifiquei campanhas críticas abaixo da meta no recorte atual.',
    openTasks.length
      ? `- Tarefas abertas: ${openTasks.map((task) => task.title).join(', ')}.`
      : '- Não há tarefas abertas relevantes no cliente.',
    readableSources.length
      ? `- Fontes lidas no Google: ${readableSources.map((item) => item.title).join(', ')}.`
      : '- Não encontrei fontes do Google legíveis no momento; confira compartilhamento/publicação.',
    '',
    `Pergunta recebida: ${input.question}`,
    'Posso aprofundar em mídia, operação, CRM ou material do Drive com base nesse contexto.',
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

    if (!clientId || !question) {
      return NextResponse.json({ error: 'Cliente e mensagem são obrigatórios.' }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const [clientResponse, dashboardResponse, checklistResponse, tasksResponse, integrationsResponse] = await Promise.all([
      fetch(`${API_URL}/clients/${clientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/dashboards/clients/${clientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/clients/${clientId}/checklist`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/clients/${clientId}/tasks`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/integrations`, { headers, cache: 'no-store' }),
    ])

    if (!clientResponse.ok) {
      const payload = await clientResponse.json().catch(() => ({}))
      return NextResponse.json(payload, { status: clientResponse.status })
    }

    const [client, dashboard, checklist, tasks, integrations] = await Promise.all([
      clientResponse.json(),
      dashboardResponse.json(),
      checklistResponse.json(),
      tasksResponse.json(),
      integrationsResponse.json(),
    ])

    const agents = createDefaultAiAgents()
    const agent = agents.find((item) => item.id === agentId) || agents[0]
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
- Health score: ${client.health_score} (${client.health_band})

Dados cadastrais e de negócio:
${summarizeBusinessData(client.business_data || {}) || 'Sem dados adicionais cadastrados.'}

Métricas do dashboard:
${JSON.stringify(dashboard, null, 2)}

Checklist:
${JSON.stringify(checklist, null, 2)}

Tarefas:
${JSON.stringify(tasks, null, 2)}

Integrações:
${JSON.stringify(Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === clientId) : [], null, 2)}

Fontes vinculadas do cliente:
${JSON.stringify(snippets, null, 2)}
    `.trim()

    const aiConfig = resolveAiProviderConfig()
    if (!aiConfig.apiKey) {
      return NextResponse.json({
        reply: buildFallbackReply({
          client,
          dashboard,
          tasks,
          integrations: Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === clientId) : [],
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
              'Você é a IA operacional do Nype Orbit. Responda em português do Brasil, com objetividade, visão executiva e próximos passos acionáveis. Nunca invente números que não estão no contexto.',
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
          tasks,
          integrations: Array.isArray(integrations) ? integrations.filter((item: any) => item.client_id === clientId) : [],
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
