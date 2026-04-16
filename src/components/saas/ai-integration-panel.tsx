'use client'

import { useEffect, useState } from 'react'
import { Bot, LoaderCircle, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AI_PROVIDER_OPTIONS } from '@/lib/ai-config'

type AiSettingsResponse = {
  provider: string
  baseUrl: string
  model: string
  configured: boolean
  source: 'supabase' | 'env'
}

export function AiIntegrationPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
  })
  const selectedProvider = AI_PROVIDER_OPTIONS.find((item) => item.value === form.provider) || AI_PROVIDER_OPTIONS[0]

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/saas/ai/settings', { cache: 'no-store' })
        const data = (await response.json()) as AiSettingsResponse & { error?: string }
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a integração da IA.')

        setForm((current) => ({
          ...current,
          provider: data.provider || current.provider,
          baseUrl: data.baseUrl || current.baseUrl,
          model: data.model || current.model,
          apiKey: '',
        }))
        setMessage(data.configured ? `IA configurada via ${data.source === 'supabase' ? 'Configurações' : 'ambiente'}.` : '')
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar integração da IA.')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setMessage('')
    setError('')
  }

  function handleProviderChange(provider: string) {
    const option = AI_PROVIDER_OPTIONS.find((item) => item.value === provider)
    setForm((current) => ({
      ...current,
      provider,
      baseUrl: option?.baseUrl || current.baseUrl,
    }))
    setMessage('')
    setError('')
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/saas/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await response.json()) as AiSettingsResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a integração da IA.')

      setForm((current) => ({ ...current, apiKey: '' }))
      setMessage('Integração da IA salva. As próximas conversas já usam esse provider.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar integração da IA.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Integração da IA</CardTitle>
          <CardDescription>Configure o provider que responde à visão geral e às perguntas sobre clientes, campanhas e arquivos.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Provider conectado ao chat</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                A API key fica salva no backend do workspace e não é exibida novamente na interface.
              </p>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Provider</span>
          <select
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
            disabled={loading}
            value={form.provider}
            onChange={(event) => handleProviderChange(event.target.value)}
          >
            {AI_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs leading-5 text-slate-500">{selectedProvider.description}</span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Base URL</span>
          <input
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
            disabled={loading}
            value={form.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Modelo</span>
          <input
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
            disabled={loading}
            value={form.model}
            onChange={(event) => updateField('model', event.target.value)}
            placeholder={selectedProvider.modelPlaceholder}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">API key</span>
          <input
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
            disabled={loading}
            value={form.apiKey}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder="Cole a chave do provider para ativar a IA"
            type="password"
          />
        </label>

        {message ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            {message}
          </div>
        ) : null}
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <Button className="h-12 w-full" disabled={loading || saving} onClick={handleSave} type="button">
          {saving ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Salvando integração...
            </span>
          ) : (
            'Salvar integração da IA'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
