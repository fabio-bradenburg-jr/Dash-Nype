'use client'

import { useMemo, useState } from 'react'
import { Database, FileText, Link2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KnowledgeSource } from '@/lib/saas/types'

const sourceTypeOptions: Array<{ value: KnowledgeSource['type']; label: string }> = [
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'google_docs', label: 'Google Docs' },
  { value: 'link', label: 'Link de referência' },
]

function sourceIcon(type: KnowledgeSource['type']) {
  if (type === 'google_sheets') return Database
  if (type === 'google_docs') return FileText
  return Link2
}

type Props = {
  clientId: string
  sources: KnowledgeSource[]
  onSaved: (sources: KnowledgeSource[]) => void
}

export function ClientKnowledgePanel({ clientId, sources, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    type: 'google_sheets' as KnowledgeSource['type'],
    url: '',
    notes: '',
  })

  const items = useMemo(() => sources || [], [sources])

  async function persist(nextSources: KnowledgeSource[]) {
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/saas/client-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          knowledgeSources: nextSources,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível salvar as fontes.')
      }

      onSaved(nextSources)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddSource() {
    if (!form.title.trim() || !form.url.trim()) return

    const nextSources = [
      ...items,
      {
        id: `source-${Date.now()}`,
        title: form.title.trim(),
        type: form.type,
        url: form.url.trim(),
        notes: form.notes.trim(),
      },
    ]

    await persist(nextSources)
    setForm({
      title: '',
      type: 'google_sheets',
      url: '',
      notes: '',
    })
  }

  async function handleRemoveSource(sourceId: string) {
    await persist(items.filter((item) => item.id !== sourceId))
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Base de conhecimento</CardTitle>
          <CardDescription>Vincule Docs, Sheets e links do cliente para a IA consultar no contexto da conta.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = sourceIcon(item.type)
              return (
                <div key={item.id} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-slate-950 p-2 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="text-xs text-slate-400">{item.url}</p>
                        </div>
                      </div>
                      {item.notes ? <p className="mt-3 text-sm leading-6 text-slate-500">{item.notes}</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone="slate">{sourceTypeOptions.find((option) => option.value === item.type)?.label || 'Fonte'}</Badge>
                      <button className="text-xs font-semibold text-rose-600" onClick={() => handleRemoveSource(item.id)} type="button">
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-sm leading-6 text-slate-500">
            Nenhuma fonte vinculada ainda. Adicione uma planilha, documento ou link relevante do cliente para enriquecer a IA.
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--saas-primary)]" />
            <p className="font-semibold text-slate-900">Adicionar nova fonte</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-600">
              Título
              <input
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ex.: Planilha comercial"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-600">
              Tipo
              <select
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as KnowledgeSource['type'] }))}
              >
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-600 md:col-span-2">
              URL compartilhada
              <input
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="Cole a URL do Docs, Sheets ou link de referência"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-600 md:col-span-2">
              Observações para a IA
              <textarea
                className="min-h-[96px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Ex.: esta planilha concentra o forecast comercial e a taxa de fechamento."
              />
            </label>
          </div>
          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          <Button className="mt-4 w-full" disabled={saving} onClick={handleAddSource} type="button">
            {saving ? 'Salvando fonte...' : 'Salvar fonte vinculada'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
