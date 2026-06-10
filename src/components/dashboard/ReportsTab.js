'use client'

import { useState, useEffect, useCallback } from 'react'

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ReportsTab({ clients = [] }) {
  const [reports, setReports] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [untilFilter, setUntilFilter] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (clientFilter) params.set('clientId', clientFilter)
      if (sinceFilter) params.set('since', sinceFilter)
      if (untilFilter) params.set('until', untilFilter)
      const res = await fetch(`/api/reports?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar relatórios')
      setReports(json.reports || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [clientFilter, sinceFilter, untilFilter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleDownload = async (report) => {
    setDownloadingId(report.id)
    try {
      const res = await fetch(`/api/reports/${report.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao obter link')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      window.alert(`Erro ao baixar: ${err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (report) => {
    if (!window.confirm(`Excluir relatório "${report.client_name} — ${report.period_label}"? Esta ação não pode ser desfeita.`)) return
    setDeletingId(report.id)
    try {
      const res = await fetch(`/api/reports/${report.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir')
      setReports((prev) => prev.filter((r) => r.id !== report.id))
    } catch (err) {
      window.alert(`Erro ao excluir: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Relatórios salvos</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchReports} disabled={isLoading}>
          <i className={isLoading ? 'bx bx-loader-alt bx-spin' : 'bx bx-refresh'}></i>
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {clients.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}>Cliente</label>
            <select
              className="glass-item"
              style={{ padding: '6px 10px', fontSize: '14px', minWidth: '160px' }}
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}>Salvo desde</label>
          <input
            type="date"
            className="glass-item"
            style={{ padding: '6px 10px', fontSize: '14px' }}
            value={sinceFilter}
            onChange={(e) => setSinceFilter(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}>Até</label>
          <input
            type="date"
            className="glass-item"
            style={{ padding: '6px 10px', fontSize: '14px' }}
            value={untilFilter}
            onChange={(e) => setUntilFilter(e.target.value)}
          />
        </div>
        {(clientFilter || sinceFilter || untilFilter) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { setClientFilter(''); setSinceFilter(''); setUntilFilter('') }}
            style={{ alignSelf: 'flex-end' }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', opacity: 0.6 }}>
          <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px' }}></i>
          <p style={{ marginTop: '8px' }}>Carregando relatórios...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-danger, #ef4444)' }}>
          <i className="bx bx-error-circle" style={{ fontSize: '28px' }}></i>
          <p style={{ marginTop: '8px' }}>{error}</p>
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', opacity: 0.5 }}>
          <i className="bx bx-file" style={{ fontSize: '36px' }}></i>
          <p style={{ marginTop: '8px' }}>Nenhum relatório salvo ainda.</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Use o botão &ldquo;Salvar relatório&rdquo; no dashboard de um cliente para salvar PDFs aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {reports.map((report) => (
            <div
              key={report.id}
              className="glass-item"
              style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderRadius: '12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {report.client_name || 'Cliente'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', opacity: 0.7 }}>{report.period_label || '—'}</p>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'var(--color-primary-muted, rgba(59,130,246,0.12))',
                    color: 'var(--color-primary, #3b82f6)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {report.report_type === 'client-pdf' ? 'PDF cliente' : 'PDF interno'}
                </span>
              </div>

              <div style={{ fontSize: '12px', opacity: 0.6, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span><i className="bx bx-calendar"></i> {formatDate(report.created_at)}</span>
                {report.file_size && <span><i className="bx bx-file"></i> {formatFileSize(report.file_size)}</span>}
                {report.created_by_name && <span><i className="bx bx-user"></i> {report.created_by_name}</span>}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload(report)}
                  disabled={downloadingId === report.id}
                  style={{ flex: 1 }}
                >
                  <i className={downloadingId === report.id ? 'bx bx-loader-alt bx-spin' : 'bx bx-download'}></i>
                  {downloadingId === report.id ? 'Abrindo...' : 'Baixar'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(report)}
                  disabled={deletingId === report.id}
                  title="Excluir relatório"
                >
                  <i className={deletingId === report.id ? 'bx bx-loader-alt bx-spin' : 'bx bx-trash'}></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
