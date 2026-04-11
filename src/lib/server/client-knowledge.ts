import { readGoogleSheetSummary } from '@/lib/server/google-sheets'
import { KnowledgeSource } from '@/lib/saas/types'

type LooseRecord = Record<string, unknown>

function normalizeSourceType(value: unknown): KnowledgeSource['type'] {
  const raw = String(value || '').trim()
  if (raw === 'google_drive_folder' || raw === 'google_sheets' || raw === 'google_docs') {
    return raw
  }
  return 'link'
}

function extractGoogleDocId(url: string) {
  return String(url || '')
    .trim()
    .match(/\/document\/d\/([a-zA-Z0-9-_]+)/)?.[1]
}

async function readGoogleDocText(url: string) {
  const docId = extractGoogleDocId(url)
  if (!docId) {
    throw new Error('Não foi possível identificar o documento do Google Docs.')
  }

  const response = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, {
    cache: 'no-store',
  })

  const text = await response.text()
  if (!response.ok || !text.trim()) {
    throw new Error('O documento não está acessível para leitura. Compartilhe ou publique o Google Docs.')
  }

  if (/<html|<!doctype html/i.test(text)) {
    throw new Error('O Google Docs retornou uma página de acesso em vez do conteúdo do documento.')
  }

  return text.trim()
}

export function extractKnowledgeSources(businessData: unknown): KnowledgeSource[] {
  const payload = businessData && typeof businessData === 'object' ? (businessData as LooseRecord) : {}
  const rawSources = Array.isArray(payload.knowledge_sources) ? payload.knowledge_sources : []

  return rawSources
    .map((item, index) => {
      const source = item && typeof item === 'object' ? (item as LooseRecord) : {}
      const url = String(source.url || '').trim()
      const title = String(source.title || '').trim()
      const notes = String(source.notes || '').trim()
      if (!url || !title) return null

      return {
        id: String(source.id || `source-${index + 1}`),
        type: normalizeSourceType(source.type),
        title,
        url,
        notes,
      } satisfies KnowledgeSource
    })
    .filter(Boolean) as KnowledgeSource[]
}

export async function resolveKnowledgeSourceSnippets(sources: KnowledgeSource[]) {
  return Promise.all(
    sources.map(async (source) => {
      try {
        if (source.type === 'google_sheets') {
          const summary = await readGoogleSheetSummary({ sourceUrl: source.url })
          const numericSummary = summary.numericColumns
            .slice(0, 4)
            .map((column) => `${column.header}: último ${column.last}`)
            .join(' | ')
          const statusSummary = summary.statusSummary?.counts
            .slice(0, 4)
            .map((item) => `${item.label}: ${item.count}`)
            .join(' | ')

          return {
            ...source,
            readable: true,
            summary: `Planilha com ${summary.totalRows} linhas. Colunas: ${summary.headers.slice(0, 8).join(', ')}.`,
            content: [numericSummary, statusSummary].filter(Boolean).join(' || '),
          }
        }

        if (source.type === 'google_docs') {
          const text = await readGoogleDocText(source.url)
          return {
            ...source,
            readable: true,
            summary: `Documento de texto com ${text.split(/\s+/).filter(Boolean).length} palavras aproximadamente.`,
            content: text.slice(0, 2400),
          }
        }

        return {
          ...source,
          readable: false,
          summary:
            source.type === 'google_drive_folder'
              ? 'Pasta vinculada como referência. A leitura automática de listagem depende de credenciais adicionais do Google.'
              : 'Link vinculado como referência contextual do cliente.',
          content: source.notes || '',
        }
      } catch (error) {
        return {
          ...source,
          readable: false,
          summary: error instanceof Error ? error.message : 'Não foi possível ler a fonte vinculada.',
          content: source.notes || '',
        }
      }
    })
  )
}
