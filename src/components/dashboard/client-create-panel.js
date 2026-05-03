'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const initialForm = {
  name: '',
  companyName: '',
  ownerName: '',
  ownerEmail: '',
  cnpj: '',
  status: 'ONBOARDING',
}

export function ClientCreatePanel() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const response = await fetch('/api/platform/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const payload = await response.json()

    if (!response.ok) {
      setError(payload.error || 'Não foi possível criar o cliente.')
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
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '2.75rem',
          height: '2.75rem',
          border: 0,
          borderRadius: '0.85rem',
          background: 'var(--button-primary, var(--accent-blue))',
          color: '#fff',
        }}
        aria-label="Add client"
      >
        <span className="material-symbols-outlined">add</span>
      </button>

      {isOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(26,27,32,0.32)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: 'min(100%, 34rem)',
              borderRadius: '1.4rem',
              background: '#fff',
              padding: '1.5rem',
              boxShadow: '0 30px 80px rgba(26,27,32,0.16)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>New client</h3>
                <p style={{ color: '#767587', fontSize: '0.82rem', marginTop: '0.2rem' }}>Create a client directly in the new SaaS layer.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} style={{ border: 0, background: 'transparent', color: '#767587' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <Field label="Client name">
                <input value={form.name} onChange={(event) => updateField('name', event.target.value)} required style={inputStyle} />
              </Field>

              <Field label="Company">
                <input value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} required style={inputStyle} />
              </Field>

              <Field label="Owner">
                <input value={form.ownerName} onChange={(event) => updateField('ownerName', event.target.value)} required style={inputStyle} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <Field label="Owner email">
                  <input type="email" value={form.ownerEmail} onChange={(event) => updateField('ownerEmail', event.target.value)} style={inputStyle} />
                </Field>

                <Field label="CNPJ">
                  <input value={form.cnpj} onChange={(event) => updateField('cnpj', event.target.value)} style={inputStyle} />
                </Field>
              </div>

              <Field label="Status">
                <select value={form.status} onChange={(event) => updateField('status', event.target.value)} style={inputStyle}>
                  <option value="ONBOARDING">Onboarding</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="AT_RISK">At Risk</option>
                  <option value="CHURNED">Churned</option>
                </select>
              </Field>

              {error ? <p style={{ color: '#ba1a1a', fontSize: '0.8rem', fontWeight: 700 }}>{error}</p> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} style={secondaryButtonStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending} style={primaryButtonStyle}>
                  {isPending ? 'Saving...' : 'Create client'}
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

const primaryButtonStyle = {
  border: 0,
  borderRadius: '0.85rem',
  background: 'var(--button-primary, var(--accent-blue))',
  color: '#fff',
  padding: '0.8rem 1rem',
  fontSize: '0.8rem',
  fontWeight: 800,
}
