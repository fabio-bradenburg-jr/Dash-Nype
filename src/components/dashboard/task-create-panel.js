'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const initialForm = {
  title: '',
  description: '',
  clientId: '',
  teamMemberId: '',
  priority: 'MEDIUM',
  status: 'OPEN',
  dueDate: '',
  estimatedHours: '',
}

export function TaskCreatePanel() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [clients, setClients] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true

    async function loadOptions() {
      setError('')
      const response = await fetch('/api/platform/tasks', { cache: 'no-store' })
      const payload = await response.json()

      if (!response.ok) {
        if (isMounted) setError(payload.error || 'Não foi possível carregar clientes e time.')
        return
      }

      if (!isMounted) return
      setClients(payload.clients ?? [])
      setTeamMembers(payload.teamMembers ?? [])
    }

    loadOptions()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const response = await fetch('/api/platform/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const payload = await response.json()

    if (!response.ok) {
      setError(payload.error || 'Não foi possível criar a tarefa.')
      return
    }

    setForm(initialForm)
    setIsOpen(false)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} style={primaryButtonStyle}>
        Add New Task
      </button>

      {isOpen ? (
        <div style={overlayStyle}>
          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>New task</h3>
                <p style={{ color: '#767587', fontSize: '0.82rem', marginTop: '0.2rem' }}>Create and assign work directly in the operational dashboard.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} style={{ border: 0, background: 'transparent', color: '#767587' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <Field label="Client">
                  <select value={form.clientId} onChange={(event) => updateField('clientId', event.target.value)} style={inputStyle}>
                    <option value="">Internal Ops</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Owner">
                  <select value={form.teamMemberId} onChange={(event) => updateField('teamMemberId', event.target.value)} style={inputStyle}>
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

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

                <Field label="Estimated hours">
                  <input type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(event) => updateField('estimatedHours', event.target.value)} style={inputStyle} />
                </Field>
              </div>

              <Field label="Deadline">
                <input type="date" value={form.dueDate} onChange={(event) => updateField('dueDate', event.target.value)} style={inputStyle} />
              </Field>

              {error ? <p style={{ color: '#ba1a1a', fontSize: '0.8rem', fontWeight: 700 }}>{error}</p> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} style={secondaryButtonStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending} style={primarySubmitStyle}>
                  {isPending ? 'Saving...' : 'Create task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
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
  width: 'min(100%, 42rem)',
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

const secondaryButtonStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: '#eeedf4',
  color: '#464555',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}

const primarySubmitStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: 'var(--button-primary, var(--accent-blue))',
  color: '#fff',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}

const primaryButtonStyle = {
  border: 0,
  borderRadius: '0.9rem',
  background: 'linear-gradient(135deg, var(--button-primary, var(--accent-blue)), var(--button-primary-hover, color-mix(in srgb, var(--accent-blue) 78%, #0f172a 22%)))',
  color: '#fff',
  padding: '0.8rem 1.2rem',
  fontSize: '0.78rem',
  fontWeight: 800,
  boxShadow: '0 16px 30px rgba(var(--accent-rgb), 0.18)',
}
