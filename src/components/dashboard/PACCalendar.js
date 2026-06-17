'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const STATUS_META = {
  agendado:  { label: 'Agendado',  color: '#3b82f6', bg: 'rgba(59,130,246,0.13)',  icon: 'bx-calendar-check' },
  realizado: { label: 'Realizado', color: '#22c55e', bg: 'rgba(34,197,94,0.13)',    icon: 'bx-check-circle' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.13)',   icon: 'bx-x-circle' },
}

const PRESET_COLORS = ['#6366f1','#3b82f6','#e53935','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4']

const TYPE_ICONS = [
  { value: 'bx-book-open',    label: 'Livro' },
  { value: 'bx-video',        label: 'Vídeo' },
  { value: 'bx-headphone',    label: 'Áudio' },
  { value: 'bx-slideshow',    label: 'Apresentação' },
  { value: 'bx-group',        label: 'Grupo' },
  { value: 'bx-certification',label: 'Certificação' },
  { value: 'bx-desktop',      label: 'Desktop' },
  { value: 'bx-laptop',       label: 'Online' },
]

const EMPTY_TRAINING_FORM = {
  title: '', description: '', client_id: '', training_type_id: '',
  scheduled_at: '', duration_minutes: 60, status: 'agendado', platform: '', link: '',
  attendee_emails: '',
}

const EMPTY_TYPE_FORM = {
  name: '', description: '', color: '#6366f1', icon: 'bx-book-open',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const t = new Date()
  return d.toDateString() === t.toDateString()
}

function isThisWeek(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay())
  start.setHours(0,0,0,0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return d >= start && d < end
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.agendado
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color: meta.color, background: meta.bg, whiteSpace: 'nowrap',
    }}>
      <i className={`bx ${meta.icon}`} style={{ fontSize: 12 }}></i>
      {meta.label}
    </span>
  )
}

function TypeBadge({ type }) {
  if (!type) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
      color: type.color || '#6366f1',
      background: (type.color || '#6366f1') + '22',
      whiteSpace: 'nowrap',
    }}>
      {type.icon && <i className={`bx ${type.icon}`} style={{ fontSize: 12 }}></i>}
      {type.name}
    </span>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{
        width: 32, height: 32, border: '3px solid var(--lumina-dark-border, rgba(255,255,255,0.1))',
        borderTopColor: 'var(--button-primary, #6366f1)', borderRadius: '50%',
        animation: 'pac-spin 0.7s linear infinite',
      }} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PACCalendar({ clients = [], isLightMode = false, defaultView = 'dash' }) {
  const today = new Date()
  const [view, setView] = useState(defaultView)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  // Data
  const [trainings, setTrainings] = useState([])
  const [trainingTypes, setTrainingTypes] = useState([])
  const [loadingTrainings, setLoadingTrainings] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)

  // Training modal
  const [trainingModal, setTrainingModal] = useState(false) // false | 'new' | training-obj
  const [trainingForm, setTrainingForm] = useState(EMPTY_TRAINING_FORM)
  const [savingTraining, setSavingTraining] = useState(false)
  const [deletingTraining, setDeletingTraining] = useState(false)
  const [trainingFeedback, setTrainingFeedback] = useState('')

  // Detail panel
  const [detailTraining, setDetailTraining] = useState(null)
  const [notes, setNotes] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editNoteId, setEditNoteId] = useState(null)
  const [editNoteContent, setEditNoteContent] = useState('')

  // Type modal
  const [typeModal, setTypeModal] = useState(false) // false | 'new' | type-obj
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM)
  const [savingType, setSavingType] = useState(false)
  const [typeFeedback, setTypeFeedback] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTrainings = useCallback(async (opts = {}) => {
    setLoadingTrainings(true)
    try {
      const qs = new URLSearchParams()
      if (view === 'calendario' || opts.month != null) {
        const m = String((opts.month ?? month) + 1).padStart(2, '0')
        const y = opts.year ?? year
        qs.set('month', `${y}-${m}`)
      }
      const res = await fetch(`/api/pac/trainings?${qs}`)
      const json = await res.json()
      setTrainings(json.trainings || [])
      if (json.gcalConnected !== undefined) setGcalConnected(Boolean(json.gcalConnected))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTrainings(false)
    }
  }, [view, month, year])

  const fetchTypes = useCallback(async () => {
    setLoadingTypes(true)
    try {
      const res = await fetch('/api/pac/training-types')
      const json = await res.json()
      setTrainingTypes(json.trainingTypes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTypes(false)
    }
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])
  useEffect(() => { fetchTrainings() }, [view, month, year]) // eslint-disable-line

  const fetchNotes = useCallback(async (trainingId) => {
    setLoadingNotes(true)
    try {
      const res = await fetch(`/api/pac/trainings/${trainingId}/notes`)
      const json = await res.json()
      setNotes(json.notes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingNotes(false)
    }
  }, [])

  // ── Calendar nav ───────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // ── Training CRUD ──────────────────────────────────────────────────────────

  function openNewTraining(prefill = {}) {
    setTrainingForm({ ...EMPTY_TRAINING_FORM, ...prefill })
    setTrainingFeedback('')
    setTrainingModal('new')
  }

  function openEditTraining(t) {
    setTrainingForm({
      title: t.title || '',
      description: t.description || '',
      client_id: t.client_id || '',
      training_type_id: t.training_type_id || '',
      scheduled_at: toDatetimeLocal(t.scheduled_at),
      duration_minutes: t.duration_minutes || 60,
      status: t.status || 'agendado',
      platform: t.platform || '',
      link: t.link || '',
    })
    setTrainingFeedback('')
    setTrainingModal(t)
  }

  async function saveTraining() {
    if (!trainingForm.title.trim()) {
      setTrainingFeedback('Título é obrigatório.')
      return
    }
    setSavingTraining(true)
    setTrainingFeedback('')
    try {
      const body = {
        ...trainingForm,
        scheduled_at: trainingForm.scheduled_at ? new Date(trainingForm.scheduled_at).toISOString() : null,
        duration_minutes: Number(trainingForm.duration_minutes) || 60,
        client_id: trainingForm.client_id || null,
        training_type_id: trainingForm.training_type_id || null,
        platform: trainingForm.platform || null,
        link: trainingForm.link || null,
        description: trainingForm.description || null,
      }
      const isEdit = trainingModal && trainingModal !== 'new'
      const url = isEdit ? `/api/pac/trainings/${trainingModal.id}` : '/api/pac/trainings'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar.')
      setTrainingModal(false)
      fetchTrainings()
      if (detailTraining?.id === trainingModal?.id) setDetailTraining(json.training)
    } catch (e) {
      setTrainingFeedback(e.message)
    } finally {
      setSavingTraining(false)
    }
  }

  async function deleteTraining(t) {
    if (!confirm(`Excluir treinamento "${t.title}"?`)) return
    setDeletingTraining(true)
    try {
      await fetch(`/api/pac/trainings/${t.id}`, { method: 'DELETE' })
      setTrainings(prev => prev.filter(x => x.id !== t.id))
      if (detailTraining?.id === t.id) setDetailTraining(null)
      setTrainingModal(false)
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingTraining(false)
    }
  }

  async function quickStatus(t, status) {
    try {
      const res = await fetch(`/api/pac/trainings/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (res.ok) {
        setTrainings(prev => prev.map(x => x.id === t.id ? json.training : x))
        if (detailTraining?.id === t.id) setDetailTraining(json.training)
      }
    } catch (e) { console.error(e) }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async function addNote() {
    if (!noteInput.trim() || !detailTraining) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/pac/trainings/${detailTraining.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteInput.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        setNotes(prev => [...prev, json.note])
        setNoteInput('')
      }
    } catch (e) { console.error(e) } finally { setSavingNote(false) }
  }

  async function updateNote(noteId) {
    if (!editNoteContent.trim()) return
    try {
      const res = await fetch(`/api/pac/trainings/${detailTraining.id}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editNoteContent.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        setNotes(prev => prev.map(n => n.id === noteId ? json.note : n))
        setEditNoteId(null)
        setEditNoteContent('')
      }
    } catch (e) { console.error(e) }
  }

  async function deleteNote(noteId) {
    if (!confirm('Excluir nota?')) return
    try {
      await fetch(`/api/pac/trainings/${detailTraining.id}/notes/${noteId}`, { method: 'DELETE' })
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch (e) { console.error(e) }
  }

  // ── Types CRUD ─────────────────────────────────────────────────────────────

  function openNewType() {
    setTypeForm(EMPTY_TYPE_FORM)
    setTypeFeedback('')
    setTypeModal('new')
  }

  function openEditType(t) {
    setTypeForm({ name: t.name, description: t.description || '', color: t.color || '#6366f1', icon: t.icon || 'bx-book-open' })
    setTypeFeedback('')
    setTypeModal(t)
  }

  async function saveType() {
    if (!typeForm.name.trim()) {
      setTypeFeedback('Nome é obrigatório.')
      return
    }
    setSavingType(true)
    setTypeFeedback('')
    try {
      const isEdit = typeModal && typeModal !== 'new'
      const url = isEdit ? `/api/pac/training-types/${typeModal.id}` : '/api/pac/training-types'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeForm) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar.')
      setTypeModal(false)
      fetchTypes()
    } catch (e) {
      setTypeFeedback(e.message)
    } finally {
      setSavingType(false)
    }
  }

  async function deleteType(t) {
    if (!confirm(`Excluir tipo "${t.name}"?`)) return
    try {
      await fetch(`/api/pac/training-types/${t.id}`, { method: 'DELETE' })
      setTrainingTypes(prev => prev.filter(x => x.id !== t.id))
    } catch (e) { console.error(e) }
  }

  // ── Detail panel open ──────────────────────────────────────────────────────

  function openDetail(t) {
    setDetailTraining(t)
    setNotes([])
    setNoteInput('')
    setEditNoteId(null)
    fetchNotes(t.id)
  }

  // ── Dashboard computations ─────────────────────────────────────────────────

  const todayTrainings = trainings.filter(t => isToday(t.scheduled_at))
  const weekTrainings  = trainings.filter(t => isThisWeek(t.scheduled_at))
  const upcoming = trainings
    .filter(t => t.status === 'agendado' && t.scheduled_at && new Date(t.scheduled_at) > today)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 10)
  const completedCount = trainings.filter(t => t.status === 'realizado').length

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const calendarCells = buildCalendarGrid(year, month)

  function trainingsForDay(day) {
    if (!day) return []
    return trainings.filter(t => {
      if (!t.scheduled_at) return false
      const d = new Date(t.scheduled_at)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabStyle = (v) => ({
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
    background: view === v ? 'var(--button-primary, #6366f1)' : 'transparent',
    color: view === v ? '#fff' : 'var(--text-secondary, rgba(255,255,255,0.6))',
  })

  return (
    <div className="pac-shell" style={{ minHeight: 400 }}>
      <style>{`
        @keyframes pac-spin { to { transform: rotate(360deg); } }
        @keyframes pac-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .pac-shell { font-family: inherit; }
        .pac-hero-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 22px 24px;
          border-radius: 20px;
          border: 1px solid rgba(var(--accent-rgb, 229,57,53), 0.18);
          background:
            radial-gradient(ellipse 100% 55% at 15% -10%, rgba(var(--accent-rgb, 229,57,53), 0.11) 0%, transparent 60%),
            linear-gradient(145deg, rgba(13,12,12,0.97), rgba(7,6,6,0.93));
          box-shadow: 0 16px 48px rgba(0,0,0,0.28), 0 0 0 1px rgba(var(--accent-rgb, 229,57,53), 0.05);
          position: relative;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .pac-hero-header::after {
          content: '';
          position: absolute;
          top: -60px; right: -60px;
          width: 200px; height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(var(--accent-rgb, 229,57,53), 0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .pac-hero-kicker {
          display: inline-flex;
          align-items: center;
          font-size: 0.62rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--saas-primary, #e53935);
          opacity: 0.9;
          margin-bottom: 2px;
        }
        .pac-card {
          background: linear-gradient(160deg, rgba(var(--accent-rgb, 229,57,53), 0.03) 0%, transparent 60%), var(--bg-panel, rgba(255,255,255,0.04));
          border: 1px solid rgba(var(--accent-rgb, 229,57,53), 0.10);
          border-radius: 14px; padding: 20px;
          animation: pac-fadein 0.2s ease;
        }
        .pac-training-row {
          display: flex; align-items: center; gap: 10; padding: 12px 16px;
          border-radius: 10px; transition: background 0.15s; cursor: pointer;
          border-bottom: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.06));
        }
        .pac-training-row:last-child { border-bottom: none; }
        .pac-training-row:hover { background: rgba(255,255,255,0.04); }
        .pac-action-btn {
          padding: 5px 10px; border-radius: 7px; border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.1));
          background: transparent; cursor: pointer; font-size: 12px; font-weight: 500;
          color: var(--text-secondary, rgba(255,255,255,0.7)); transition: all 0.15s;
          display: inline-flex; align-items: center; gap: 4;
        }
        .pac-action-btn:hover { background: rgba(255,255,255,0.07); }
        .pac-action-btn.danger:hover { background: rgba(239,68,68,0.12); color: #ef4444; border-color: #ef4444; }
        .pac-day-cell {
          min-height: 80px; padding: 6px; border-radius: 8px;
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.06));
          background: var(--card-bg, rgba(255,255,255,0.02));
          cursor: pointer; transition: background 0.15s; overflow: hidden;
        }
        .pac-day-cell:hover { background: rgba(255,255,255,0.05); }
        .pac-day-cell.today { border-color: var(--saas-primary, #e53935); background: rgba(var(--accent-rgb, 229,57,53), 0.07); }
        .pac-day-cell.empty { background: transparent; border-color: transparent; cursor: default; }
        .pac-training-dot {
          display: flex; align-items: center; gap: 4; padding: 2px 5px; border-radius: 5px;
          font-size: 10px; font-weight: 600; margin-bottom: 2px; cursor: pointer;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pac-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          backdrop-filter: blur(4px);
          animation: pac-fadein 0.15s ease;
        }
        .pac-modal {
          background: var(--sidebar-bg, #1a1b2e);
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.1));
          border-radius: 16px; padding: 28px; width: 100%; max-width: 520px;
          max-height: 88vh; overflow-y: auto;
          animation: pac-fadein 0.15s ease;
        }
        .pac-modal-wide { max-width: 680px; }
        .pac-modal h3 { margin: 0 0 20px; font-size: 17px; font-weight: 700; }
        .pac-form-group { margin-bottom: 14px; }
        .pac-form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; opacity: 0.7; }
        .pac-form-group input, .pac-form-group select, .pac-form-group textarea {
          width: 100%; padding: 9px 12px; border-radius: 8px; font-size: 13px;
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.1));
          background: rgba(255,255,255,0.05); color: inherit; outline: none; box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .pac-form-group input:focus, .pac-form-group select:focus, .pac-form-group textarea:focus {
          border-color: var(--button-primary, #6366f1);
        }
        .pac-form-group textarea { resize: vertical; min-height: 70px; }
        .pac-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pac-btn-primary {
          padding: 9px 20px; border-radius: 9px; border: none; cursor: pointer;
          background: var(--button-primary, #6366f1); color: #fff; font-size: 13px; font-weight: 600;
          transition: opacity 0.15s;
        }
        .pac-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .pac-btn-ghost {
          padding: 9px 16px; border-radius: 9px;
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.12));
          background: transparent; color: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: background 0.15s;
        }
        .pac-btn-ghost:hover { background: rgba(255,255,255,0.05); }
        .pac-detail-panel {
          position: fixed; right: 0; top: 0; bottom: 0; width: 420px;
          background: var(--sidebar-bg, #1a1b2e);
          border-left: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.1));
          z-index: 900; overflow-y: auto; padding: 24px;
          animation: pac-fadein 0.15s ease;
          box-shadow: -8px 0 32px rgba(0,0,0,0.3);
        }
        @media (max-width: 640px) {
          .pac-detail-panel { width: 100%; }
          .pac-form-row { grid-template-columns: 1fr; }
        }
        .pac-note-item {
          padding: 10px 12px; border-radius: 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.06));
          margin-bottom: 8px;
        }
        .pac-empty {
          text-align: center; padding: 40px 20px;
          color: var(--text-secondary, rgba(255,255,255,0.4));
          font-size: 14px;
        }
        .pac-empty i { font-size: 36px; display: block; margin-bottom: 8px; opacity: 0.4; }
        .pac-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        @media (max-width: 700px) { .pac-summary-grid { grid-template-columns: repeat(2, 1fr); } }
        .pac-summary-card {
          padding: 18px; border-radius: 12px; text-align: center;
          background:
            radial-gradient(ellipse 140% 65% at 50% -10%, rgba(var(--accent-rgb, 229,57,53), 0.10) 0%, transparent 65%),
            rgba(255,255,255,0.03);
          border: 1px solid rgba(var(--accent-rgb, 229,57,53), 0.14);
          transition: border-color 0.2s;
        }
        .pac-summary-card:hover { border-color: rgba(var(--accent-rgb, 229,57,53), 0.26); }
        .pac-summary-card .num { font-size: 28px; font-weight: 800; }
        .pac-summary-card .lbl { font-size: 11px; font-weight: 600; opacity: 0.55; margin-top: 2px; }
        .pac-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .pac-cal-header { text-align: center; font-size: 11px; font-weight: 700; opacity: 0.45; padding: 6px 0; }
        .pac-types-list { display: flex; flex-direction: column; gap: 8px; }
        .pac-type-row {
          display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-radius: 10px; background: var(--card-bg, rgba(255,255,255,0.04));
          border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.08));
        }
        .pac-color-swatch {
          width: 14px; height: 14px; border-radius: 50%; cursor: pointer;
          border: 2px solid transparent; transition: transform 0.15s;
          flex-shrink: 0;
        }
        .pac-color-swatch.selected { border-color: rgba(255,255,255,0.8); transform: scale(1.25); }
        .pac-icon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .pac-icon-option {
          padding: 8px; border-radius: 7px; border: 1px solid var(--lumina-dark-border, rgba(255,255,255,0.08));
          background: transparent; cursor: pointer; text-align: center; transition: all 0.15s;
          color: inherit; font-size: 11px;
        }
        .pac-icon-option.selected { background: var(--button-primary, #6366f1); border-color: transparent; color: #fff; }
        .pac-icon-option i { font-size: 18px; display: block; margin-bottom: 2px; }
        .pac-feedback { font-size: 12px; color: #ef4444; margin-top: 8px; }
      `}</style>

      {/* Top header */}
      <div className="pac-hero-header">
        <div>
          <span className="pac-hero-kicker"><i className="bx bx-dumbbell" style={{ marginRight: 4 }}></i>PAC</span>
          <h2 style={{ margin: '4px 0 0', fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            {view === 'dash' ? 'Painel de Treinamentos' : view === 'calendario' ? 'Calendário de Treinamentos' : 'Tipos de Treinamento'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.55 }}>
            {view === 'dash' ? 'Visão geral dos treinamentos agendados e realizados.'
              : view === 'calendario' ? 'Calendário mensal de treinamentos por cliente.'
              : 'Gerencie as categorias de treinamento do workspace.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {view !== 'tipos' && (
            <button className="pac-btn-primary" onClick={() => openNewTraining()}>
              <i className="bx bx-plus" style={{ marginRight: 4 }}></i>
              Novo treinamento
            </button>
          )}
          {view === 'tipos' && (
            <button className="pac-btn-primary" onClick={openNewType}>
              <i className="bx bx-plus" style={{ marginRight: 4 }}></i>
              Novo tipo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[
          { v: 'dash',       icon: 'bx-bar-chart-alt-2', label: 'Painel' },
          { v: 'calendario', icon: 'bx-calendar-alt',    label: 'Calendário' },
          { v: 'tipos',      icon: 'bx-category',        label: 'Tipos' },
        ].map(({ v, icon, label }) => (
          <button key={v} style={tabStyle(v)} onClick={() => setView(v)}>
            <i className={`bx ${icon}`} style={{ marginRight: 5 }}></i>
            {label}
          </button>
        ))}
      </div>

      {/* ── DASH VIEW ── */}
      {view === 'dash' && (
        <div>
          {/* Summary cards */}
          <div className="pac-summary-grid">
            {[
              { num: todayTrainings.length,  lbl: 'Hoje',      color: 'var(--saas-primary, #e53935)', icon: 'bx-calendar-event' },
              { num: weekTrainings.length,   lbl: 'Esta semana', color: 'var(--saas-primary, #e53935)', icon: 'bx-calendar-week' },
              { num: upcoming.length,        lbl: 'Agendados',  color: '#f59e0b', icon: 'bx-time-five' },
              { num: completedCount,         lbl: 'Realizados', color: '#22c55e', icon: 'bx-check-circle' },
            ].map(({ num, lbl, color, icon }) => (
              <div key={lbl} className="pac-summary-card">
                <i className={`bx ${icon}`} style={{ fontSize: 22, color, marginBottom: 6 }}></i>
                <div className="num" style={{ color }}>{num}</div>
                <div className="lbl">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Today's trainings */}
          <div className="pac-card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, opacity: 0.9 }}>
              <i className="bx bx-calendar-event" style={{ marginRight: 6, color: '#6366f1' }}></i>
              Treinamentos de Hoje
            </h3>
            {loadingTrainings ? <Spinner /> : todayTrainings.length === 0 ? (
              <div className="pac-empty">
                <i className="bx bx-calendar-x"></i>
                Nenhum treinamento hoje
              </div>
            ) : todayTrainings.map(t => (
              <TrainingRow key={t.id} training={t} onOpen={() => openDetail(t)} onEdit={() => openEditTraining(t)}
                onDelete={() => deleteTraining(t)} onQuickStatus={quickStatus} />
            ))}
          </div>

          {/* Upcoming */}
          <div className="pac-card">
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, opacity: 0.9 }}>
              <i className="bx bx-time-five" style={{ marginRight: 6, color: '#f59e0b' }}></i>
              Próximos Treinamentos
            </h3>
            {loadingTrainings ? <Spinner /> : upcoming.length === 0 ? (
              <div className="pac-empty">
                <i className="bx bx-calendar-check"></i>
                Nenhum treinamento agendado
              </div>
            ) : upcoming.map(t => (
              <TrainingRow key={t.id} training={t} onOpen={() => openDetail(t)} onEdit={() => openEditTraining(t)}
                onDelete={() => deleteTraining(t)} onQuickStatus={quickStatus} />
            ))}
          </div>
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendario' && (
        <div>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button className="pac-action-btn" onClick={prevMonth}><i className="bx bx-chevron-left"></i></button>
            <span style={{ fontSize: 16, fontWeight: 700, minWidth: 160, textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </span>
            <button className="pac-action-btn" onClick={nextMonth}><i className="bx bx-chevron-right"></i></button>
          </div>

          {/* Day headers */}
          <div className="pac-cal-grid" style={{ marginBottom: 4 }}>
            {WEEKDAYS.map(d => (
              <div key={d} className="pac-cal-header">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {loadingTrainings ? <Spinner /> : (
            <div className="pac-cal-grid">
              {calendarCells.map((day, i) => {
                const dayTrainings = trainingsForDay(day)
                const isT = day && new Date(year, month, day).toDateString() === today.toDateString()
                return (
                  <div
                    key={i}
                    className={`pac-day-cell${!day ? ' empty' : ''}${isT ? ' today' : ''}`}
                    onClick={!day ? undefined : () => openNewTraining({ scheduled_at: toDatetimeLocal(new Date(year, month, day, 9, 0).toISOString()) })}
                  >
                    {day && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: isT ? 800 : 500, opacity: isT ? 1 : 0.6, marginBottom: 3 }}>
                          {day}
                        </div>
                        {dayTrainings.slice(0, 3).map(t => {
                          const meta = STATUS_META[t.status] || STATUS_META.agendado
                          return (
                            <div
                              key={t.id}
                              className="pac-training-dot"
                              style={{ background: meta.bg, color: meta.color }}
                              onClick={e => { e.stopPropagation(); openDetail(t) }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {formatTime(t.scheduled_at)} {t.client?.name || t.title}
                              </span>
                            </div>
                          )
                        })}
                        {dayTrainings.length > 3 && (
                          <div style={{ fontSize: 10, opacity: 0.5, paddingLeft: 4 }}>+{dayTrainings.length - 3} mais</div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TIPOS VIEW ── */}
      {view === 'tipos' && (
        <div>
          {loadingTypes ? <Spinner /> : trainingTypes.length === 0 ? (
            <div className="pac-card">
              <div className="pac-empty">
                <i className="bx bx-category"></i>
                Nenhum tipo de treinamento cadastrado.<br />
                Crie o primeiro tipo para organizar os treinamentos.
              </div>
            </div>
          ) : (
            <div className="pac-types-list">
              {trainingTypes.map(t => (
                <div key={t.id} className="pac-type-row">
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: (t.color || '#6366f1') + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`bx ${t.icon || 'bx-book-open'}`} style={{ fontSize: 18, color: t.color || '#6366f1' }}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 12, opacity: 0.55, marginTop: 1 }}>{t.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="pac-action-btn" onClick={() => openEditType(t)}>
                      <i className="bx bx-edit"></i>
                    </button>
                    <button className="pac-action-btn danger" onClick={() => deleteType(t)}>
                      <i className="bx bx-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL PANEL ── */}
      {detailTraining && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 890 }} onClick={() => setDetailTraining(null)} />
          <div className="pac-detail-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{detailTraining.title}</h3>
                {detailTraining.client && (
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    <i className="bx bx-user" style={{ marginRight: 4 }}></i>
                    {detailTraining.client.name}
                  </div>
                )}
              </div>
              <button className="pac-action-btn" onClick={() => setDetailTraining(null)} style={{ flexShrink: 0 }}>
                <i className="bx bx-x" style={{ fontSize: 16 }}></i>
              </button>
            </div>

            {/* Status + type */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatusBadge status={detailTraining.status} />
              {detailTraining.training_type && <TypeBadge type={detailTraining.training_type} />}
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { icon: 'bx-calendar', label: 'Data/hora', value: formatDateTime(detailTraining.scheduled_at) },
                { icon: 'bx-time-five', label: 'Duração', value: detailTraining.duration_minutes ? `${detailTraining.duration_minutes} min` : '—' },
                { icon: 'bx-desktop', label: 'Plataforma', value: detailTraining.platform || '—' },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    <i className={`bx ${icon}`} style={{ marginRight: 4, opacity: 0.6 }}></i>
                    {value}
                  </div>
                </div>
              ))}
              {detailTraining.meet_link && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(229,57,53,0.07)', border: '1px solid rgba(229,57,53,0.22)', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 10, color: '#e53935', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="bx bx-video" style={{ fontSize: 13 }}></i> Google Meet
                  </div>
                  <a href={detailTraining.meet_link} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: '#e53935', wordBreak: 'break-all', fontWeight: 600 }}>
                    {detailTraining.meet_link}
                  </a>
                </div>
              )}
              {detailTraining.link && !detailTraining.meet_link && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 600, marginBottom: 3 }}>Link</div>
                  <a href={detailTraining.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--button-primary, #6366f1)', wordBreak: 'break-all' }}>
                    {detailTraining.link}
                  </a>
                </div>
              )}
            </div>

            {detailTraining.description && (
              <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 600, marginBottom: 4 }}>Descrição</div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{detailTraining.description}</p>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              <button className="pac-action-btn" onClick={() => openEditTraining(detailTraining)}>
                <i className="bx bx-edit"></i> Editar
              </button>
              {detailTraining.status !== 'realizado' && (
                <button className="pac-action-btn" onClick={() => quickStatus(detailTraining, 'realizado')}
                  style={{ color: '#e53935', borderColor: '#e53935' }}>
                  <i className="bx bx-check-circle"></i> Realizado
                </button>
              )}
              {detailTraining.status !== 'cancelado' && (
                <button className="pac-action-btn" onClick={() => quickStatus(detailTraining, 'cancelado')}
                  style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
                  <i className="bx bx-x-circle"></i> Cancelar
                </button>
              )}
              <button className="pac-action-btn danger" onClick={() => deleteTraining(detailTraining)}>
                <i className="bx bx-trash"></i>
              </button>
            </div>

            {/* Notes */}
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>
                <i className="bx bx-note" style={{ marginRight: 6 }}></i>
                Notas
              </h4>
              {loadingNotes ? <Spinner /> : notes.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.45, marginBottom: 10 }}>Nenhuma nota ainda.</div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  {notes.map(n => (
                    <div key={n.id} className="pac-note-item">
                      {editNoteId === n.id ? (
                        <div>
                          <textarea
                            value={editNoteContent}
                            onChange={e => setEditNoteContent(e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'inherit', fontSize: 12, resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button className="pac-btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => updateNote(n.id)}>Salvar</button>
                            <button className="pac-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditNoteId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, flex: 1 }}>{n.content}</p>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button className="pac-action-btn" style={{ padding: '3px 7px' }}
                              onClick={() => { setEditNoteId(n.id); setEditNoteContent(n.content) }}>
                              <i className="bx bx-edit" style={{ fontSize: 12 }}></i>
                            </button>
                            <button className="pac-action-btn danger" style={{ padding: '3px 7px' }} onClick={() => deleteNote(n.id)}>
                              <i className="bx bx-trash" style={{ fontSize: 12 }}></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add note */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Adicionar nota..."
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'inherit', fontSize: 12 }}
                />
                <button className="pac-btn-primary" style={{ padding: '8px 12px', flexShrink: 0 }} onClick={addNote} disabled={savingNote || !noteInput.trim()}>
                  <i className="bx bx-send"></i>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── TRAINING MODAL ── */}
      {trainingModal && (
        <div className="pac-overlay" onClick={e => e.target === e.currentTarget && setTrainingModal(false)}>
          <div className="pac-modal">
            <h3>
              <i className={`bx bx-${trainingModal === 'new' ? 'plus-circle' : 'edit'}`} style={{ marginRight: 8, color: 'var(--button-primary, #6366f1)' }}></i>
              {trainingModal === 'new' ? 'Novo Treinamento' : 'Editar Treinamento'}
            </h3>

            <div className="pac-form-group">
              <label>Título *</label>
              <input type="text" value={trainingForm.title} onChange={e => setTrainingForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Treinamento de Integração" autoFocus />
            </div>

            <div className="pac-form-row">
              <div className="pac-form-group">
                <label>Cliente</label>
                <select value={trainingForm.client_id} onChange={e => setTrainingForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">Sem cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="pac-form-group">
                <label>Tipo de treinamento</label>
                <select value={trainingForm.training_type_id} onChange={e => setTrainingForm(f => ({ ...f, training_type_id: e.target.value }))}>
                  <option value="">Sem tipo</option>
                  {trainingTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="pac-form-row">
              <div className="pac-form-group">
                <label>Data e hora</label>
                <input type="datetime-local" value={trainingForm.scheduled_at} onChange={e => setTrainingForm(f => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
              <div className="pac-form-group">
                <label>Duração (minutos)</label>
                <input type="number" min="1" value={trainingForm.duration_minutes} onChange={e => setTrainingForm(f => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
            </div>

            <div className="pac-form-row">
              <div className="pac-form-group">
                <label>Plataforma</label>
                <input type="text" value={trainingForm.platform} onChange={e => setTrainingForm(f => ({ ...f, platform: e.target.value }))} placeholder="Ex: Google Meet" />
              </div>
              <div className="pac-form-group">
                <label>Status</label>
                <select value={trainingForm.status} onChange={e => setTrainingForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="agendado">Agendado</option>
                  <option value="realizado">Realizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>

            <div className="pac-form-group">
              <label>Link</label>
              <input type="url" value={trainingForm.link} onChange={e => setTrainingForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." />
            </div>

            <div className="pac-form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Participantes (e-mails)
                {gcalConnected && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#e53935', background: 'rgba(229,57,53,0.12)', borderRadius: 99, padding: '1px 7px' }}>
                    <i className="bx bx-calendar-check" style={{ marginRight: 3 }}></i>Google Meet será gerado
                  </span>
                )}
              </label>
              <textarea
                value={trainingForm.attendee_emails}
                onChange={e => setTrainingForm(f => ({ ...f, attendee_emails: e.target.value }))}
                placeholder="email1@exemplo.com, email2@exemplo.com"
                rows={2}
                style={{ resize: 'vertical' }}
              />
              {gcalConnected && (
                <small style={{ color: 'rgba(241,241,241,0.45)', fontSize: 11, marginTop: 4, display: 'block' }}>
                  O evento será criado na sua agenda Google e um link do Google Meet será gerado automaticamente.
                </small>
              )}
            </div>

            <div className="pac-form-group">
              <label>Descrição</label>
              <textarea value={trainingForm.description} onChange={e => setTrainingForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes do treinamento..." />
            </div>

            {trainingFeedback && <div className="pac-feedback">{trainingFeedback}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              {trainingModal !== 'new' && (
                <button className="pac-action-btn danger" onClick={() => deleteTraining(trainingModal)} disabled={deletingTraining}>
                  <i className="bx bx-trash"></i> Excluir
                </button>
              )}
              <button className="pac-btn-ghost" onClick={() => setTrainingModal(false)}>Cancelar</button>
              <button className="pac-btn-primary" onClick={saveTraining} disabled={savingTraining}>
                {savingTraining ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TYPE MODAL ── */}
      {typeModal && (
        <div className="pac-overlay" onClick={e => e.target === e.currentTarget && setTypeModal(false)}>
          <div className="pac-modal">
            <h3>
              <i className={`bx bx-${typeModal === 'new' ? 'plus-circle' : 'edit'}`} style={{ marginRight: 8, color: 'var(--button-primary, #6366f1)' }}></i>
              {typeModal === 'new' ? 'Novo Tipo de Treinamento' : 'Editar Tipo'}
            </h3>

            <div className="pac-form-group">
              <label>Nome *</label>
              <input type="text" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Onboarding" autoFocus />
            </div>

            <div className="pac-form-group">
              <label>Descrição</label>
              <input type="text" value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional..." />
            </div>

            <div className="pac-form-group">
              <label>Cor</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <div
                    key={c}
                    className={`pac-color-swatch${typeForm.color === c ? ' selected' : ''}`}
                    style={{ background: c, width: 22, height: 22 }}
                    onClick={() => setTypeForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>

            <div className="pac-form-group">
              <label>Ícone</label>
              <div className="pac-icon-grid">
                {TYPE_ICONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`pac-icon-option${typeForm.icon === value ? ' selected' : ''}`}
                    onClick={() => setTypeForm(f => ({ ...f, icon: value }))}
                  >
                    <i className={`bx ${value}`}></i>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: typeForm.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bx ${typeForm.icon}`} style={{ fontSize: 18, color: typeForm.color }}></i>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{typeForm.name || 'Nome do tipo'}</div>
                {typeForm.description && <div style={{ fontSize: 12, opacity: 0.55 }}>{typeForm.description}</div>}
              </div>
            </div>

            {typeFeedback && <div className="pac-feedback">{typeFeedback}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="pac-btn-ghost" onClick={() => setTypeModal(false)}>Cancelar</button>
              <button className="pac-btn-primary" onClick={saveType} disabled={savingType}>
                {savingType ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TrainingRow sub-component ────────────────────────────────────────────────

function TrainingRow({ training: t, onOpen, onEdit, onDelete, onQuickStatus }) {
  return (
    <div className="pac-training-row" onClick={onOpen}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
          <StatusBadge status={t.status} />
          {t.training_type && <TypeBadge type={t.training_type} />}
        </div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {t.client && <span><i className="bx bx-user" style={{ marginRight: 3 }}></i>{t.client.name}</span>}
          {t.scheduled_at && <span><i className="bx bx-calendar" style={{ marginRight: 3 }}></i>{formatDateTime(t.scheduled_at)}</span>}
          {t.platform && <span><i className="bx bx-desktop" style={{ marginRight: 3 }}></i>{t.platform}</span>}
          {t.duration_minutes && <span><i className="bx bx-time-five" style={{ marginRight: 3 }}></i>{t.duration_minutes} min</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        {t.platform && t.link && (
          <a href={t.link} target="_blank" rel="noreferrer" className="pac-action-btn" onClick={e => e.stopPropagation()}
            style={{ textDecoration: 'none', color: 'var(--button-primary, #6366f1)', borderColor: 'var(--button-primary, #6366f1)' }}>
            <i className="bx bx-link-external"></i>
          </a>
        )}
        {t.status !== 'realizado' && (
          <button className="pac-action-btn" onClick={() => onQuickStatus(t, 'realizado')} title="Marcar como realizado"
            style={{ color: '#e53935', borderColor: '#e53935' }}>
            <i className="bx bx-check"></i>
          </button>
        )}
        {t.status !== 'cancelado' && (
          <button className="pac-action-btn" onClick={() => onQuickStatus(t, 'cancelado')} title="Cancelar"
            style={{ color: '#f59e0b', borderColor: '#f59e0b' }}>
            <i className="bx bx-x"></i>
          </button>
        )}
        <button className="pac-action-btn" onClick={() => onEdit(t)}>
          <i className="bx bx-edit"></i>
        </button>
        <button className="pac-action-btn danger" onClick={() => onDelete(t)}>
          <i className="bx bx-trash"></i>
        </button>
      </div>
    </div>
  )
}
