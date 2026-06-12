'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* ─── helpers ─────────────────────────────────────────────────── */

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

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function noteTitle(html) {
  if (!html) return 'Nova nota'
  const m = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i)
  if (m) return stripHtml(m[1]) || 'Nova nota'
  const plain = stripHtml(html)
  const first = plain.split('\n')[0].trim()
  return first || 'Nova nota'
}

function notePreview(html) {
  if (!html) return 'Sem conteúdo adicional'
  const plain = stripHtml(html)
  const lines = plain.split('\n').filter(Boolean)
  const preview = lines.slice(1).join(' ')
  return preview.slice(0, 80) || 'Sem conteúdo adicional'
}

function execCmd(command, value) {
  try { document.execCommand(command, false, value ?? null) } catch (_) {}
}

/* ─── NoteListItem sub-component ─────────────────────────────── */

function NoteListItem({ note, selectedId, children, onSelect, onDelete, onCreateSubNote, isChild, clientLabel }) {
  return (
    <>
      <li
        className={`ios-notes-list-item${note.id === selectedId ? ' selected' : ''}${isChild ? ' child-item' : ''}`}
        onClick={() => onSelect(note)}
      >
        <div className="ios-note-title">
          {isChild && <span className="ios-note-child-prefix">&#8627;</span>}
          {noteTitle(note.content)}
        </div>
        <div className="ios-note-meta">
          <span className="ios-note-date">{formatRelative(note.created_at)}</span>
          {clientLabel && <span className="ios-note-client-badge">{clientLabel}</span>}
          <span className="ios-note-preview">{notePreview(note.content)}</span>
        </div>
        <div className="ios-note-actions">
          <button
            className="ios-note-action-btn ios-note-subnote-btn"
            onClick={(e) => onCreateSubNote(note.id, e)}
            title="Sub-nota"
          >
            +
          </button>
          <button
            className="ios-note-action-btn ios-note-delete-btn"
            onClick={(e) => onDelete(note.id, e)}
            title="Excluir"
          >
            <i className="bx bx-trash" />
          </button>
        </div>
      </li>
      {children && children.length > 0 && children.map((child) => (
        <NoteListItem
          key={child.id}
          note={child}
          selectedId={selectedId}
          children={[]}
          onSelect={onSelect}
          onDelete={onDelete}
          onCreateSubNote={onCreateSubNote}
          isChild={true}
        />
      ))}
    </>
  )
}

/* ─── main component ──────────────────────────────────────────── */

const ALL_CLIENTS = '__all__'

export default function ClientNotesPanel({ clientId: initialClientId, clientName: initialClientName, clients = [], isLightMode }) {
  // Default to "all clients" unless a specific clientId is passed in
  const [activeClientId, setActiveClientId] = useState(initialClientId || ALL_CLIENTS)
  const [activeClientName, setActiveClientName] = useState(initialClientName || 'Todos os clientes')

  const [notes, setNotes] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  // showEditor as state so clicking "nova nota" immediately renders the editor
  const [showEditor, setShowEditor] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const editorRef = useRef(null)
  const saveTimer = useRef(null)
  const isNew = useRef(false)
  const newParentId = useRef(null)
  const currentNoteIdRef = useRef(null)

  useEffect(() => {
    currentNoteIdRef.current = selectedId
  }, [selectedId])

  // Sync if parent prop changes (e.g. clicking a client from the sidebar)
  useEffect(() => {
    if (initialClientId && initialClientId !== activeClientId) {
      setActiveClientId(initialClientId)
      setActiveClientName(initialClientName)
    }
  }, [initialClientId, initialClientName])

  /* ── fetch notes ── */
  const fetchNotes = useCallback(async (clientId) => {
    if (clientId === ALL_CLIENTS) {
      const res = await fetch('/api/notes?mine=true')
      const data = await res.json()
      return data.notes || []
    }
    if (!clientId) return []
    const res = await fetch(`/api/clients/${clientId}/notes?mine=true`)
    const data = await res.json()
    return data.notes || []
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setShowEditor(false)
    setSelectedId(null)
    currentNoteIdRef.current = null
    isNew.current = false
    if (editorRef.current) editorRef.current.innerHTML = ''

    fetchNotes(activeClientId).then((list) => {
      if (cancelled) return
      setNotes(list)
      if (list.length > 0) {
        setSelectedId(list[0].id)
        currentNoteIdRef.current = list[0].id
        isNew.current = false
        setShowEditor(true)
        if (editorRef.current) editorRef.current.innerHTML = list[0].content || ''
      }
    }).catch((err) => {
      if (!cancelled) setError(err.message)
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [activeClientId, fetchNotes])

  /* ── save logic ── */
  async function saveNew(content, parentId) {
    if (!activeClientId) { setError('Selecione um cliente para salvar'); return }
    if (!content.trim()) return
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/clients/${activeClientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentId: parentId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar nota.')
      isNew.current = false
      newParentId.current = null
      const created = data.note
      if (created) {
        setSelectedId(created.id)
        currentNoteIdRef.current = created.id
      }
      const list = await fetchNotes(activeClientId)
      setNotes(list)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setError(err.message)
      setSaveStatus('error')
    }
  }

  async function saveEdit(noteId, content) {
    if (!content.trim()) return
    setSaveStatus('saving')
    try {
      // Resolve the correct clientId even when in "all clients" mode
      const noteClientId = notes.find((n) => n.id === noteId)?.client_id || activeClientId
      const res = await fetch(`/api/clients/${noteClientId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
      // Don't refetch all notes on every auto-save keystroke — just update in place
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, content } : n))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setError(err.message)
      setSaveStatus('error')
    }
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const content = editorRef.current?.innerHTML || ''
      if (isNew.current) {
        saveNew(content, newParentId.current)
      } else if (currentNoteIdRef.current) {
        saveEdit(currentNoteIdRef.current, content)
      }
    }, 1500)
  }

  function forceSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const content = editorRef.current?.innerHTML || ''
    if (isNew.current) {
      saveNew(content, newParentId.current)
    } else if (currentNoteIdRef.current) {
      saveEdit(currentNoteIdRef.current, content)
    } else {
      if (!activeClientId) setError('Selecione um cliente para salvar')
    }
  }

  /* ── note operations ── */
  function selectNote(note) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSelectedId(note.id)
    setShowEditor(true)
    currentNoteIdRef.current = note.id
    isNew.current = false
    newParentId.current = null
    if (editorRef.current) {
      editorRef.current.innerHTML = note.content || ''
      editorRef.current.focus()
    }
  }

  function handleNew(parentId) {
    // In "all clients" mode, can't create a note without a specific client selected
    if (activeClientId === ALL_CLIENTS) {
      setError('Selecione um cliente específico para criar uma nota')
      return
    }
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSelectedId(null)
    setShowEditor(true)
    currentNoteIdRef.current = null
    isNew.current = true
    newParentId.current = parentId || null
    // Focus after React re-renders the editor
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = ''
        editorRef.current.focus()
      }
    }, 0)
  }

  async function handleDelete(noteId, e) {
    e.stopPropagation()
    if (!window.confirm('Excluir esta nota?')) return
    try {
      // Find the client_id for this note (needed when in "all clients" mode)
      const note = notes.find((n) => n.id === noteId)
      const clientIdForNote = note?.client_id || activeClientId
      const res = await fetch(`/api/clients/${clientIdForNote}/notes/${noteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir.')
      if (currentNoteIdRef.current === noteId) {
        setSelectedId(null)
        setShowEditor(false)
        currentNoteIdRef.current = null
        isNew.current = false
        if (editorRef.current) editorRef.current.innerHTML = ''
      }
      const list = await fetchNotes(activeClientId)
      setNotes(list)
    } catch (err) { setError(err.message) }
  }

  async function handleCreateSubNote(parentId, e) {
    e.stopPropagation()
    if (!activeClientId || activeClientId === ALL_CLIENTS) return
    // Find client_id from parent note (needed in all-clients mode)
    const parentNote = notes.find((n) => n.id === parentId)
    const clientIdForNote = parentNote?.client_id || activeClientId
    if (!clientIdForNote || clientIdForNote === ALL_CLIENTS) return
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/clients/${clientIdForNote}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '<p>Nova sub-nota</p>', parentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar sub-nota.')
      const created = data.note
      const list = await fetchNotes(activeClientId)
      setNotes(list)
      if (created) {
        setSelectedId(created.id)
        setShowEditor(true)
        currentNoteIdRef.current = created.id
        isNew.current = false
        newParentId.current = null
        if (editorRef.current) {
          editorRef.current.innerHTML = created.content || ''
          editorRef.current.focus()
        }
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setError(err.message)
      setSaveStatus('error')
    }
  }

  function handleClientChange(e) {
    const id = e.target.value
    if (id === ALL_CLIENTS) {
      setActiveClientId(ALL_CLIENTS)
      setActiveClientName('Todos os clientes')
      return
    }
    const client = clients.find((c) => String(c.id) === id)
    if (!client) return
    setActiveClientId(client.id)
    setActiveClientName(client.name)
  }

  /* ── toolbar commands ── */
  function applyFormat(formatCmd, value) {
    editorRef.current?.focus()
    execCmd(formatCmd, value)
  }

  function applyBlock(tag) {
    editorRef.current?.focus()
    execCmd('formatBlock', tag)
  }

  function applyTextColor(color) {
    editorRef.current?.focus()
    execCmd('foreColor', color)
  }

  function applyHighlight(color) {
    editorRef.current?.focus()
    execCmd('hiliteColor', color)
  }

  function insertChecklist() {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const ul = document.createElement('ul')
    ul.className = 'checklist'
    const li = document.createElement('li')
    li.innerHTML = '<span class="check-circle" contenteditable="false"></span><span class="check-text">Item</span>'
    ul.appendChild(li)
    range.deleteContents()
    range.insertNode(ul)
    const textSpan = li.querySelector('.check-text')
    if (textSpan) {
      const r = document.createRange()
      r.selectNodeContents(textSpan)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  /* ── editor event handlers ── */
  function handleEditorInput() {
    scheduleSave()
  }

  function handleEditorClick(e) {
    if (e.target.classList.contains('check-circle')) {
      const li = e.target.closest('li')
      if (li) li.classList.toggle('checked')
      scheduleSave()
    }
  }

  function handleEditorKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      forceSave()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFormat('bold') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); applyFormat('italic') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); applyFormat('underline') }

    if (e.key === 'Enter') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        const node = sel.getRangeAt(0).startContainer
        const li = (node.nodeType === 3 ? node.parentElement : node)?.closest('li')
        if (li && li.closest('ul.checklist')) {
          e.preventDefault()
          const ul = li.closest('ul.checklist')
          const newLi = document.createElement('li')
          newLi.innerHTML = '<span class="check-circle" contenteditable="false"></span><span class="check-text"></span>'
          ul.insertBefore(newLi, li.nextSibling)
          const textSpan = newLi.querySelector('.check-text')
          if (textSpan) {
            const r = document.createRange()
            r.selectNodeContents(textSpan)
            r.collapse(false)
            sel.removeAllRanges()
            sel.addRange(r)
          }
        }
      }
    }
  }

  /* ── derived state ── */
  const topLevelNotes = notes.filter((n) => !n.parent_id)
  const childrenOf = (parentId) => notes.filter((n) => n.parent_id === parentId)

  const filteredTopLevel = searchQuery
    ? notes.filter((n) => stripHtml(n.content).toLowerCase().includes(searchQuery.toLowerCase()))
    : topLevelNotes

  const selectedNote = notes.find((n) => n.id === selectedId)
  const hasEditor = showEditor

  const saveLabel = saveStatus === 'saving' ? 'Salvando...'
    : saveStatus === 'saved' ? 'Salvo'
    : saveStatus === 'error' ? 'Erro' : ''

  /* ── render ── */
  return (
    <div className="ios-notes-shell">

      {/* ── Left panel ── */}
      <div className="ios-notes-list-panel">
        <div className="ios-notes-list-header">
          {clients.length > 0 ? (
            <select
              className="ios-notes-client-select"
              value={activeClientId ? String(activeClientId) : ALL_CLIENTS}
              onChange={handleClientChange}
            >
              <option value={ALL_CLIENTS}>Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="ios-notes-client-name">{activeClientName || 'Notas'}</span>
          )}
          <button
            className="ios-notes-new-btn"
            onClick={() => handleNew(null)}
            title={activeClientId === ALL_CLIENTS ? 'Selecione um cliente para criar nota' : 'Nova nota'}
            disabled={activeClientId === ALL_CLIENTS}
          >
            <i className="bx bx-edit-alt" />
          </button>
        </div>

        <div className="ios-notes-search-bar">
          <i className="bx bx-search ios-notes-search-icon" />
          <input
            className="ios-notes-search-input"
            type="text"
            placeholder="Buscar notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="ios-notes-search-clear" onClick={() => setSearchQuery('')}>
              <i className="bx bx-x" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="ios-notes-state">Carregando...</div>
        ) : notes.length === 0 ? (
          <div className="ios-notes-state">Nenhuma nota ainda.</div>
        ) : filteredTopLevel.length === 0 ? (
          <div className="ios-notes-state">Nenhum resultado.</div>
        ) : (
          <ul className="ios-notes-list">
            {filteredTopLevel.map((note) => {
              const clientLabel = activeClientId === ALL_CLIENTS
                ? (clients.find((c) => String(c.id) === String(note.client_id))?.name || null)
                : null
              return (
                <NoteListItem
                  key={note.id}
                  note={note}
                  selectedId={selectedId}
                  children={searchQuery ? [] : childrenOf(note.id)}
                  onSelect={selectNote}
                  onDelete={handleDelete}
                  onCreateSubNote={handleCreateSubNote}
                  isChild={false}
                  clientLabel={clientLabel}
                />
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="ios-notes-editor-panel">
        {hasEditor ? (
          <>
            {/* Toolbar */}
            <div className="ios-toolbar">
              <select
                className="ios-toolbar-select"
                onChange={(e) => { applyBlock(e.target.value); e.target.value = 'p' }}
                defaultValue="p"
                title="Estilo do parágrafo"
              >
                <option value="p">Corpo</option>
                <option value="h1">Título</option>
                <option value="h2">Cabeçalho</option>
                <option value="h3">Subcabeçalho</option>
                <option value="pre">Monoespaçado</option>
              </select>

              <div className="ios-toolbar-sep" />

              <button className="ios-tb-btn" title="Negrito (Ctrl+B)" onClick={() => applyFormat('bold')}>
                <strong>B</strong>
              </button>
              <button className="ios-tb-btn" title="Itálico (Ctrl+I)" onClick={() => applyFormat('italic')}>
                <em>I</em>
              </button>
              <button className="ios-tb-btn" title="Sublinhado (Ctrl+U)" onClick={() => applyFormat('underline')}>
                <u>U</u>
              </button>
              <button className="ios-tb-btn" title="Tachado" onClick={() => applyFormat('strikeThrough')}>
                <s>S</s>
              </button>

              <div className="ios-toolbar-sep" />

              <label className="ios-tb-color-btn" title="Cor do texto">
                <i className="bx bx-font-color" />
                <input
                  type="color"
                  className="ios-tb-color-input"
                  defaultValue="#26c281"
                  onChange={(e) => applyTextColor(e.target.value)}
                />
              </label>

              <label className="ios-tb-color-btn" title="Realçar texto">
                <i className="bx bx-highlight" />
                <input
                  type="color"
                  className="ios-tb-color-input"
                  defaultValue="#ffe066"
                  onChange={(e) => applyHighlight(e.target.value)}
                />
              </label>

              <div className="ios-toolbar-sep" />

              <button className="ios-tb-btn" title="Lista com marcadores" onClick={() => applyFormat('insertUnorderedList')}>
                <i className="bx bx-list-ul" />
              </button>
              <button className="ios-tb-btn" title="Lista numerada" onClick={() => applyFormat('insertOrderedList')}>
                <i className="bx bx-list-ol" />
              </button>
              <button className="ios-tb-btn" title="Checklist" onClick={insertChecklist}>
                <i className="bx bx-checkbox-checked" />
              </button>

              <div className="ios-toolbar-sep" />

              <button className="ios-tb-btn" title="Aumentar recuo" onClick={() => applyFormat('indent')}>
                <i className="bx bx-indent" />
              </button>
              <button className="ios-tb-btn" title="Diminuir recuo" onClick={() => applyFormat('outdent')}>
                <i className="bx bx-outdent" />
              </button>

              <div className="ios-toolbar-sep" />

              <div className="ios-toolbar-spacer" />

              {saveLabel ? <span className={`ios-save-status ${saveStatus}`}>{saveLabel}</span> : null}

              <button className="ios-tb-btn ios-save-btn" title="Salvar (Ctrl+S)" onClick={forceSave}>
                <i className="bx bx-save" />
              </button>
            </div>

            {/* Editor meta */}
            <div className="ios-notes-editor-meta">
              {selectedNote ? (
                <span>{formatRelative(selectedNote.created_at)} &middot; {selectedNote.created_by_name || 'Você'}</span>
              ) : (
                <span>Nova nota</span>
              )}
              {selectedNote && activeClientId === ALL_CLIENTS && (() => {
                const cn = clients.find((c) => String(c.id) === String(selectedNote.client_id))?.name
                return cn ? <span className="ios-notes-warning" style={{ color: 'var(--button-primary,#26c281)', fontStyle: 'normal', fontWeight: 600 }}>{cn}</span> : null
              })()}
            </div>

            {/* Contenteditable editor */}
            <div
              ref={editorRef}
              className="ios-notes-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              data-placeholder="Escreva sua nota..."
            />
          </>
        ) : (
          <div className="ios-notes-editor-empty">
            <i className="bx bx-notepad" />
            <p>Selecione uma nota ou crie uma nova</p>
            <button className="ios-notes-new-btn-cta" onClick={() => handleNew(null)}>
              <i className="bx bx-plus" /> Nova nota
            </button>
          </div>
        )}

        {error && (
          <div className="ios-notes-error" onClick={() => setError(null)}>
            <i className="bx bx-error-circle" /> {error}
          </div>
        )}
      </div>

      <style jsx>{`
        /* ── Shell ── */
        .ios-notes-shell {
          display: flex;
          height: calc(100vh - 80px);
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          background: var(--bg-panel, #111113);
        }

        /* ── Left panel ── */
        .ios-notes-list-panel {
          width: 280px;
          min-width: 280px;
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

        .ios-notes-new-btn:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
        .ios-notes-new-btn:disabled { opacity: 0.3; cursor: default; }

        /* ── Search bar ── */
        .ios-notes-search-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        }

        .ios-notes-search-icon {
          font-size: 15px;
          color: var(--text-muted, rgba(245,245,247,0.4));
          flex-shrink: 0;
        }

        .ios-notes-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary, #f5f5f7);
          font-size: 13px;
          font-family: inherit;
        }

        .ios-notes-search-input::placeholder {
          color: var(--text-muted, rgba(245,245,247,0.35));
        }

        .ios-notes-search-clear {
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-muted, rgba(245,245,247,0.4));
          font-size: 16px;
          display: flex;
          align-items: center;
          padding: 0;
        }

        /* ── Note list ── */
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

        /* ── Right panel ── */
        .ios-notes-editor-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--bg-panel, #111113);
          position: relative;
          min-width: 0;
        }

        /* ── Toolbar ── */
        .ios-toolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 2px;
          padding: 6px 12px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
          background: var(--bg-dark, #0a0a0c);
        }

        .ios-toolbar-sep {
          width: 1px;
          height: 20px;
          background: var(--border-color, rgba(255,255,255,0.1));
          margin: 0 4px;
          flex-shrink: 0;
        }

        .ios-toolbar-spacer { flex: 1; }

        .ios-toolbar-select {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--text-primary, #f5f5f7);
          font-size: 12px;
          font-family: inherit;
          padding: 3px 4px;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s;
        }

        .ios-toolbar-select:hover {
          border-color: var(--border-color, rgba(255,255,255,0.12));
        }

        .ios-toolbar-select option {
          background: #1a1a1e;
          color: #f5f5f7;
        }

        .ios-tb-btn {
          min-width: 28px;
          height: 28px;
          padding: 0 6px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-primary, #f5f5f7);
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
          font-family: inherit;
        }

        .ios-tb-btn:hover { background: rgba(255,255,255,0.08); }

        .ios-save-btn { color: var(--button-primary, #26c281); }
        .ios-save-btn:hover { background: rgba(38,194,129,0.12); }

        .ios-tb-color-btn {
          position: relative;
          min-width: 28px;
          height: 28px;
          padding: 0 6px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-primary, #f5f5f7);
          font-size: 13px;
          transition: background 0.15s;
        }

        .ios-tb-color-btn:hover { background: rgba(255,255,255,0.08); }

        .ios-tb-color-input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
          pointer-events: none;
        }

        .ios-save-status {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: 500;
        }

        .ios-save-status.saving { color: var(--text-muted, rgba(245,245,247,0.5)); }
        .ios-save-status.saved { color: var(--button-primary, #26c281); }
        .ios-save-status.error { color: #ff3b30; }

        /* ── Editor meta ── */
        .ios-notes-editor-meta {
          padding: 8px 24px 6px;
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          display: flex;
          gap: 12px;
          align-items: center;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.05));
        }

        .ios-notes-warning { color: #ff9f0a; font-style: italic; }

        /* ── Contenteditable editor ── */
        .ios-notes-editor {
          flex: 1;
          outline: none;
          padding: 24px 28px;
          color: var(--text-primary, #f5f5f7);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.75;
          overflow-y: auto;
          caret-color: var(--button-primary, #26c281);
          word-wrap: break-word;
        }

        .ios-notes-editor:empty::before {
          content: attr(data-placeholder);
          color: var(--text-muted, rgba(245,245,247,0.3));
          pointer-events: none;
          display: block;
        }

        /* editor content styles via :global */
        :global(.ios-notes-editor h1) { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
        :global(.ios-notes-editor h2) { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
        :global(.ios-notes-editor h3) { font-size: 15px; font-weight: 600; margin: 10px 0 4px; }
        :global(.ios-notes-editor pre) {
          font-family: 'SF Mono', 'Menlo', monospace;
          font-size: 12px;
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          padding: 8px 12px;
          white-space: pre-wrap;
        }
        :global(.ios-notes-editor p) { margin: 0 0 6px; }
        :global(.ios-notes-editor ul:not(.checklist)), :global(.ios-notes-editor ol) {
          padding-left: 20px;
          margin: 4px 0;
        }

        /* ── Checklist ── */
        :global(.ios-notes-editor ul.checklist) {
          list-style: none;
          padding-left: 0;
          margin: 6px 0;
        }

        :global(.ios-notes-editor ul.checklist li) {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 3px 0;
          line-height: 1.5;
        }

        :global(.ios-notes-editor ul.checklist li .check-circle) {
          width: 16px;
          height: 16px;
          min-width: 16px;
          border-radius: 50%;
          border: 2px solid var(--button-primary, #26c281);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin-top: 3px;
          transition: background 0.15s;
          user-select: none;
        }

        :global(.ios-notes-editor ul.checklist li.checked .check-circle) {
          background: var(--button-primary, #26c281);
        }

        :global(.ios-notes-editor ul.checklist li.checked .check-circle::after) {
          content: '';
          display: block;
          width: 4px;
          height: 7px;
          border: 2px solid #fff;
          border-top: none;
          border-left: none;
          transform: rotate(45deg) translateY(-1px);
        }

        :global(.ios-notes-editor ul.checklist li.checked .check-text) {
          text-decoration: line-through;
          opacity: 0.5;
        }

        :global(.ios-notes-editor ul.checklist li .check-text) {
          flex: 1;
          outline: none;
        }

        /* ── Editor empty state ── */
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

        /* ── Error toast ── */
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
          cursor: pointer;
          z-index: 10;
        }

        /* ── Note list items (global for NoteListItem) ── */
        :global(.ios-notes-list-item) {
          position: relative;
          padding: 11px 16px;
          cursor: pointer;
          border-radius: 10px;
          margin: 2px 6px;
          transition: background 0.15s;
          list-style: none;
        }

        :global(.ios-notes-list-item:hover) { background: rgba(255,255,255,0.05); }
        :global(.ios-notes-list-item:hover .ios-note-action-btn) { opacity: 1; }
        :global(.ios-notes-list-item.selected) { background: rgba(38,194,129,0.12); }
        :global(.ios-notes-list-item.child-item) { margin-left: 22px; }

        :global(.ios-note-title) {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #f5f5f7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 60px;
        }

        :global(.ios-note-child-prefix) {
          color: var(--text-muted, rgba(245,245,247,0.5));
          margin-right: 4px;
        }

        :global(.ios-note-meta) {
          display: flex;
          gap: 6px;
          margin-top: 3px;
          align-items: baseline;
        }

        :global(.ios-note-date) {
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          white-space: nowrap;
          flex-shrink: 0;
        }

        :global(.ios-note-preview) {
          font-size: 11px;
          color: var(--text-muted, rgba(245,245,247,0.44));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        :global(.ios-note-client-badge) {
          font-size: 10px;
          font-weight: 600;
          color: var(--button-primary, #26c281);
          background: rgba(38,194,129,0.12);
          border-radius: 4px;
          padding: 1px 5px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        :global(.ios-note-actions) {
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          display: flex;
          gap: 2px;
          align-items: center;
        }

        :global(.ios-note-action-btn) {
          opacity: 0;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 6px;
          transition: opacity 0.15s, color 0.15s, background 0.15s;
        }

        :global(.ios-note-delete-btn) { color: rgba(255,59,48,0.7); }
        :global(.ios-note-delete-btn:hover) { color: #ff3b30; background: rgba(255,59,48,0.1); }
        :global(.ios-note-subnote-btn) { color: var(--button-primary, #26c281); font-size: 11px; font-weight: bold; }
        :global(.ios-note-subnote-btn:hover) { background: rgba(38,194,129,0.12); }

        /* ── Light mode overrides ── */
        :global(.dashboard-light-mode) .ios-notes-shell {
          background: #f5f5f0;
          border-color: rgba(0,0,0,0.08);
        }
        :global(.dashboard-light-mode) .ios-notes-list-panel {
          background: #ebe9e4;
          border-right-color: rgba(0,0,0,0.08);
        }
        :global(.dashboard-light-mode) .ios-notes-list-header { border-bottom-color: rgba(0,0,0,0.07); }
        :global(.dashboard-light-mode) .ios-notes-client-name { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-client-select { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-client-select option { background: #ebe9e4; color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-new-btn:hover:not(:disabled) { background: rgba(0,0,0,0.05); }
        :global(.dashboard-light-mode) .ios-notes-search-input { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-search-input::placeholder { color: rgba(28,28,30,0.35); }
        :global(.dashboard-light-mode) .ios-notes-search-icon { color: rgba(28,28,30,0.4); }
        :global(.dashboard-light-mode) .ios-notes-state { color: rgba(28,28,30,0.44); }
        :global(.dashboard-light-mode) .ios-toolbar { background: #ebe9e4; border-bottom-color: rgba(0,0,0,0.07); }
        :global(.dashboard-light-mode) .ios-toolbar-select { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-toolbar-select option { background: #ebe9e4; color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-tb-btn { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-tb-btn:hover { background: rgba(0,0,0,0.05); }
        :global(.dashboard-light-mode) .ios-tb-color-btn { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-editor-meta {
          border-bottom-color: rgba(0,0,0,0.07);
          color: rgba(28,28,30,0.45);
        }
        :global(.dashboard-light-mode) .ios-notes-editor-panel { background: #faf9f7; }
        :global(.dashboard-light-mode) .ios-notes-editor { color: #1c1c1e; }
        :global(.dashboard-light-mode) .ios-notes-editor:empty::before { color: rgba(28,28,30,0.3); }
        :global(.dashboard-light-mode) .ios-notes-editor-empty { color: rgba(28,28,30,0.44); }
        :global(.dashboard-light-mode .ios-notes-list-item:hover) { background: rgba(0,0,0,0.04); }
        :global(.dashboard-light-mode .ios-notes-list-item.selected) { background: rgba(38,194,129,0.12); }
        :global(.dashboard-light-mode .ios-note-title) { color: #1c1c1e; }
        :global(.dashboard-light-mode .ios-note-date),
        :global(.dashboard-light-mode .ios-note-preview) { color: rgba(28,28,30,0.45); }
        :global(.dashboard-light-mode .ios-note-client-badge) { background: rgba(38,194,129,0.15); }
        :global(.dashboard-light-mode .ios-notes-editor pre) { background: rgba(0,0,0,0.04); }
      `}</style>
    </div>
  )
}
