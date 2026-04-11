'use client'

import { useMemo, useState } from 'react'
import { Database, FileText, FolderKanban, Link2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KnowledgeSource } from '@/lib/saas/types'

const sourceTypeOptions: Array<{ value: KnowledgeSource['type']; label: string }> = [
  { value: 'google_drive_folder', label: 'Pasta do Google Drive' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'google_docs', label: 'Google Docs' },
  { value: 'link', label: 'Link de referência' },
]

function sourceIcon(type: KnowledgeSource['type']) {
  if (type === 'google_sheets') return Database
  if (type === 'google_docs') return FileText
  if (type === 'google_drive_folder') return FolderKanban
  return Link2
}

type Props = {
  clientId: string
  sources: KnowledgeSource[]
  onSaved: (sources: KnowledgeSource[]) => void
  googleDrive?: {
    email?: string
    name?: string
    picture?: string
  } | null
}

function guessSourceTypeFromMimeType(mimeType: string): KnowledgeSource['type'] {
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'google_sheets'
  if (mimeType === 'application/vnd.google-apps.document') return 'google_docs'
  if (mimeType === 'application/vnd.google-apps.folder') return 'google_drive_folder'
  return 'link'
}

export function ClientKnowledgePanel({ clientId, sources, onSaved, googleDrive }: Props) {
  const [saving, setSaving] = useState(false)
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false)
  const [error, setError] = useState('')
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; webViewLink: string; modifiedTime?: string }>>([])
  const [form, setForm] = useState({
    title: '',
    type: 'google_drive_folder' as KnowledgeSource['type'],
    url: '',
    notes: '',
  })

  const items = useMemo(() => sources || [], [sources])

  async function loadDriveFiles() {
    setLoadingDriveFiles(true)
    setError('')
    try {
      const response = await fetch(`/api/saas/google-drive/files?clientId=${encodeURIComponent(clientId)}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível carregar os arquivos do Google Drive.')
      }
      setDriveFiles(Array.isArray(data.files) ? data.files : [])
    } catch (driveError) {
      setError(driveError instanceof Error ? driveError.message : 'Erro ao carregar os arquivos do Drive.')
    } finally {
      setLoadingDriveFiles(false)
    }
  }

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
      type: 'google_drive_folder',
      url: '',
      notes: '',
    })
  }

  async function handleRemoveSource(sourceId: string) {
    await persist(items.filter((item) => item.id !== sourceId))
  }

  async function handleConnectDrive() {
    window.location.href = `/api/saas/google-drive/start?client_id=${encodeURIComponent(clientId)}&return_to=/`
  }

  async function handleAddDriveFile(file: { id: string; name: string; mimeType: string; webViewLink: string }) {
    const nextSources = [
      ...items,
      {
        id: `source-drive-${file.id}`,
        title: file.name,
        type: guessSourceTypeFromMimeType(file.mimeType),
        url: file.webViewLink,
        notes: 'Fonte importada diretamente do Google Drive conectado.',
      },
    ]
    await persist(nextSources)
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Base de conhecimento</CardTitle>
          <CardDescription>Vincule Drive, Docs, Sheets e links do cliente para a IA consultar no contexto da conta.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,118,110,0.08),rgba(249,115,22,0.08))] p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Google Drive</p>
              {googleDrive?.email ? (
                <>
                  <p className="mt-2 font-semibold text-slate-900">Conectado como {googleDrive.name || googleDrive.email}</p>
                  <p className="text-sm text-slate-500">{googleDrive.email}</p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-semibold text-slate-900">Conecte uma conta Google</p>
                  <p className="text-sm text-slate-500">Depois da conexão, você pode listar arquivos recentes e vinculá-los ao cliente com um clique.</p>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleConnectDrive} type="button">
                {googleDrive?.email ? 'Reconectar Drive' : 'Conectar Drive'}
              </Button>
              {googleDrive?.email ? (
                <Button onClick={loadDriveFiles} disabled={loadingDriveFiles} type="button">
                  {loadingDriveFiles ? 'Buscando arquivos...' : 'Listar arquivos'}
                </Button>
              ) : null}
            </div>
          </div>
          {driveFiles.length ? (
            <div className="mt-4 grid gap-3">
              {driveFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-400">{file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('pt-BR') : 'Sem data'}</p>
                  </div>
                  <Button size="sm" onClick={() => handleAddDriveFile(file)} type="button">
                    Vincular
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

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
            Nenhuma fonte vinculada ainda. Adicione uma pasta, planilha, documento ou link relevante do cliente para enriquecer a IA.
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
              URL do Drive/Docs/Sheets
              <input
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="Cole a URL compartilhada"
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
