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
  { id: 'copywriter', label: 'Copy' },
]

type Props = {
  client: ClientSummary
  clients: ClientSummary[]
  selectedClientId: string
  knowledgeSources: KnowledgeSource[]
  onClientChange: (clientId: string) => void
  isDarkMode?: boolean
}

export function AiAssistantPanel({
  client,
  clients,
  selectedClientId,
  knowledgeSources,
  onClientChange,
  isDarkMode = false,
}: Props) {
  const [agentId, setAgentId] = useState('copilot')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const activeClientSelected = Boolean(selectedClientId && client.id)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: activeClientSelected
        ? `Estou com o contexto de ${client.name}. Posso cruzar campanhas, CRM e fontes vinculadas do Google para responder com mais profundidade.`
        : 'Estou pronto para responder sobre a carteira inteira. Você pode perguntar sem selecionar cliente ou citar um cliente pelo nome.',
    },
  ])

  const hasClients = clients.length > 0
  const sourceCount = useMemo(() => knowledgeSources.length, [knowledgeSources])
  const activeContextId = selectedClientId || 'geral'
  const storageKey = useMemo(() => `nype-orbit-ai:${activeContextId}`, [activeContextId])

  useEffect(() => {
    const defaultMessage = [
      {
        role: 'assistant' as const,
        content: activeClientSelected
          ? `Estou com o contexto de ${client.name}. Posso cruzar campanhas, CRM e fontes vinculadas do Google para responder com mais profundidade.`
          : 'Estou pronto para responder sobre a carteira inteira. Você pode perguntar sem selecionar cliente ou citar um cliente pelo nome.',
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
  }, [activeClientSelected, client.name, storageKey])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

  async function handleSubmit() {
    const message = input.trim()
    if (!message) return

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
          clientId: selectedClientId || '',
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

  return (
    <Card className={`overflow-hidden ${isDarkMode ? 'border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.92))] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]' : 'border-slate-200/80'}`}>
      <CardHeader>
        <div>
          <CardTitle className={isDarkMode ? 'text-white' : ''}>IA do cliente</CardTitle>
          <CardDescription className={isDarkMode ? 'text-white/60' : ''}>Copiloto contextual com acesso a clientes, campanhas, dados cadastrais e fontes vinculadas.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-4 ${
                agentId === agent.id
                  ? 'bg-[var(--saas-primary)] text-[var(--saas-button-text)]'
                  : isDarkMode
                    ? 'bg-white/10 text-white/70'
                    : 'bg-slate-100 text-slate-600'
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
        <div className={`rounded-3xl p-4 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/80 bg-slate-50/80'}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Cliente para análise</p>
              <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
                Selecione um cliente para aprofundar ou use a visão geral para perguntar sobre a carteira inteira.
              </p>
            </div>
            <select
              className={`h-12 min-w-full rounded-2xl px-4 text-sm font-semibold shadow-sm outline-none md:min-w-[320px] ${isDarkMode ? 'border border-white/10 bg-slate-950/70 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
              value={selectedClientId || ''}
              onChange={(event) => onClientChange(event.target.value)}
            >
              <option value="">Visão geral do app</option>
              {hasClients ? (
                clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : null}
            </select>
          </div>
          {hasClients && activeClientSelected ? (
            <div className={`mt-3 flex flex-wrap gap-2 text-xs font-semibold ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
              <span className={`rounded-full px-3 py-1.5 ${isDarkMode ? 'border border-white/10 bg-slate-950/70' : 'border border-slate-200 bg-white'}`}>{client.company}</span>
              <span className={`rounded-full px-3 py-1.5 ${isDarkMode ? 'border border-white/10 bg-slate-950/70' : 'border border-slate-200 bg-white'}`}>
                {sourceCount} fontes vinculadas
              </span>
            </div>
          ) : null}
        </div>

        <div className={`max-h-[420px] space-y-3 overflow-y-auto rounded-[28px] p-4 ${isDarkMode ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.78),rgba(15,23,42,0.92))]' : 'border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.95))]'}`}>
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-full rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[85%] ${
                  message.role === 'assistant'
                    ? isDarkMode
                      ? 'border border-white/10 bg-white/5 text-white/80'
                      : 'border border-slate-200 bg-white text-slate-700'
                    : 'bg-slate-950 text-white'
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                  {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {message.role === 'assistant' ? 'IA Orbit' : 'Você'}
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${isDarkMode ? 'border border-white/10 bg-white/5 text-white/60' : 'border border-slate-200 bg-white text-slate-500'}`}>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Analisando contexto disponível...
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className={`rounded-2xl px-4 py-3 text-sm ${isDarkMode ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>{error}</div> : null}

        <div className={`rounded-[28px] p-4 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/80 bg-white'}`}>
          <div className={`mb-3 text-sm font-medium ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
            Exemplos: &quot;Quais campanhas estão puxando o ROAS para baixo?&quot;, &quot;Qual cliente devo priorizar hoje?&quot;, &quot;Leia a planilha vinculada e destaque gargalos do comercial&quot;.
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <textarea
              className={`min-h-[108px] flex-1 rounded-3xl px-4 py-3 text-sm outline-none ${isDarkMode ? 'border border-white/10 bg-slate-950/70 text-white placeholder:text-white/30' : 'border border-slate-200 bg-slate-50/80 text-slate-900'}`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte sobre campanhas, CRM, criativos, clientes ou arquivos vinculados..."
            />
                <Button className="h-auto min-h-[64px] w-full rounded-3xl md:min-h-[108px] md:min-w-[180px] md:w-auto" disabled={loading} onClick={handleSubmit} type="button">
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
