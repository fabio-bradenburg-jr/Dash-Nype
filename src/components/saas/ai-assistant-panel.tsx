'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, LoaderCircle, SendHorizontal, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientSummary, KnowledgeSource } from '@/lib/saas/types'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const agents = [
  { id: 'copilot', label: 'Copiloto' },
  { id: 'media', label: 'Mídia' },
  { id: 'operations', label: 'Operações' },
  { id: 'copywriter', label: 'Copy' },
]

type Props = {
  client: ClientSummary
  clients: ClientSummary[]
  selectedClientId: string
  knowledgeSources: KnowledgeSource[]
  onClientChange: (clientId: string) => void
  onTaskCreated?: () => void
}

function taskTitleFromReply(content: string) {
  const cleaned = String(content || '')
    .replace(/\n+/g, ' ')
    .trim()
  const firstSentence = cleaned.split(/[.!?]/)[0] || cleaned
  return (firstSentence || 'Ação recomendada pela IA').slice(0, 120)
}

export function AiAssistantPanel({
  client,
  clients,
  selectedClientId,
  knowledgeSources,
  onClientChange,
  onTaskCreated,
}: Props) {
  const [agentId, setAgentId] = useState('copilot')
  const [loading, setLoading] = useState(false)
  const [creatingTaskIndex, setCreatingTaskIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Estou com o contexto de ${client.name}. Posso cruzar campanhas, tarefas e também as fontes vinculadas do Google para responder com mais profundidade.`,
    },
  ])

  const hasClients = clients.length > 0
  const sourceCount = useMemo(() => knowledgeSources.length, [knowledgeSources])
  const storageKey = useMemo(() => `nype-orbit-ai:${client.id}`, [client.id])

  useEffect(() => {
    const defaultMessage = [
      {
        role: 'assistant' as const,
        content: `Estou com o contexto de ${client.name}. Posso cruzar campanhas, tarefas e também as fontes vinculadas do Google para responder com mais profundidade.`,
      },
    ]

    if (typeof window !== 'undefined') {
      try {
        const cached = window.localStorage.getItem(storageKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed) && parsed.length) {
            setMessages(parsed)
          } else {
            setMessages(defaultMessage)
          }
        } else {
          setMessages(defaultMessage)
        }
      } catch {
        setMessages(defaultMessage)
      }
    } else {
      setMessages(defaultMessage)
    }

    setError('')
    setInput('')
  }, [client.id, client.name, storageKey])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

  async function handleSubmit() {
    const message = input.trim()
    if (!message || !client.id) return

    const nextMessages = [...messages, { role: 'user' as const, content: message }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/saas/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          agentId,
          message,
          messages: nextMessages,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível consultar a IA.')
      }

      setMessages((current) => [...current, { role: 'assistant', content: String(data.reply || '') }])
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao consultar a IA.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTaskFromReply(message: Message, index: number) {
    if (message.role !== 'assistant') return

    setCreatingTaskIndex(index)
    setError('')
    try {
      const response = await fetch('/api/saas/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          title: taskTitleFromReply(message.content),
          description: message.content,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível criar a tarefa a partir da IA.')
      }

      onTaskCreated?.()
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : 'Erro ao criar a tarefa.')
    } finally {
      setCreatingTaskIndex(null)
    }
  }

  return (
    <Card className="overflow-hidden border-slate-200/80">
      <CardHeader>
        <div>
          <CardTitle>IA do cliente</CardTitle>
          <CardDescription>Copiloto contextual com acesso a campanhas, dados cadastrais, tarefas e fontes vinculadas.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                agentId === agent.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              onClick={() => setAgentId(agent.id)}
              type="button"
            >
              {agent.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Cliente para análise</p>
              <p className="mt-1 text-sm text-slate-500">
                Selecione um cliente cadastrado para a IA buscar dash, campanhas, CRM, tarefas e fontes vinculadas.
              </p>
            </div>
            <select
              className="h-12 min-w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none md:min-w-[320px]"
              disabled={!hasClients}
              value={hasClients ? selectedClientId : ''}
              onChange={(event) => onClientChange(event.target.value)}
            >
              {hasClients ? (
                clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value="">Nenhum cliente cadastrado</option>
              )}
            </select>
          </div>
          {hasClients ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{client.company}</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                {sourceCount} fontes vinculadas
              </span>
            </div>
          ) : null}
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.95))] p-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm ${
                  message.role === 'assistant'
                    ? 'border border-slate-200 bg-white text-slate-700'
                    : 'bg-slate-950 text-white'
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                  {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {message.role === 'assistant' ? 'IA Orbit' : 'Você'}
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === 'assistant' ? (
                  <div className="mt-3">
                    <button
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      disabled={creatingTaskIndex === index}
                      onClick={() => handleCreateTaskFromReply(message, index)}
                      type="button"
                    >
                      {creatingTaskIndex === index ? 'Criando tarefa...' : 'Transformar em tarefa'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Analisando contexto do cliente...
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="rounded-[28px] border border-slate-200/80 bg-white p-4">
          <div className="mb-3 text-sm font-medium text-slate-600">
            Exemplos: "Quais campanhas estão puxando o ROAS para baixo?", "Monte um plano de ação desta semana", "Leia a planilha vinculada e destaque gargalos do comercial".
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <textarea
              className="min-h-[108px] flex-1 rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte sobre campanhas, operação, CRM, criativos ou arquivos vinculados do cliente..."
              disabled={!hasClients}
            />
                <Button className="h-auto min-h-[108px] min-w-[180px] rounded-3xl" disabled={loading || !hasClients} onClick={handleSubmit} type="button">
              <span className="flex items-center gap-2">
                <SendHorizontal className="h-4 w-4" />
                Enviar para IA
              </span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
