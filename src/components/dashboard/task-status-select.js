'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function TaskStatusSelect({ taskId, value }) {
  const router = useRouter()
  const [status, setStatus] = useState(value)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleChange(event) {
    const nextStatus = event.target.value
    setStatus(nextStatus)
    setError('')

    const response = await fetch(`/api/platform/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setStatus(value)
      setError(payload.error || 'Não foi possível atualizar a tarefa.')
      return
    }

    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <label style={{ display: 'grid', gap: '0.3rem', justifyItems: 'end' }}>
      <select value={status} onChange={handleChange} disabled={isPending} style={statusSelectStyle}>
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="BLOCKED">Blocked</option>
        <option value="DONE">Done</option>
      </select>
      {error ? <span style={{ color: '#ba1a1a', fontSize: '0.65rem', fontWeight: 700 }}>{error}</span> : null}
    </label>
  )
}

const statusSelectStyle = {
  border: '1px solid rgba(199,196,216,0.42)',
  borderRadius: '0.75rem',
  background: '#fff',
  color: '#464555',
  padding: '0.55rem 0.75rem',
  fontSize: '0.75rem',
  fontWeight: 700,
}
