'use client'

import { useState, useEffect, useRef } from 'react'

function formatRelative(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / 86400000)
  if (days === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Ontem'
  if (days < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' })
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function noteTitle(content) {
  const first = (content || '').split('\n')[0].trim()
  return first || 'Nova nota'
}

function notePreview(content) {
  const lines = (content || '').split('\n').filter(Boolean)
  return lines[1] || 'Sem conteúdo adicional'
}

export default function ClientNotesPanel({ clientId: initialClientId, clientName: initialClientName, clients = [] }) {
  // Internal client state — dropdown controls this independently
  const [activeClientId, setActiveClientId] = useState(initialClientId || null)
  const [activeClientName, setActiveClientName] = useState(initialClientName || null)

  const [filter, setFilter] = useState('mine') // 'all' | 'mine'
  const [notes, setNotes] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [editorContent, setEditorContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const saveTimer = useRef(null)
  const isNew = useRef(false)

  // Sync if parent activeClient changes (e.g. user clicks client on another tab)
  useEffect(() => {
    if (initialClientId && initialClientId !== activeClientId) {
      setActiveClientId(initialClientId)
      setActiveClientName(initialClientName)
    }
  }, [initialClientId, initialClientName])

  // Fetch notes whenever activeClientId or filter changes
  useEffect(() => {
    if (!activeClientId) {
      setNotes([])
      setSelectedId(null)
      setEditorContent('')
      isNew.current = false
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setNotes([])
    setSelectedId(null)
    setEditorContent('')
    isNew.current = false

    const fetchUrl = `/api/clients/${activeClientId}/notes${filter === 'mine' ? '?mine=true' : ''}`
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const list = data.notes || []
        setNotes(list)
        if (list.length > 0) {
          setSelectedId(list[0].id)
          setEditorContent(list[0].content)
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [activeClientId, filter])

  function handleClientChange(e) {
    const id = e.target.value
    const client = clients.find((c) => String(c.id) === id)
    if (!client) return
    setActiveClientId(client.id)
    setActiveClientName(client.name)
  }

  function selectNote(note) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSelectedId(note.id)
    setEditorContent(note.content)
    isNew.current = false
  }

  function handleNew() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSelectedId(null)
    setEditorContent('')
    isNew.current = true
  }

  async function saveNew(content) {
    if (!content.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/clients/${activeClientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar nota.')
      isNew.current = false
      const r = await fetch(`/api/clients/${activeClientId}/notes${filter === 'mine' ? '?mine=true' : ''}`)
      const d = await r.json()
      const list = d.notes || []
      setNotes(list)
      const created = data.note || list[0]
      if (created) { setSelectedId(created.id); setEditorContent(created.content) }
    } catch (err) { setError(err.message) }
    finally { setIsSaving(false) }
  }

  async function saveEdit(noteId, content) {
    if (!content.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/clients/${activeClientId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
      const r = await fetch(`/api/clients/${activeClientId}/notes${filter === 'mine' ? '?mine=true' : ''}`)
      const d = await r.json()
      setNotes(d.notes || [])
    } catch (err) { setError(err.message) }
    finally { setIsSaving(false) }
  }

  function handleEditorChange(value) {
    setEditorContent(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (isNew.current) saveNew(value)
      else if (selectedId) saveEdit(selectedId, value)
    }, 1200)
  }

  async function handleDelete(noteId, e) {
    e.stopPropagation()
    if (!window.confirm('Excluir esta nota?')) return
    try {
      const res = await fetch(`/api/clients/${activeClientId}/notes/${noteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir.')
      if (selectedId === noteId) { setSelectedId(null); setEditorContent(''); isNew.current = false }
      const r = await fetch(`/api/clients/${activeClientId}/notes${filter === 'mine' ? '?mine=true' : ''}`)
      const d = await r.json()
      setNotes(d.notes || [])
    } catch (err) { setError(err.message) }
  }

  const selectedNote = notes.find((n) => n.id === selectedId)

  return (
    <div className="ios-notes-shell">
      {/* Left panel */}
      <div className="ios-notes-list-panel">
        <div className="ios-notes-list-header">
          {clients.length > 0 ? (
            <select
              className="ios-notes-client-select"
              value={activeClientId ? String(activeClientId) : ''}
              onChange={handleClientChange}
            >
              <option value="" disabled>Selecionar cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="ios-notes-client-name">{activeClientName || 'Notas'}</span>
          )}
          <button
            className="ios-notes-new-btn"
            onClick={handleNew}
            title="Nova nota"
            disabled={!activeClientId}
          >
            <i className="bx bx-edit-alt"></i>
          </button>
        </div>

        <div className="ios-notes-filter-bar">
          <button
            className={`ios-notes-filter-btn ${filter === 'mine' ? 'active' : ''}`}
            onClick={() => setFilter('mine')}
          >Minhas</button>
          <button
            className={`ios-notes-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >Todas</button>
        </div>

        {!activeClientId ? (
          <div className="ios-notes-state">Selecione um cliente acima.</div>
        ) : isLoading ? (
          <div className="ios-notes-state">Carregando...</div>
        ) : notes.length === 0 ? (
          <div className="ios-notes-state">Nenhuma nota ainda.</div>
        ) : (
          <ul className="ios-notes-list">
            {notes.map((note) => (
              <li
                key={note.id}
                className={`ios-notes-list-item ${note.id === selectedId ? 'selected' : ''}`}
                onClick={() => selectNote(note)}
              >
                <div className="ios-note-title">{noteTitle(note.content)}</div>
                <div className="ios-note-meta">
                  <span className="ios-note-date">{formatRelative(note.created_at)}</span>
                  <span className="ios-note-preview">{notePreview(note.content)}</span>
                </div>
                <button
                  className="ios-note-delete"
                  onClick={(e) => handleDelete(note.id, e)}
                  title="Excluir"
                >
                  <i className="bx bx-trash"></i>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right panel — editor */}
      <div className="ios-notes-editor-panel">
        {!activeClientId ? (
          <div className="ios-notes-editor-empty">
            <i className="bx bx-user"></i>
            <p>Selecione um cliente para ver as notas</p>
          </div>
        ) : (selectedId !== null || isNew.current) ? (
          <>
            <div className="ios-notes-editor-meta">
              {selectedNote && (
                <span>{formatRelative(selectedNote.created_at)} · {selectedNote.created_by_name || 'Você'}</span>
              )}
              {isSaving && <span className="ios-notes-saving">Salvando...</span>}
            </div>
            <textarea
              className="ios-notes-editor"
              value={editorContent}
              onChange={(e) => handleEditorChange(e.target.value)}
              placeholder="Escreva sua nota..."
              autoFocus
            />
          </>
        ) : (
          <div className="ios-notes-editor-empty">
            <i className="bx bx-notepad"></i>
            <p>Selecione uma nota ou crie uma nova</p>
            <button className="ios-notes-new-btn-cta" onClick={handleNew}>
              <i className="bx bx-plus"></i> Nova nota
            </button>
          </div>
        )}
        {error && (
          <div className="ios-notes-error">
            <i className="bx bx-error-circle"></i> {error}
          </div>
        )}
      </div>

      <style jsx>{`
        .ios-notes-shell {
          display: flex;
          height: calc(100vh - 80px);
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          background: var(--bg-panel, #111113);
        }

        .ios-notes-list-panel {
          width: 260px;
          min-width: 260px;
          border-right: 1px solid var(--border-color, rgba(255,255,255,0.08));
          display: flex;
          flex-direction: column;
          background: var(--bg-dark, #0a0a0c);
        }

        .ios-notes-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 16px 12px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
          gap: 8px;
        }

        .ios-notes-client-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary, #f5f5f7);
          letter-spacing: -0.01em;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ios-notes-client-select {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary, #f5f5f7);
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        .ios-notes-client-select option {
          background: #1a1a1e;
          color: #f5f5f7;
        }

        .ios-notes-new-btn {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--button-primary, #26c281);
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: background 0.15s;
        }

        .ios-notes-new-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.06);
        }

        .ios-notes-new-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }

        .ios-notes-filter-bar {
          display: flex;
          gap: 4px;
          padding: 8px 10px 6px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        }

        .ios-notes-filter-btn {
          flex: 1;
          padding: 5px 8px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-muted, rgba(245,245,247,0.5));
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }

        .ios-notes-filter-btn.active {
          background: rgba(38,194,129,0.14);
          color: var(--button-primary, #26c281);
        }

        .ios-notes-filter-btn:hover:not(.active) {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary, #f5f5f7);
        }

        .ios-notes-state {
          padding: 24px 16px;
          font-size: 13px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          text-align: center;
        }

        .ios-notes-list {
          list-style: none;
          margin: 0;
          padding: 6px 0;
          flex: 1;
          overflow-y: auto;
        }

        .ios-notes-list-item {
          position: relative;
          padding: 11px 16px;
          cursor: pointer;
          border-radius: 10px;
          margin: 2px 6px;
          transition: background 0.15s;
        }

        .ios-notes-list-item:hover { background: rgba(255,255,255,0.05); }
        .ios-notes-list-item:hover .ios-note-delete { opacity: 1; }
        .ios-notes-list-item.selected { background: rgba(38,194,129,0.12); }

        .ios-note-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #f5f5f7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 24px;
        }

        .ios-note-meta {
          display: flex;
          gap: 6px;
          margin-top: 3px;
          align-items: baseline;
        }

        .ios-note-date {
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          white-space: nowrap;
          flex-shrink: 0;
        }

        .ios-note-preview {
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ios-note-delete {
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
          opacity: 0;
          border: none;
          background: none;
          cursor: pointer;
          color: rgba(255,59,48,0.7);
          font-size: 15px;
          display: flex;
          align-items: center;
          transition: opacity 0.15s, color 0.15s;
          padding: 4px;
          border-radius: 6px;
        }

        .ios-note-delete:hover { color: #ff3b30; }

        .ios-notes-editor-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-panel, #111113);
          position: relative;
        }

        .ios-notes-editor-meta {
          padding: 14px 24px 6px;
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          display: flex;
          gap: 12px;
          align-items: center;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        }

        .ios-notes-saving { color: var(--button-primary, #26c281); font-style: italic; }

        .ios-notes-editor {
          flex: 1;
          width: 100%;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          color: var(--text-primary, #f5f5f7);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.7;
          padding: 20px 28px;
          caret-color: var(--button-primary, #26c281);
        }

        .ios-notes-editor::placeholder { color: var(--text-muted, rgba(245,245,247,0.3)); }

        .ios-notes-editor-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-muted, rgba(245,245,247,0.44));
        }

        .ios-notes-editor-empty i { font-size: 40px; opacity: 0.3; }
        .ios-notes-editor-empty p { font-size: 14px; margin: 0; }

        .ios-notes-new-btn-cta {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid var(--border-color, rgba(255,255,255,0.1));
          border-radius: 10px;
          background: none;
          color: var(--button-primary, #26c281);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .ios-notes-new-btn-cta:hover { background: rgba(38,194,129,0.08); }

        .ios-notes-error {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255,59,48,0.12);
          border: 1px solid rgba(255,59,48,0.3);
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 12px;
          color: #ff3b30;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        /* Light mode */
        :global(.dashboard-light-mode) .ios-notes-shell {
          background: #f5f5f0;
          border-color: rgba(0,0,0,0.08);
        }
        :global(.dashboard-light-mode) .ios-notes-list-panel {
          background: #ebe9e4;
          border-right-color: rgba(0,0,0,0.08);
        }
        :global(.dashboard-light-mode) .ios-notes-list-header {
          border-bottom-color: rgba(0,0,0,0.07);
        }
        :global(.dashboard-light-mode) .ios-notes-client-name,
        :global(.dashboard-light-mode) .ios-note-title {
          color: #1c1c1e;
        }
        :global(.dashboard-light-mode) .ios-notes-client-select {
          color: #1c1c1e;
        }
        :global(.dashboard-light-mode) .ios-notes-client-select option {
          background: #ebe9e4;
          color: #1c1c1e;
        }
        :global(.dashboard-light-mode) .ios-notes-new-btn:hover:not(:disabled) {
          background: rgba(0,0,0,0.05);
        }
        :global(.dashboard-light-mode) .ios-notes-list-item:hover { background: rgba(0,0,0,0.04); }
        :global(.dashboard-light-mode) .ios-notes-list-item.selected { background: rgba(38,194,129,0.12); }
        :global(.dashboard-light-mode) .ios-note-date,
        :global(.dashboard-light-mode) .ios-note-preview { color: rgba(28,28,30,0.45); }
        :global(.dashboard-light-mode) .ios-notes-editor-panel { background: #faf9f7; }
        :global(.dashboard-light-mode) .ios-notes-editor-meta {
          border-bottom-color: rgba(0,0,0,0.07);
          color: rgba(28,28,30,0.45);
        }
        :global(.dashboard-light-mode) .ios-notes-editor { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-editor::placeholder { color: rgba(28,28,30,0.3); }
        :global(.dashboard-light-mode) .ios-notes-state,
        :global(.dashboard-light-mode) .ios-notes-editor-empty { color: rgba(28,28,30,0.44); }
        :global(.dashboard-light-mode) .ios-notes-filter-bar { border-bottom-color: rgba(0,0,0,0.07); }
        :global(.dashboard-light-mode) .ios-notes-filter-btn { color: rgba(28,28,30,0.45); }
        :global(.dashboard-light-mode) .ios-notes-filter-btn:hover:not(.active) { background: rgba(0,0,0,0.04); color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-filter-btn.active { background: rgba(38,194,129,0.12); color: #1a7a52; }
      `}</style>
    </div>
  )
}
