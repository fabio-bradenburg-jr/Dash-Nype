'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const STATUSES = [
  { value: 'pending',   label: 'Pendente',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: 'bx-time-five' },
  { value: 'scheduled', label: 'Agendado',   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: 'bx-calendar-check' },
  { value: 'published', label: 'Publicado',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: 'bx-check-circle' },
  { value: 'cancelled', label: 'Cancelado',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: 'bx-x-circle' },
]

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: 'bxl-instagram' },
  { value: 'facebook',  label: 'Facebook',  icon: 'bxl-facebook' },
  { value: 'linkedin',  label: 'LinkedIn',  icon: 'bxl-linkedin' },
  { value: 'tiktok',    label: 'TikTok',    icon: 'bxl-tiktok' },
  { value: 'youtube',   label: 'YouTube',   icon: 'bxl-youtube' },
  { value: 'twitter',   label: 'X / Twitter', icon: 'bxl-twitter' },
]

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function statusMeta(val) { return STATUSES.find(s => s.value === val) || STATUSES[0] }

function isoDate(d) { return d.toISOString().slice(0, 10) }

function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const EMPTY_FORM = {
  title: '', description: '', scheduledDate: '', scheduledTime: '',
  status: 'pending', platforms: [],
}

const EMPTY_PLAN_ITEM = () => ({
  id: Math.random().toString(36).slice(2),
  clientId: '', title: '', description: '',
  scheduledDate: '', scheduledTime: '',
  status: 'pending', platforms: [],
})

export default function EditorialCalendar({ clients = [], isLightMode = false, defaultView = 'calendar' }) {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [posts, setPosts]  = useState([])
  const [loading, setLoading] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [view, setView]    = useState(defaultView) // 'calendar' | 'list' | 'dash'

  // Modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [editPost, setEditPost]     = useState(null) // null = new
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formClient, setFormClient] = useState('')
  const [formCalendarId, setFormCalendarId] = useState('') // '' = no calendar
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [feedback, setFeedback]     = useState('')
  const titleRef = useRef(null)

  // Saved plans (persisted in localStorage)
  const [savedPlans, setSavedPlans] = useState(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('editorial_saved_plans') : null
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  function persistPlans(plans) {
    setSavedPlans(plans)
    try { localStorage.setItem('editorial_saved_plans', JSON.stringify(plans)) } catch {}
  }

  // Planning
  const [planOpen, setPlanOpen]     = useState(false)
  const [planItems, setPlanItems]   = useState([EMPTY_PLAN_ITEM()])
  const [planSaving, setPlanSaving] = useState(false)
  const [planFeedback, setPlanFeedback] = useState('')
  const planPrintRef = useRef(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      const m = String(month + 1).padStart(2, '0')
      qs.set('month', `${year}-${m}`)
      if (filterClient) qs.set('clientId', filterClient)
      if (filterStatus) qs.set('status', filterStatus)
      const res = await fetch(`/api/editorial?${qs}`)
      const json = await res.json()
      setPosts(json.posts || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [year, month, filterClient, filterStatus])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function openNew(date = '') {
    setEditPost(null)
    setForm({ ...EMPTY_FORM, scheduledDate: date })
    setFormClient(filterClient || (clients[0]?.id || ''))
    setFormCalendarId('')
    setFeedback('')
    setModalOpen(true)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  function openEdit(post) {
    setEditPost(post)
    setFormCalendarId('')
    setForm({
      title: post.title || '',
      description: post.description || '',
      scheduledDate: post.scheduled_date || '',
      scheduledTime: post.scheduled_time || '',
      status: post.status || 'pending',
      platforms: post.platforms || [],
    })
    setFormClient(post.client_id || '')
    setFeedback('')
    setModalOpen(true)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  function closeModal() { setModalOpen(false); setEditPost(null); setFeedback('') }

  function togglePlatform(val) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(val)
        ? f.platforms.filter(p => p !== val)
        : [...f.platforms, val],
    }))
  }

  async function handleSave() {
    if (!form.scheduledDate) { setFeedback('Informe a data de publicação.'); return }
    if (!formClient) { setFeedback('Selecione um cliente.'); return }
    setSaving(true); setFeedback('')
    try {
      const body = {
        clientId: formClient,
        title: form.title,
        description: form.description,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime || null,
        status: form.status,
        platforms: form.platforms,
      }
      let res
      if (editPost) {
        res = await fetch(`/api/editorial/${editPost.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/editorial', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const json = await res.json()
      if (!res.ok) { setFeedback(json.error || 'Erro ao salvar.'); return }
      // If a calendar was selected, add this post to it
      if (!editPost && formCalendarId && json.post) {
        const newItem = {
          id: EMPTY_PLAN_ITEM().id,
          clientId: formClient,
          title: form.title,
          description: form.description,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime,
          status: form.status,
          platforms: form.platforms,
        }
        const updated = savedPlans.map(p =>
          p.id === formCalendarId ? { ...p, items: [...p.items, newItem] } : p
        )
        persistPlans(updated)
      }
      closeModal()
      fetchPosts()
    } catch (e) {
      setFeedback('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editPost) return
    setDeleting(true)
    try {
      await fetch(`/api/editorial/${editPost.id}`, { method: 'DELETE' })
      closeModal(); fetchPosts()
    } catch (e) {
      setFeedback('Erro ao excluir.')
    } finally {
      setDeleting(false)
    }
  }

  async function quickStatus(post, status) {
    await fetch(`/api/editorial/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchPosts()
  }

  // Planning helpers
  function openPlanning() {
    setPlanItems([EMPTY_PLAN_ITEM()])
    setPlanFeedback('')
    setPlanOpen(true)
  }
  function closePlanning() { setPlanOpen(false); setPlanFeedback('') }

  function updatePlanItem(id, field, value) {
    setPlanItems(items => items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function togglePlanPlatform(id, val) {
    setPlanItems(items => items.map(it => it.id === id
      ? { ...it, platforms: it.platforms.includes(val) ? it.platforms.filter(p => p !== val) : [...it.platforms, val] }
      : it))
  }
  function addPlanItem() { setPlanItems(items => [...items, EMPTY_PLAN_ITEM()]) }
  function removePlanItem(id) { setPlanItems(items => items.filter(it => it.id !== id)) }

  async function savePlan() {
    const incomplete = planItems.findIndex(it => !it.scheduledDate || !it.clientId)
    if (incomplete !== -1) { setPlanFeedback(`Item ${incomplete + 1}: informe data e cliente.`); return }
    setPlanSaving(true); setPlanFeedback('')
    try {
      await Promise.all(planItems.map(it =>
        fetch('/api/editorial', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: it.clientId, title: it.title, description: it.description,
            scheduledDate: it.scheduledDate, scheduledTime: it.scheduledTime || null,
            status: it.status, platforms: it.platforms,
          }),
        })
      ))
      // Save a snapshot to the plans list
      const newPlan = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        label: `Planejamento ${MONTHS[month]} ${year}`,
        month, year,
        items: planItems,
      }
      persistPlans([newPlan, ...savedPlans])
      closePlanning()
      fetchPosts()
    } catch (e) {
      setPlanFeedback('Erro ao salvar planejamento.')
    } finally {
      setPlanSaving(false)
    }
  }

  function deleteSavedPlan(id) {
    persistPlans(savedPlans.filter(p => p.id !== id))
  }

  function exportSavedPlanPDF(plan) {
    const clientMap2 = {}
    for (const c of clients) clientMap2[c.id] = c.name
    const rows = plan.items.map((it, i) => {
      const sm = statusMeta(it.status)
      const pls = (it.platforms || []).map(p => PLATFORMS.find(x => x.value === p)?.label || p).join(', ')
      return `<tr>
        <td>${i + 1}</td>
        <td>${clientMap2[it.clientId] || it.clientId || '—'}</td>
        <td>${it.title || '—'}</td>
        <td>${it.scheduledDate ? it.scheduledDate.split('-').reverse().join('/') : '—'}${it.scheduledTime ? ' ' + it.scheduledTime.slice(0,5) : ''}</td>
        <td>${pls || '—'}</td>
        <td>${sm.label}</td>
        <td>${it.description || '—'}</td>
      </tr>`
    }).join('')
    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/><title>${plan.label}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; padding: 40px; font-size: 12px; }
        h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
        .sub { color: #666; margin-bottom: 24px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #111; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 32px; font-size: 11px; color: #999; }
      </style>
    </head><body>
      <h1>${plan.label}</h1>
      <p class="sub">${plan.items.length} post${plan.items.length !== 1 ? 's' : ''} planejado${plan.items.length !== 1 ? 's' : ''}</p>
      <table>
        <thead><tr><th>#</th><th>Cliente</th><th>Título</th><th>Data</th><th>Plataformas</th><th>Status</th><th>Descrição</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
    </body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  function exportPlanPDF() {
    const clientMap2 = {}
    for (const c of clients) clientMap2[c.id] = c.name

    const rows = planItems.map((it, i) => {
      const sm = statusMeta(it.status)
      const pls = it.platforms.map(p => PLATFORMS.find(x => x.value === p)?.label || p).join(', ')
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${clientMap2[it.clientId] || it.clientId || '—'}</td>
          <td>${it.title || '—'}</td>
          <td>${it.scheduledDate ? it.scheduledDate.split('-').reverse().join('/') : '—'}${it.scheduledTime ? ' ' + it.scheduledTime.slice(0,5) : ''}</td>
          <td>${pls || '—'}</td>
          <td>${sm.label}</td>
          <td>${it.description || '—'}</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>Planejamento Editorial — ${MONTHS[month]} ${year}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; padding: 40px; font-size: 12px; }
        h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
        .sub { color: #666; margin-bottom: 24px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #111; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 32px; font-size: 11px; color: #999; }
      </style>
    </head><body>
      <h1>Planejamento Editorial</h1>
      <p class="sub">${MONTHS[month]} ${year} &mdash; ${planItems.length} post${planItems.length !== 1 ? 's' : ''} planejado${planItems.length !== 1 ? 's' : ''}</p>
      <table>
        <thead><tr><th>#</th><th>Cliente</th><th>Título</th><th>Data</th><th>Plataformas</th><th>Status</th><th>Descrição</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
    </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const cells = buildCalendarGrid(year, month)
  const numWeeks = cells.length / 7
  const postsByDate = {}
  for (const p of posts) {
    if (!postsByDate[p.scheduled_date]) postsByDate[p.scheduled_date] = []
    postsByDate[p.scheduled_date].push(p)
  }

  const clientMap = {}
  for (const c of clients) clientMap[c.id] = c.name

  const todayStr = isoDate(today)

  // Dashboard stats
  const statusCounts = STATUSES.reduce((acc, s) => { acc[s.value] = 0; return acc }, {})
  for (const p of posts) if (statusCounts[p.status] !== undefined) statusCounts[p.status]++

  const clientBreakdown = Object.values(
    posts.reduce((acc, p) => {
      const key = p.client_id
      if (!acc[key]) acc[key] = { clientId: key, name: clientMap[key] || key, total: 0, published: 0, pending: 0, scheduled: 0 }
      acc[key].total++
      if (p.status === 'published') acc[key].published++
      else if (p.status === 'pending') acc[key].pending++
      else if (p.status === 'scheduled') acc[key].scheduled++
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  const platformCounts = posts.reduce((acc, p) => {
    for (const pl of (p.platforms || [])) acc[pl] = (acc[pl] || 0) + 1
    return acc
  }, {})

  const sevenDaysLater = new Date(today); sevenDaysLater.setDate(today.getDate() + 7)
  const sevenStr = isoDate(sevenDaysLater)
  const upcoming = posts
    .filter(p => p.scheduled_date >= todayStr && p.scheduled_date <= sevenStr && p.status !== 'cancelled')
    .slice(0, 8)

  return (
    <div className="editorial-shell">
      {/* Header */}
      <div className="editorial-header">
        <div className="editorial-header-left">
          <h2 className="editorial-title">
            {defaultView === 'dash' ? 'Painel Social Media' : defaultView === 'plans' ? 'Planejamentos' : 'Calendário Editorial'}
          </h2>
          <p className="editorial-subtitle">
            {defaultView === 'dash' ? 'Visão consolidada das publicações por status, cliente e plataforma.'
              : defaultView === 'plans' ? 'Histórico de planejamentos salvos. Exporte em PDF ou crie novos.'
              : 'Planeje, agende e acompanhe as publicações dos clientes.'}
          </p>
        </div>
        {defaultView !== 'dash' && defaultView !== 'plans' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="editorial-plan-btn" onClick={openPlanning}>
              <i className="bx bx-spreadsheet"></i>
              Planejamento
            </button>
            <button className="editorial-new-btn" onClick={() => openNew()}>
              <i className="bx bx-plus"></i>
              Novo post
            </button>
          </div>
        )}
      </div>

      {/* Toolbar — hidden in plans view */}
      {defaultView !== 'plans' && <div className="editorial-toolbar">
        <div className="editorial-toolbar-left">
          {/* Month nav */}
          <div className="editorial-month-nav">
            <button className="editorial-nav-btn" onClick={prevMonth}><i className="bx bx-chevron-left"></i></button>
            <span className="editorial-month-label">{MONTHS[month]} {year}</span>
            <button className="editorial-nav-btn" onClick={nextMonth}><i className="bx bx-chevron-right"></i></button>
          </div>

          {/* Filters */}
          <select
            className="editorial-filter-select"
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
          >
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className="editorial-filter-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {!defaultView || defaultView === 'calendar' ? (
          <div className="editorial-toolbar-right">
            <button
              className={`editorial-view-btn ${view === 'calendar' ? 'active' : ''}`}
              onClick={() => setView('calendar')}
            ><i className="bx bx-calendar"></i> Calendário</button>
            <button
              className={`editorial-view-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
            ><i className="bx bx-list-ul"></i> Lista</button>
          </div>
        ) : null}
      </div>}

      {/* Legend */}
      {defaultView !== 'plans' && <div className="editorial-legend">
        {STATUSES.map(s => (
          <span key={s.value} className="editorial-legend-item" style={{ color: s.color }}>
            <i className={`bx ${s.icon}`}></i> {s.label}
          </span>
        ))}
        <span className="editorial-post-count">{loading ? '…' : `${posts.length} post${posts.length !== 1 ? 's' : ''}`}</span>
      </div>}

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="editorial-calendar">
          <div className="editorial-weekdays">
            {WEEKDAYS.map(d => <div key={d} className="editorial-weekday">{d}</div>)}
          </div>
          <div className="editorial-grid" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
            {cells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="editorial-cell editorial-cell-empty" />

              const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const dayPosts = postsByDate[dateStr] || []
              const isToday = dateStr === todayStr

              return (
                <div
                  key={dateStr}
                  className={`editorial-cell${isToday ? ' editorial-cell-today' : ''}`}
                  onClick={() => openNew(dateStr)}
                >
                  <span className={`editorial-day-num${isToday ? ' today' : ''}`}>{day}</span>
                  <div className="editorial-cell-posts">
                    {dayPosts.slice(0, 3).map(post => {
                      const sm = statusMeta(post.status)
                      return (
                        <div
                          key={post.id}
                          className="editorial-post-chip"
                          style={{ background: sm.bg, borderColor: sm.color + '44', color: sm.color }}
                          onClick={e => { e.stopPropagation(); openEdit(post) }}
                          title={`${post.title || '(sem título)'} — ${clientMap[post.client_id] || post.client_id}`}
                        >
                          <i className={`bx ${sm.icon}`}></i>
                          <span>{post.title || clientMap[post.client_id] || '–'}</span>
                        </div>
                      )
                    })}
                    {dayPosts.length > 3 && (
                      <span className="editorial-more">+{dayPosts.length - 3} mais</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="editorial-list">
          {posts.length === 0 && !loading && (
            <div className="editorial-empty">
              <i className="bx bx-calendar-x"></i>
              <p>Nenhum post encontrado para este período.</p>
              <button className="editorial-new-btn" onClick={() => openNew()}>Criar primeiro post</button>
            </div>
          )}
          {posts.map(post => {
            const sm = statusMeta(post.status)
            return (
              <div key={post.id} className="editorial-list-row" onClick={() => openEdit(post)}>
                <div className="editorial-list-date">
                  <strong>{post.scheduled_date?.slice(8, 10)}</strong>
                  <small>{MONTHS[parseInt(post.scheduled_date?.slice(5, 7)) - 1]?.slice(0,3)}</small>
                </div>
                <div className="editorial-list-body">
                  <div className="editorial-list-title">{post.title || <em>Sem título</em>}</div>
                  <div className="editorial-list-meta">
                    <span className="editorial-list-client"><i className="bx bx-user"></i>{clientMap[post.client_id] || post.client_id}</span>
                    {post.scheduled_time && <span><i className="bx bx-time"></i>{post.scheduled_time.slice(0,5)}</span>}
                    {(post.platforms || []).map(p => {
                      const pm = PLATFORMS.find(x => x.value === p)
                      return pm ? <span key={p}><i className={`bx ${pm.icon}`}></i>{pm.label}</span> : null
                    })}
                  </div>
                  {post.description && <p className="editorial-list-desc">{post.description}</p>}
                </div>
                <div
                  className="editorial-status-badge"
                  style={{ background: sm.bg, color: sm.color, borderColor: sm.color + '44' }}
                  onClick={e => {
                    e.stopPropagation()
                    const idx = STATUSES.findIndex(s => s.value === post.status)
                    const next = STATUSES[(idx + 1) % STATUSES.length].value
                    quickStatus(post, next)
                  }}
                  title="Clique para avançar status"
                >
                  <i className={`bx ${sm.icon}`}></i>
                  {sm.label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Painel / Dashboard view */}
      {view === 'dash' && (
        <div className="editorial-dash">
          {/* Stat cards row */}
          <div className="editorial-stat-row">
            <div className="editorial-stat-card editorial-stat-total">
              <span className="editorial-stat-num">{posts.length}</span>
              <span className="editorial-stat-label">Total do mês</span>
            </div>
            {STATUSES.map(s => (
              <div key={s.value} className="editorial-stat-card" style={{ '--stat-color': s.color, '--stat-bg': s.bg }}>
                <i className={`bx ${s.icon} editorial-stat-icon`}></i>
                <span className="editorial-stat-num" style={{ color: s.color }}>{statusCounts[s.value]}</span>
                <span className="editorial-stat-label">{s.label}</span>
                {posts.length > 0 && (
                  <div className="editorial-stat-bar">
                    <div className="editorial-stat-bar-fill" style={{ width: `${Math.round(statusCounts[s.value] / posts.length * 100)}%`, background: s.color }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="editorial-dash-grid">
            {/* Client breakdown */}
            <div className="editorial-dash-panel">
              <h4 className="editorial-dash-panel-title"><i className="bx bxs-buildings"></i>Por cliente</h4>
              {clientBreakdown.length === 0 && <p className="editorial-dash-empty">Nenhum post no período.</p>}
              {clientBreakdown.map(c => (
                <div key={c.clientId} className="editorial-client-row">
                  <div className="editorial-client-name">{c.name}</div>
                  <div className="editorial-client-track">
                    <div className="editorial-client-bar">
                      <div className="editorial-client-bar-pub" style={{ width: `${posts.length ? Math.round(c.published / posts.length * 100) : 0}%` }} title={`${c.published} publicados`} />
                      <div className="editorial-client-bar-sched" style={{ width: `${posts.length ? Math.round(c.scheduled / posts.length * 100) : 0}%` }} title={`${c.scheduled} agendados`} />
                      <div className="editorial-client-bar-pend" style={{ width: `${posts.length ? Math.round(c.pending / posts.length * 100) : 0}%` }} title={`${c.pending} pendentes`} />
                    </div>
                    <div className="editorial-client-chips">
                      {c.published > 0 && <span style={{ color: '#22c55e' }}><i className="bx bx-check-circle"></i>{c.published}</span>}
                      {c.scheduled > 0 && <span style={{ color: '#3b82f6' }}><i className="bx bx-calendar-check"></i>{c.scheduled}</span>}
                      {c.pending > 0 && <span style={{ color: '#f59e0b' }}><i className="bx bx-time-five"></i>{c.pending}</span>}
                      <span className="editorial-client-total">{c.total} total</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right column: platforms + upcoming */}
            <div className="editorial-dash-right">
              {/* Platform breakdown */}
              <div className="editorial-dash-panel">
                <h4 className="editorial-dash-panel-title"><i className="bx bx-share-alt"></i>Por plataforma</h4>
                {PLATFORMS.filter(p => platformCounts[p.value]).length === 0 && <p className="editorial-dash-empty">Sem plataforma definida.</p>}
                <div className="editorial-platform-stats">
                  {PLATFORMS.filter(p => platformCounts[p.value]).sort((a, b) => (platformCounts[b.value] || 0) - (platformCounts[a.value] || 0)).map(p => {
                    const count = platformCounts[p.value] || 0
                    const maxCount = Math.max(...Object.values(platformCounts))
                    return (
                      <div key={p.value} className="editorial-platform-stat-row">
                        <span className="editorial-platform-stat-label"><i className={`bx ${p.icon}`}></i>{p.label}</span>
                        <div className="editorial-platform-stat-track">
                          <div className="editorial-platform-stat-fill" style={{ width: `${Math.round(count / maxCount * 100)}%` }} />
                        </div>
                        <span className="editorial-platform-stat-count">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Upcoming posts (next 7 days) */}
              <div className="editorial-dash-panel">
                <h4 className="editorial-dash-panel-title"><i className="bx bx-bell"></i>Próximos 7 dias</h4>
                {upcoming.length === 0 && <p className="editorial-dash-empty">Nenhuma publicação nos próximos 7 dias.</p>}
                {upcoming.map(post => {
                  const sm = statusMeta(post.status)
                  return (
                    <div key={post.id} className="editorial-upcoming-row" onClick={() => openEdit(post)}>
                      <div className="editorial-upcoming-date">
                        <strong>{post.scheduled_date?.slice(8, 10)}</strong>
                        <small>{MONTHS[parseInt(post.scheduled_date?.slice(5, 7)) - 1]?.slice(0, 3)}</small>
                      </div>
                      <div className="editorial-upcoming-info">
                        <span className="editorial-upcoming-title">{post.title || <em>Sem título</em>}</span>
                        <span className="editorial-upcoming-client">{clientMap[post.client_id] || post.client_id}</span>
                      </div>
                      <div className="editorial-upcoming-badge" style={{ color: sm.color }}>
                        <i className={`bx ${sm.icon}`}></i>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="editorial-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="editorial-modal">
            <div className="editorial-modal-header">
              <h3>{editPost ? 'Editar post' : 'Novo post'}</h3>
              <button className="editorial-modal-close" onClick={closeModal}><i className="bx bx-x"></i></button>
            </div>

            <div className="editorial-modal-body">
              {/* Client */}
              <div className="editorial-field">
                <label>Cliente</label>
                <select value={formClient} onChange={e => { setFormClient(e.target.value); setFormCalendarId('') }}>
                  <option value="">Selecione…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Calendar (only for new posts) */}
              {!editPost && (
                <div className="editorial-field">
                  <label>Adicionar ao calendário <span className="editorial-field-optional">(opcional)</span></label>
                  <select value={formCalendarId} onChange={e => setFormCalendarId(e.target.value)}>
                    <option value="">Nenhum calendário</option>
                    {savedPlans
                      .filter(p => !formClient || p.items.some(it => it.clientId === formClient) || p.items.length === 0)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.label} ({p.items.length} posts)</option>
                      ))
                    }
                  </select>
                  {formCalendarId && (
                    <span className="editorial-field-hint">
                      <i className="bx bx-check-circle"></i>
                      Post será adicionado ao planejamento selecionado
                    </span>
                  )}
                </div>
              )}

              {/* Title */}
              <div className="editorial-field">
                <label>Tema / Título do post</label>
                <input
                  ref={titleRef}
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex.: Lançamento de produto, Dica da semana…"
                />
              </div>

              {/* Date + Time */}
              <div className="editorial-field-row">
                <div className="editorial-field">
                  <label>Data de publicação</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  />
                </div>
                <div className="editorial-field">
                  <label>Horário (opcional)</label>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="editorial-field">
                <label>Status</label>
                <div className="editorial-status-row">
                  {STATUSES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      className={`editorial-status-chip ${form.status === s.value ? 'active' : ''}`}
                      style={form.status === s.value
                        ? { background: s.bg, color: s.color, borderColor: s.color + '66' }
                        : {}}
                      onClick={() => setForm(f => ({ ...f, status: s.value }))}
                    >
                      <i className={`bx ${s.icon}`}></i>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platforms */}
              <div className="editorial-field">
                <label>Plataformas</label>
                <div className="editorial-platform-row">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      className={`editorial-platform-chip ${form.platforms.includes(p.value) ? 'active' : ''}`}
                      onClick={() => togglePlatform(p.value)}
                    >
                      <i className={`bx ${p.icon}`}></i>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="editorial-field">
                <label>Descrição / Observação</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Adicione detalhes, referências, copy ou observações sobre o post…"
                  rows={4}
                />
              </div>

              {feedback && <p className="editorial-feedback">{feedback}</p>}
            </div>

            <div className="editorial-modal-footer">
              {editPost && (
                <button
                  className="editorial-delete-btn"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <i className="bx bx-loader-alt bx-spin"></i> : <i className="bx bx-trash"></i>}
                  Excluir
                </button>
              )}
              <div className="editorial-modal-footer-right">
                <button className="editorial-cancel-btn" onClick={closeModal}>Cancelar</button>
                <button className="editorial-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? <i className="bx bx-loader-alt bx-spin"></i> : <i className="bx bx-save"></i>}
                  {editPost ? 'Salvar alterações' : 'Criar post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans view */}
      {view === 'plans' && (
        <div className="editorial-plans-view">
          <div className="editorial-plans-header">
            <div>
              <h3 className="editorial-plans-title">Planejamentos salvos</h3>
              <p className="editorial-plans-sub">Histórico de todos os planejamentos criados. Exporte ou aplique no calendário.</p>
            </div>
            <button className="editorial-plan-btn" onClick={openPlanning}>
              <i className="bx bx-plus"></i>
              Novo planejamento
            </button>
          </div>

          {savedPlans.length === 0 && (
            <div className="editorial-empty">
              <i className="bx bx-spreadsheet"></i>
              <p>Nenhum planejamento salvo ainda.</p>
              <button className="editorial-new-btn" onClick={openPlanning}>Criar planejamento</button>
            </div>
          )}

          {savedPlans.map(plan => (
            <div key={plan.id} className="editorial-plan-card">
              <div className="editorial-plan-card-header">
                <div className="editorial-plan-card-info">
                  <span className="editorial-plan-card-title">{plan.label}</span>
                  <span className="editorial-plan-card-meta">
                    {plan.items.length} post{plan.items.length !== 1 ? 's' : ''} &mdash; criado em {new Date(plan.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="editorial-plan-card-actions">
                  <button className="editorial-export-btn" onClick={() => exportSavedPlanPDF(plan)}>
                    <i className="bx bx-file-export"></i>
                    Exportar PDF
                  </button>
                  <button className="editorial-plan-delete-btn" onClick={() => deleteSavedPlan(plan.id)} title="Remover planejamento">
                    <i className="bx bx-trash"></i>
                  </button>
                </div>
              </div>
              <div className="editorial-plan-card-items">
                {plan.items.map((it, idx) => {
                  const sm = statusMeta(it.status)
                  const clientName = clientMap[it.clientId] || it.clientId || '—'
                  return (
                    <div key={it.id || idx} className="editorial-plan-card-row">
                      <span className="editorial-plan-card-num">{idx + 1}</span>
                      <div className="editorial-plan-card-row-body">
                        <span className="editorial-plan-card-row-title">{it.title || <em>Sem título</em>}</span>
                        <span className="editorial-plan-card-row-meta">
                          <span><i className="bx bx-user"></i>{clientName}</span>
                          {it.scheduledDate && <span><i className="bx bx-calendar"></i>{it.scheduledDate.split('-').reverse().join('/')}</span>}
                          {(it.platforms || []).map(p => {
                            const pm = PLATFORMS.find(x => x.value === p)
                            return pm ? <span key={p}><i className={`bx ${pm.icon}`}></i>{pm.label}</span> : null
                          })}
                        </span>
                      </div>
                      <span className="editorial-plan-card-status" style={{ color: sm.color }}>
                        <i className={`bx ${sm.icon}`}></i>
                        {sm.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Planning Modal */}
      {planOpen && (
        <div className="editorial-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closePlanning() }}>
          <div className="editorial-plan-modal">
            <div className="editorial-plan-modal-header">
              <div>
                <h3>Planejamento Editorial</h3>
                <p className="editorial-plan-modal-sub">{MONTHS[month]} {year} &mdash; organize todos os posts e exporte para PDF</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="editorial-export-btn" onClick={exportPlanPDF} title="Exportar PDF">
                  <i className="bx bx-file-export"></i>
                  Exportar PDF
                </button>
                <button className="editorial-modal-close" onClick={closePlanning}><i className="bx bx-x"></i></button>
              </div>
            </div>

            <div className="editorial-plan-modal-body" ref={planPrintRef}>
              {planItems.map((item, idx) => (
                <div key={item.id} className="editorial-plan-item">
                  <div className="editorial-plan-item-header">
                    <span className="editorial-plan-item-num">Post {idx + 1}</span>
                    {planItems.length > 1 && (
                      <button className="editorial-plan-remove-btn" onClick={() => removePlanItem(item.id)} title="Remover">
                        <i className="bx bx-trash"></i>
                      </button>
                    )}
                  </div>

                  {/* Row 1: title full width */}
                  <div className="editorial-field" style={{ marginBottom: 10 }}>
                    <label>Título / Tema</label>
                    <input
                      type="text"
                      value={item.title}
                      onChange={e => updatePlanItem(item.id, 'title', e.target.value)}
                      placeholder="Ex.: Lançamento, Dica da semana…"
                    />
                  </div>

                  {/* Row 2: client + date + time + status */}
                  <div className="editorial-plan-item-grid">
                    <div className="editorial-field">
                      <label>Cliente</label>
                      <select value={item.clientId} onChange={e => updatePlanItem(item.id, 'clientId', e.target.value)}>
                        <option value="">Selecione…</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="editorial-field">
                      <label>Data</label>
                      <input
                        type="date"
                        value={item.scheduledDate}
                        onChange={e => updatePlanItem(item.id, 'scheduledDate', e.target.value)}
                      />
                    </div>
                    <div className="editorial-field">
                      <label>Horário</label>
                      <input
                        type="time"
                        value={item.scheduledTime}
                        onChange={e => updatePlanItem(item.id, 'scheduledTime', e.target.value)}
                      />
                    </div>
                    <div className="editorial-field">
                      <label>Status</label>
                      <select value={item.status} onChange={e => updatePlanItem(item.id, 'status', e.target.value)}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Platforms */}
                  <div className="editorial-field" style={{ marginTop: 10 }}>
                    <label>Plataformas</label>
                    <div className="editorial-platform-row">
                      {PLATFORMS.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          className={`editorial-platform-chip ${item.platforms.includes(p.value) ? 'active' : ''}`}
                          onClick={() => togglePlanPlatform(item.id, p.value)}
                        >
                          <i className={`bx ${p.icon}`}></i>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="editorial-field" style={{ marginTop: 10 }}>
                    <label>Descrição / Copy</label>
                    <textarea
                      value={item.description}
                      onChange={e => updatePlanItem(item.id, 'description', e.target.value)}
                      placeholder="Detalhes, referências, copy ou observações…"
                      rows={2}
                    />
                  </div>
                </div>
              ))}

              <button className="editorial-plan-add-btn" onClick={addPlanItem}>
                <i className="bx bx-plus"></i>
                Adicionar post
              </button>

              {planFeedback && <p className="editorial-feedback">{planFeedback}</p>}
            </div>

            <div className="editorial-modal-footer">
              <span className="editorial-plan-count">{planItems.length} post{planItems.length !== 1 ? 's' : ''} planejado{planItems.length !== 1 ? 's' : ''}</span>
              <div className="editorial-modal-footer-right">
                <button className="editorial-cancel-btn" onClick={closePlanning}>Cancelar</button>
                <button className="editorial-save-btn" onClick={savePlan} disabled={planSaving}>
                  {planSaving ? <i className="bx bx-loader-alt bx-spin"></i> : <i className="bx bx-calendar-check"></i>}
                  Salvar no calendário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .editorial-shell {
          padding: 20px 28px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
          min-height: 0;
          box-sizing: border-box;
        }

        /* Header */
        .editorial-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .editorial-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 4px;
          color: var(--text-primary);
        }
        .editorial-subtitle { font-size: 13px; color: var(--text-secondary); margin: 0; }
        .editorial-new-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 10px; border: none;
          background: var(--button-primary, #26c281); color: #fff;
          font: inherit; font-weight: 700; font-size: 13px; cursor: pointer;
          transition: opacity 0.15s;
        }
        .editorial-new-btn:hover { opacity: 0.88; }

        /* Toolbar */
        .editorial-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
        }
        .editorial-toolbar-left, .editorial-toolbar-right {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .editorial-month-nav {
          display: flex; align-items: center; gap: 8px;
          background: var(--theme-surface, rgba(255,255,255,0.04));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 10px; padding: 4px 8px;
        }
        .editorial-month-label { font-size: 13px; font-weight: 700; min-width: 140px; text-align: center; }
        .editorial-nav-btn {
          width: 28px; height: 28px; border-radius: 7px; border: none;
          background: transparent; color: var(--text-secondary); cursor: pointer;
          display: grid; place-items: center; font-size: 18px;
          transition: background 0.15s;
        }
        .editorial-nav-btn:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }
        .editorial-filter-select {
          padding: 7px 12px; border-radius: 10px; font: inherit; font-size: 13px;
          background: var(--theme-surface, rgba(255,255,255,0.04));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          color: var(--text-primary); cursor: pointer; appearance: none;
        }
        .editorial-view-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 10px;
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          background: transparent; color: var(--text-secondary);
          font: inherit; font-size: 13px; cursor: pointer; transition: all 0.15s;
        }
        .editorial-view-btn.active {
          background: var(--button-primary, #26c281);
          border-color: var(--button-primary, #26c281);
          color: #fff;
        }

        /* Legend */
        .editorial-legend {
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          padding: 0 2px;
        }
        .editorial-legend-item {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 600;
        }
        .editorial-post-count { margin-left: auto; font-size: 12px; color: var(--text-muted); }

        /* Calendar */
        .editorial-calendar {
          background: var(--theme-surface, rgba(255,255,255,0.03));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 16px; overflow: hidden;
          flex: 1; display: flex; flex-direction: column; min-height: 0;
        }
        .editorial-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr);
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
          flex-shrink: 0;
        }
        .editorial-weekday {
          padding: 10px 0; text-align: center;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-muted);
        }
        .editorial-grid {
          display: grid; grid-template-columns: repeat(7, 1fr);
          flex: 1;
        }
        .editorial-cell {
          min-height: 0; padding: 8px;
          border-right: 1px solid var(--border-color, rgba(255,255,255,0.06));
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
          cursor: pointer; transition: background 0.12s;
          display: flex; flex-direction: column; gap: 4px;
        }
        .editorial-cell:hover { background: rgba(255,255,255,0.03); }
        .editorial-cell:nth-child(7n) { border-right: none; }
        .editorial-cell-empty { cursor: default; background: rgba(0,0,0,0.03); }
        .editorial-cell-empty:hover { background: rgba(0,0,0,0.03); }
        .editorial-cell-today { background: rgba(38,194,129,0.04); }
        .editorial-day-num {
          font-size: 12px; font-weight: 600; color: var(--text-muted);
          width: 24px; height: 24px; display: grid; place-items: center;
          border-radius: 50%;
        }
        .editorial-day-num.today {
          background: var(--button-primary, #26c281);
          color: #fff; font-weight: 800;
        }
        .editorial-cell-posts { display: flex; flex-direction: column; gap: 3px; }
        .editorial-post-chip {
          display: flex; align-items: center; gap: 4px;
          padding: 3px 6px; border-radius: 6px; border: 1px solid;
          font-size: 10px; font-weight: 600; cursor: pointer;
          overflow: hidden; white-space: nowrap;
          transition: opacity 0.12s;
        }
        .editorial-post-chip:hover { opacity: 0.8; }
        .editorial-post-chip span { overflow: hidden; text-overflow: ellipsis; }
        .editorial-more { font-size: 10px; color: var(--text-muted); padding: 1px 4px; }

        /* List */
        .editorial-list {
          display: flex; flex-direction: column; gap: 10px;
        }
        .editorial-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 12px; padding: 60px 20px; color: var(--text-muted);
          font-size: 14px;
        }
        .editorial-empty i { font-size: 48px; opacity: 0.4; }
        .editorial-list-row {
          display: grid; grid-template-columns: 52px 1fr auto;
          gap: 16px; align-items: start;
          padding: 16px 18px; border-radius: 14px;
          background: var(--theme-surface, rgba(255,255,255,0.03));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
        }
        .editorial-list-row:hover {
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
        }
        .editorial-list-date {
          display: flex; flex-direction: column; align-items: center;
          padding-top: 2px;
        }
        .editorial-list-date strong { font-size: 22px; font-weight: 800; line-height: 1; }
        .editorial-list-date small { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }
        .editorial-list-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        .editorial-list-title em { color: var(--text-muted); font-style: italic; font-weight: 400; }
        .editorial-list-meta {
          display: flex; align-items: center; gap: 12px;
          font-size: 12px; color: var(--text-muted); flex-wrap: wrap;
        }
        .editorial-list-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .editorial-list-desc { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; line-height: 1.5; }
        .editorial-status-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 10px; border-radius: 8px; border: 1px solid;
          font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;
          transition: opacity 0.15s;
        }
        .editorial-status-badge:hover { opacity: 0.8; }

        /* Modal */
        .editorial-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.54); backdrop-filter: blur(6px);
          display: grid; place-items: center; padding: 20px;
        }
        .editorial-modal {
          width: 100%; max-width: 560px; max-height: 92vh;
          background: var(--theme-bg, #0d1110);
          border: 1px solid rgba(190,201,191,0.18);
          border-radius: 22px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 32px 80px rgba(0,0,0,0.4);
        }
        .editorial-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid rgba(190,201,191,0.12);
        }
        .editorial-modal-header h3 {
          font-size: 17px; font-weight: 700; margin: 0;
          letter-spacing: -0.01em;
        }
        .editorial-modal-close {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: rgba(255,255,255,0.06); color: var(--text-secondary);
          cursor: pointer; display: grid; place-items: center; font-size: 20px;
        }
        .editorial-modal-close:hover { background: rgba(255,255,255,0.1); }
        .editorial-modal-body {
          overflow-y: auto; padding: 20px 24px;
          display: flex; flex-direction: column; gap: 16px; flex: 1;
        }
        .editorial-field { display: flex; flex-direction: column; gap: 6px; }
        .editorial-field label {
          font-size: 12px; font-weight: 700;
          color: var(--text-secondary); letter-spacing: 0.04em; text-transform: uppercase;
        }
        .editorial-field input,
        .editorial-field select,
        .editorial-field textarea {
          width: 100%; padding: 10px 14px; border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(190,201,191,0.16);
          color: var(--text-primary); font: inherit; font-size: 14px;
          box-sizing: border-box;
        }
        .editorial-field input:focus,
        .editorial-field select:focus,
        .editorial-field textarea:focus {
          outline: none;
          border-color: var(--button-primary, #26c281);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--button-primary, #26c281) 18%, transparent);
        }
        .editorial-field textarea { resize: vertical; line-height: 1.6; }
        .editorial-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Status chips */
        .editorial-status-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .editorial-status-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border-color, rgba(255,255,255,0.1));
          background: transparent; color: var(--text-secondary);
          font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .editorial-status-chip:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }

        /* Platform chips */
        .editorial-platform-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .editorial-platform-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 8px;
          border: 1px solid rgba(190,201,191,0.16);
          background: rgba(255,255,255,0.03); color: var(--text-secondary);
          font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .editorial-platform-chip.active {
          background: rgba(38,194,129,0.14);
          border-color: rgba(38,194,129,0.4);
          color: #26c281;
        }
        .editorial-platform-chip:hover { background: rgba(255,255,255,0.06); }

        .editorial-field-optional {
          font-weight: 400;
          font-size: 10px;
          text-transform: none;
          letter-spacing: 0;
          color: var(--text-muted);
          margin-left: 4px;
        }
        .editorial-field-hint {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--button-primary, #26c281);
          margin-top: 4px;
        }

        .editorial-feedback {
          font-size: 13px; color: #f87171; margin: 0;
          padding: 8px 12px; border-radius: 8px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
        }

        /* Modal footer */
        .editorial-modal-footer {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 16px 24px;
          border-top: 1px solid rgba(190,201,191,0.12);
        }
        .editorial-modal-footer-right { display: flex; align-items: center; gap: 10px; }
        .editorial-save-btn, .editorial-cancel-btn, .editorial-delete-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 10px;
          font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .editorial-save-btn {
          background: var(--button-primary, #26c281); color: #fff; border: none;
        }
        .editorial-save-btn:disabled { opacity: 0.5; }
        .editorial-cancel-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(190,201,191,0.16);
          color: var(--text-secondary);
        }
        .editorial-cancel-btn:hover { background: rgba(255,255,255,0.09); }
        .editorial-delete-btn {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.22);
          color: #f87171;
        }
        .editorial-delete-btn:hover { background: rgba(239,68,68,0.16); }

        /* Dashboard / Painel */
        .editorial-dash { display: flex; flex-direction: column; gap: 20px; }

        .editorial-stat-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }
        .editorial-stat-card {
          position: relative;
          background: var(--theme-surface, rgba(255,255,255,0.04));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 16px; padding: 16px 18px;
          display: flex; flex-direction: column; gap: 4px;
          overflow: hidden;
        }
        .editorial-stat-total {
          border-color: rgba(255,255,255,0.12);
        }
        .editorial-stat-icon {
          font-size: 18px; opacity: 0.7; margin-bottom: 2px;
        }
        .editorial-stat-num {
          font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1;
          color: var(--text-primary);
        }
        .editorial-stat-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-muted);
        }
        .editorial-stat-bar {
          margin-top: 10px; height: 4px; border-radius: 99px;
          background: rgba(255,255,255,0.07); overflow: hidden;
        }
        .editorial-stat-bar-fill {
          height: 100%; border-radius: 99px;
          transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .editorial-dash-grid {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 16px;
          align-items: start;
        }
        .editorial-dash-right { display: flex; flex-direction: column; gap: 16px; }
        .editorial-dash-panel {
          background: var(--theme-surface, rgba(255,255,255,0.04));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 16px; padding: 18px 20px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .editorial-dash-panel-title {
          font-size: 13px; font-weight: 700; margin: 0;
          color: var(--text-secondary);
          display: flex; align-items: center; gap: 7px;
        }
        .editorial-dash-panel-title i { font-size: 16px; }
        .editorial-dash-empty { font-size: 13px; color: var(--text-muted); margin: 0; }

        /* Client breakdown */
        .editorial-client-row {
          display: flex; flex-direction: column; gap: 6px;
        }
        .editorial-client-name {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
        }
        .editorial-client-track { display: flex; flex-direction: column; gap: 5px; }
        .editorial-client-bar {
          height: 8px; border-radius: 99px;
          background: rgba(255,255,255,0.06); overflow: hidden;
          display: flex;
        }
        .editorial-client-bar-pub {
          height: 100%; background: #22c55e; transition: width 0.5s ease;
        }
        .editorial-client-bar-sched {
          height: 100%; background: #3b82f6; transition: width 0.5s ease;
        }
        .editorial-client-bar-pend {
          height: 100%; background: #f59e0b; transition: width 0.5s ease;
        }
        .editorial-client-chips {
          display: flex; align-items: center; gap: 12px;
          font-size: 11px; font-weight: 700;
        }
        .editorial-client-chips span { display: inline-flex; align-items: center; gap: 3px; }
        .editorial-client-total { margin-left: auto; color: var(--text-muted); font-weight: 600; }

        /* Platform stats */
        .editorial-platform-stats { display: flex; flex-direction: column; gap: 10px; }
        .editorial-platform-stat-row {
          display: grid; grid-template-columns: 110px 1fr 28px;
          align-items: center; gap: 10px;
        }
        .editorial-platform-stat-label {
          font-size: 12px; font-weight: 600; color: var(--text-secondary);
          display: flex; align-items: center; gap: 6px;
        }
        .editorial-platform-stat-track {
          height: 7px; border-radius: 99px;
          background: rgba(255,255,255,0.06); overflow: hidden;
        }
        .editorial-platform-stat-fill {
          height: 100%; border-radius: 99px;
          background: var(--button-primary, #26c281);
          transition: width 0.5s ease;
        }
        .editorial-platform-stat-count {
          font-size: 12px; font-weight: 700; text-align: right;
          color: var(--text-secondary);
        }

        /* Upcoming posts */
        .editorial-upcoming-row {
          display: grid; grid-template-columns: 40px 1fr 28px;
          gap: 12px; align-items: center; padding: 10px 0;
          border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
          cursor: pointer; transition: opacity 0.15s;
        }
        .editorial-upcoming-row:first-of-type { border-top: none; padding-top: 0; }
        .editorial-upcoming-row:hover { opacity: 0.8; }
        .editorial-upcoming-date {
          display: flex; flex-direction: column; align-items: center; line-height: 1.1;
        }
        .editorial-upcoming-date strong { font-size: 18px; font-weight: 800; }
        .editorial-upcoming-date small {
          font-size: 10px; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .editorial-upcoming-info { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
        .editorial-upcoming-title {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .editorial-upcoming-title em { color: var(--text-muted); font-style: italic; font-weight: 400; }
        .editorial-upcoming-client { font-size: 11px; color: var(--text-muted); }
        .editorial-upcoming-badge { font-size: 18px; text-align: center; }

        /* Planning button */
        .editorial-plan-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 10px;
          border: 1px solid var(--border-color, rgba(255,255,255,0.12));
          background: rgba(255,255,255,0.04); color: var(--text-secondary);
          font: inherit; font-weight: 600; font-size: 13px; cursor: pointer;
          transition: all 0.15s;
        }
        .editorial-plan-btn:hover {
          background: rgba(255,255,255,0.08); color: var(--text-primary);
          border-color: rgba(255,255,255,0.2);
        }

        /* Export button */
        .editorial-export-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 16px; border-radius: 10px;
          border: 1px solid rgba(38,194,129,0.3);
          background: rgba(38,194,129,0.1); color: #26c281;
          font: inherit; font-weight: 700; font-size: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .editorial-export-btn:hover { background: rgba(38,194,129,0.18); }

        /* Planning modal */
        .editorial-plan-modal {
          width: 100%; max-width: 820px; max-height: 94vh;
          background: var(--theme-bg, #0d1110);
          border: 1px solid rgba(190,201,191,0.18);
          border-radius: 22px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 32px 80px rgba(0,0,0,0.4);
        }
        .editorial-plan-modal-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid rgba(190,201,191,0.12);
          gap: 16px;
        }
        .editorial-plan-modal-header h3 {
          font-size: 17px; font-weight: 700; margin: 0 0 3px;
          letter-spacing: -0.01em;
        }
        .editorial-plan-modal-sub {
          font-size: 12px; color: var(--text-muted); margin: 0;
        }
        .editorial-plan-modal-body {
          overflow-y: auto; padding: 20px 24px;
          display: flex; flex-direction: column; gap: 14px; flex: 1;
        }

        /* Plan item card */
        .editorial-plan-item {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(190,201,191,0.12);
          border-radius: 14px; padding: 16px 18px;
          display: flex; flex-direction: column; gap: 0;
        }
        .editorial-plan-item-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .editorial-plan-item-num {
          font-size: 11px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-muted);
        }
        .editorial-plan-remove-btn {
          width: 28px; height: 28px; border-radius: 7px; border: none;
          background: rgba(239,68,68,0.08); color: #f87171;
          cursor: pointer; display: grid; place-items: center; font-size: 16px;
          transition: background 0.15s;
        }
        .editorial-plan-remove-btn:hover { background: rgba(239,68,68,0.16); }

        .editorial-plan-item-grid {
          display: grid;
          grid-template-columns: 1fr 150px 120px 140px;
          gap: 10px;
        }

        .editorial-plan-add-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; align-self: flex-start;
          border: 1px dashed rgba(190,201,191,0.22);
          background: transparent; color: var(--text-muted);
          font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .editorial-plan-add-btn:hover {
          border-color: var(--button-primary, #26c281);
          color: var(--button-primary, #26c281);
          background: rgba(38,194,129,0.04);
        }

        .editorial-plan-count {
          font-size: 12px; color: var(--text-muted);
        }

        /* Light mode — planning */
        :global(.dashboard-light-mode) .editorial-plan-btn {
          background: #ffffff; border-color: rgba(187,202,190,0.86); color: #3d4a41;
        }
        :global(.dashboard-light-mode) .editorial-plan-btn:hover { background: #f8faf9; }
        :global(.dashboard-light-mode) .editorial-plan-modal {
          background: #ffffff; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-plan-modal-header {
          border-bottom-color: rgba(187,202,190,0.5);
        }
        :global(.dashboard-light-mode) .editorial-plan-item {
          background: #f8faf9; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-plan-count { color: #6b7280; }

        /* Plans view */
        .editorial-plans-view {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .editorial-plans-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .editorial-plans-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .editorial-plans-sub {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .editorial-plan-card {
          background: var(--theme-surface, rgba(255,255,255,0.03));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 16px;
          overflow: hidden;
        }
        .editorial-plan-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.07));
        }
        .editorial-plan-card-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .editorial-plan-card-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .editorial-plan-card-meta {
          font-size: 12px;
          color: var(--text-muted);
        }
        .editorial-plan-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .editorial-plan-delete-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(239,68,68,0.2);
          background: rgba(239,68,68,0.08);
          color: #f87171;
          cursor: pointer;
          display: grid;
          place-items: center;
          font-size: 16px;
          transition: background 0.15s;
        }
        .editorial-plan-delete-btn:hover { background: rgba(239,68,68,0.16); }

        .editorial-plan-card-items {
          display: flex;
          flex-direction: column;
        }
        .editorial-plan-card-row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          gap: 12px;
          align-items: start;
          padding: 12px 20px;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.05));
        }
        .editorial-plan-card-row:last-child { border-bottom: none; }
        .editorial-plan-card-num {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-muted);
          padding-top: 2px;
        }
        .editorial-plan-card-row-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .editorial-plan-card-row-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .editorial-plan-card-row-title em { color: var(--text-muted); font-style: italic; font-weight: 400; }
        .editorial-plan-card-row-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .editorial-plan-card-row-meta span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .editorial-plan-card-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          padding-top: 2px;
        }

        /* Light mode */
        :global(.dashboard-light-mode) .editorial-title { color: #1a1c1c; }
        :global(.dashboard-light-mode) .editorial-subtitle { color: #3d4a41; }
        :global(.dashboard-light-mode) .editorial-month-nav,
        :global(.dashboard-light-mode) .editorial-filter-select,
        :global(.dashboard-light-mode) .editorial-view-btn {
          background: #ffffff; border-color: rgba(187,202,190,0.86); color: #1a1c1c;
        }
        :global(.dashboard-light-mode) .editorial-view-btn.active {
          background: var(--button-primary, #26c281); border-color: var(--button-primary, #26c281); color: #fff;
        }
        :global(.dashboard-light-mode) .editorial-calendar {
          background: #ffffff; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-weekdays { background: #f8faf9; }
        :global(.dashboard-light-mode) .editorial-cell {
          border-color: rgba(187,202,190,0.4);
        }
        :global(.dashboard-light-mode) .editorial-cell:hover { background: #f8faf9; }
        :global(.dashboard-light-mode) .editorial-cell-today { background: rgba(38,194,129,0.06); }
        :global(.dashboard-light-mode) .editorial-list-row {
          background: #ffffff; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-list-row:hover { background: #f8faf9; border-color: rgba(38,194,129,0.3); }
        :global(.dashboard-light-mode) .editorial-modal {
          background: #ffffff; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-modal-header { border-bottom-color: rgba(187,202,190,0.5); }
        :global(.dashboard-light-mode) .editorial-modal-close { background: #f3f4f6; color: #3d4a41; }
        :global(.dashboard-light-mode) .editorial-modal-footer { border-top-color: rgba(187,202,190,0.5); }
        :global(.dashboard-light-mode) .editorial-field label { color: #3d4a41; }
        :global(.dashboard-light-mode) .editorial-field input,
        :global(.dashboard-light-mode) .editorial-field select,
        :global(.dashboard-light-mode) .editorial-field textarea {
          background: #f8faf9; border-color: rgba(187,202,190,0.86); color: #1a1c1c;
        }
        :global(.dashboard-light-mode) .editorial-status-chip,
        :global(.dashboard-light-mode) .editorial-platform-chip {
          background: #f8faf9; border-color: rgba(187,202,190,0.86); color: #3d4a41;
        }
        :global(.dashboard-light-mode) .editorial-cancel-btn {
          background: #f3f4f6; border-color: rgba(187,202,190,0.86); color: #3d4a41;
        }
        :global(.dashboard-light-mode) .editorial-list-title { color: #1a1c1c; }
        :global(.dashboard-light-mode) .editorial-list-date strong { color: #1a1c1c; }
        :global(.dashboard-light-mode) .editorial-stat-card,
        :global(.dashboard-light-mode) .editorial-dash-panel {
          background: #ffffff; border-color: rgba(187,202,190,0.72);
        }
        :global(.dashboard-light-mode) .editorial-stat-bar { background: rgba(0,0,0,0.08); }
        :global(.dashboard-light-mode) .editorial-client-bar { background: rgba(0,0,0,0.07); }
        :global(.dashboard-light-mode) .editorial-platform-stat-track { background: rgba(0,0,0,0.07); }
        :global(.dashboard-light-mode) .editorial-upcoming-row { border-top-color: rgba(187,202,190,0.5); }
        :global(.dashboard-light-mode) .editorial-upcoming-title { color: #1a1c1c; }
        :global(.dashboard-light-mode) .editorial-client-name { color: #1a1c1c; }
        :global(.dashboard-light-mode) .editorial-upcoming-date strong { color: #1a1c1c; }
      `}</style>
    </div>
  )
}
