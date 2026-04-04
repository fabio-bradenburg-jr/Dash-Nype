'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function TaskManagePanel({ task }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    dueDate: toDateInputValue(task.dueDate),
  })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(payload) {
    setError('')

    const response = await fetch(`/api/platform/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(result.error || 'Não foi possível atualizar a tarefa.')
      return false
    }

    setIsOpen(false)
    startTransition(() => {
      router.refresh()
    })
    return true
  }

  async function handleSubmit(event) {
    event.preventDefault()
    await submit(form)
  }

  async function handleArchive() {
    await submit({ status: 'DONE' })
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} style={triggerStyle} aria-label={`Manage ${task.title}`}>
        <span className="material-symbols-outlined">edit_square</span>
      </button>

      {isOpen ? (
        <div style={overlayStyle}>
          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Manage task</h3>
                <p style={{ color: '#767587', fontSize: '0.82rem', marginTop: '0.2rem' }}>Adjust title, urgency, timeline, or complete this demand.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} style={iconButtonStyle}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <Field label="Task name">
                <input value={form.title} onChange={(event) => updateField('title', event.target.value)} required style={inputStyle} />
              </Field>

              <Field label="Description">
                <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.85rem' }}>
                <Field label="Priority">
                  <select value={form.priority} onChange={(event) => updateField('priority', event.target.value)} style={inputStyle}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </Field>

                <Field label="Status">
                  <select value={form.status} onChange={(event) => updateField('status', event.target.value)} style={inputStyle}>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="DONE">Done</option>
                  </select>
                </Field>

                <Field label="Deadline">
                  <input type="date" value={form.dueDate} onChange={(event) => updateField('dueDate', event.target.value)} style={inputStyle} />
                </Field>
              </div>

              {error ? <p style={{ color: '#ba1a1a', fontSize: '0.8rem', fontWeight: 700 }}>{error}</p> : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleArchive} disabled={isPending} style={archiveButtonStyle}>
                  {isPending ? 'Applying...' : 'Archive task'}
                </button>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" onClick={() => setIsOpen(false)} style={secondaryButtonStyle}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending} style={primaryButtonStyle}>
                    {isPending ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: '0.4rem' }}>
      <span style={{ color: '#464555', fontSize: '0.78rem', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  )
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  background: 'rgba(26,27,32,0.32)',
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
}

const panelStyle = {
  width: 'min(100%, 38rem)',
  borderRadius: '1.4rem',
  background: '#fff',
  padding: '1.5rem',
  boxShadow: '0 30px 80px rgba(26,27,32,0.16)',
}

const inputStyle = {
  width: '100%',
  border: '1px solid rgba(199,196,216,0.65)',
  borderRadius: '0.9rem',
  background: '#fff',
  color: '#1a1b20',
  padding: '0.9rem 1rem',
  fontSize: '0.92rem',
}

const triggerStyle = {
  border: 0,
  background: 'transparent',
  color: '#767587',
  display: 'grid',
  placeItems: 'center',
}

const iconButtonStyle = {
  border: 0,
  background: 'transparent',
  color: '#767587',
}

const secondaryButtonStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: '#eeedf4',
  color: '#464555',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}

const primaryButtonStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: '#4744e5',
  color: '#fff',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}

const archiveButtonStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: '#ffdad6',
  color: '#93000a',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}
