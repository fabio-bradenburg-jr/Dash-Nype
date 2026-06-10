'use client'

import { useState, useEffect, useCallback } from 'react'

function formatDateBR(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export default function ClientNotesPanel({ clientId, clientName }) {
  const [notes, setNotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [error, setError] = useState(null)

  const fetchNotes = useCallback(async () => {
    if (!clientId) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/notes`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao buscar notas.')
      setNotes(data.notes || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  async function handleCreate(event) {
    event.preventDefault()
    const content = newContent.trim()
    if (!content) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao criar nota.')
      setNewContent('')
      await fetchNotes()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  function startEdit(note) {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  async function handleEdit(noteId) {
    const content = editContent.trim()
    if (!content) return
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar nota.')
      setEditingId(null)
      setEditContent('')
      await fetchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(noteId) {
    if (!window.confirm('Tem certeza que deseja excluir esta nota?')) return
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/notes/${noteId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao excluir nota.')
      await fetchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="glass-panel client-notes-panel">
      <div className="client-notes-header">
        <div>
          <h3>Notas do cliente</h3>
          {clientName && <p>{clientName}</p>}
        </div>
      </div>

      <form className="client-notes-form" onSubmit={handleCreate}>
        <textarea
          className="client-notes-textarea"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Escreva uma nota sobre este cliente..."
          rows={3}
          disabled={isSaving}
        />
        <div className="client-notes-form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isSaving || !newContent.trim()}
          >
            {isSaving ? 'Salvando...' : 'Salvar nota'}
          </button>
        </div>
      </form>

      {error && (
        <div className="client-notes-error" role="alert">
          <i className="bx bx-error-circle"></i>
          <span>{error}</span>
        </div>
      )}

      <div className="client-notes-list">
        {isLoading ? (
          <div className="client-notes-state">
            <p>Carregando notas...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="client-notes-state">
            <p>Nenhuma nota para este cliente ainda.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="glass-item client-note-item">
              {editingId === note.id ? (
                <div className="client-note-edit">
                  <textarea
                    className="client-notes-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="client-note-edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleEdit(note.id)}
                      disabled={!editContent.trim()}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={cancelEdit}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="client-note-content">{note.content}</p>
                  <div className="client-note-meta">
                    <span className="client-note-author">
                      <i className="bx bx-user"></i>
                      {note.created_by_name || 'Usuário'}
                    </span>
                    <span className="client-note-date">
                      <i className="bx bx-time-five"></i>
                      {formatDateBR(note.created_at)}
                    </span>
                    <div className="client-note-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(note)}
                        aria-label="Editar nota"
                      >
                        <i className="bx bx-edit"></i>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm client-note-delete-btn"
                        onClick={() => handleDelete(note.id)}
                        aria-label="Excluir nota"
                      >
                        <i className="bx bx-trash"></i>
                        Excluir
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
