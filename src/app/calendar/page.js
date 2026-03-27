'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function toDateInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10)
}

function toDateTimeInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16)
}

function defaultEventForm() {
  const now = new Date()
  const startDate = addDays(now, 1)
  startDate.setHours(9, 0, 0, 0)
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)

  return {
    id: '',
    summary: '',
    description: '',
    location: '',
    attendees: '',
    allDay: false,
    withMeet: true,
    startDateTime: toDateTimeInputValue(startDate),
    endDateTime: toDateTimeInputValue(endDate),
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(startDate),
  }
}

function buildInitialRange() {
  const today = new Date()
  const end = addDays(today, 30)

  return {
    from: toDateInputValue(today),
    to: toDateInputValue(end),
  }
}

function formatEventDate(event) {
  if (event.allDay) {
    return `${event.startDate}${event.endDate && event.endDate !== event.startDate ? ` ate ${event.endDate}` : ''}`
  }

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const start = event.startDateTime ? formatter.format(new Date(event.startDateTime)) : ''
  const end = event.endDateTime ? formatter.format(new Date(event.endDateTime)) : ''
  return end ? `${start} - ${end}` : start
}

function createEventFormFromEvent(event) {
  return {
    id: event.id,
    summary: event.summary || '',
    description: event.description || '',
    location: event.location || '',
    attendees: Array.isArray(event.attendees) ? event.attendees.join(', ') : '',
    allDay: Boolean(event.allDay),
    withMeet: Boolean(event.meetLink),
    startDateTime: event.startDateTime ? toDateTimeInputValue(new Date(event.startDateTime)) : '',
    endDateTime: event.endDateTime ? toDateTimeInputValue(new Date(event.endDateTime)) : '',
    startDate: event.startDate || '',
    endDate: event.endDate || event.startDate || '',
  }
}

export default function CalendarPage() {
  const { access, loading } = useUser()
  const canViewDashboard = access?.canViewDashboard !== false
  const canEditCalendar = Boolean(access?.canEditIntegrations)
  const [isEmbedded, setIsEmbedded] = useState(false)

  const [connection, setConnection] = useState(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [calendars, setCalendars] = useState([])
  const [selectedCalendarId, setSelectedCalendarId] = useState('primary')
  const [range, setRange] = useState(buildInitialRange)
  const [events, setEvents] = useState([])
  const [isLoadingConnection, setIsLoadingConnection] = useState(true)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isEventModalOpen, setIsEventModalOpen] = useState(false)
  const [eventForm, setEventForm] = useState(defaultEventForm)

  const selectedCalendarSummary = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedCalendarId)?.summary || connection?.selectedCalendarSummary || 'Calendário principal',
    [calendars, selectedCalendarId, connection]
  )

  const loadConnection = useCallback(async () => {
    try {
      setIsLoadingConnection(true)
      setErrorMessage('')

      const response = await fetch('/api/google-calendar/connection', { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar a conexão do Google Calendar.')
      }

      setConnection(data.connection || null)
      setSetupRequired(Boolean(data.setupRequired))
      setSelectedCalendarId(data.connection?.selectedCalendarId || 'primary')
      if (data.setupRequired && data.error) {
        setErrorMessage(data.error)
      }
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar a conexão do Google Calendar.')
    } finally {
      setIsLoadingConnection(false)
    }
  }, [])

  const loadCalendars = useCallback(async () => {
    try {
      const response = await fetch('/api/google-calendar/calendars', { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os calendários.')
      }

      setCalendars(Array.isArray(data.calendars) ? data.calendars : [])
      setSelectedCalendarId(data.selectedCalendarId || connection?.selectedCalendarId || 'primary')
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar os calendários.')
    }
  }, [connection?.selectedCalendarId])

  const loadEvents = useCallback(async () => {
    if (!connection?.connected) {
      setEvents([])
      return
    }

    try {
      setIsLoadingEvents(true)
      setErrorMessage('')

      const params = new URLSearchParams({
        calendarId: selectedCalendarId || 'primary',
        timeMin: new Date(`${range.from}T00:00:00`).toISOString(),
        timeMax: new Date(`${range.to}T23:59:59`).toISOString(),
      })

      const response = await fetch(`/api/google-calendar/events?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os eventos.')
      }

      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível carregar os eventos.')
    } finally {
      setIsLoadingEvents(false)
    }
  }, [connection?.connected, range.from, range.to, selectedCalendarId])

  useEffect(() => {
    if (loading || !canViewDashboard) return
    loadConnection()
  }, [loading, canViewDashboard, loadConnection])

  useEffect(() => {
    if (!connection?.connected) {
      setCalendars([])
      setEvents([])
      return
    }

    loadCalendars()
  }, [connection?.connected, loadCalendars])

  useEffect(() => {
    if (!connection?.connected || !selectedCalendarId) return
    loadEvents()
  }, [connection?.connected, selectedCalendarId, range.from, range.to, loadEvents])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('google_calendar')
    const error = params.get('google_calendar_error')

    if (status === 'connected') {
      setSuccessMessage('Google Calendar conectado com sucesso.')
    }

    if (error) {
      setErrorMessage(error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setIsEmbedded(params.get('embed') === '1')
  }, [])

  const handleConnectGoogle = () => {
    window.location.href = '/api/google-calendar/auth/start?return_to=/calendar'
  }

  const handleDisconnectGoogle = async () => {
    try {
      setErrorMessage('')
      const response = await fetch('/api/google-calendar/connection', { method: 'DELETE' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível desconectar o Google Calendar.')
      }

      setConnection({
        connected: false,
        email: '',
        selectedCalendarId: 'primary',
        selectedCalendarSummary: '',
      })
      setCalendars([])
      setEvents([])
      setSuccessMessage('Google Calendar desconectado.')
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível desconectar o Google Calendar.')
    }
  }

  const handleCalendarSelectionChange = async (calendarId) => {
    const calendar = calendars.find((item) => item.id === calendarId)
    setSelectedCalendarId(calendarId)

    try {
      const response = await fetch('/api/google-calendar/connection', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calendarId,
          calendarSummary: calendar?.summary || 'Calendário principal',
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível atualizar o calendário ativo.')
      }

      setConnection(data.connection || null)
      setSuccessMessage('Calendário ativo atualizado.')
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível atualizar o calendário ativo.')
    }
  }

  const handleOpenNewEvent = () => {
    setEventForm(defaultEventForm())
    setIsEventModalOpen(true)
  }

  const handleOpenEditEvent = (event) => {
    setEventForm(createEventFormFromEvent(event))
    setIsEventModalOpen(true)
  }

  const handleSaveEvent = async (submitEvent) => {
    submitEvent.preventDefault()

    try {
      setIsSavingEvent(true)
      setErrorMessage('')

      const method = eventForm.id ? 'PATCH' : 'POST'
      const endpoint = eventForm.id
        ? `/api/google-calendar/events/${eventForm.id}?calendarId=${encodeURIComponent(selectedCalendarId)}`
        : '/api/google-calendar/events'

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...eventForm,
          calendarId: selectedCalendarId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível salvar o evento.')
      }

      setIsEventModalOpen(false)
      setSuccessMessage(eventForm.id ? 'Evento atualizado com sucesso.' : 'Evento criado com sucesso.')
      await loadEvents()
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível salvar o evento.')
    } finally {
      setIsSavingEvent(false)
    }
  }

  const handleDeleteEvent = async (eventId) => {
    try {
      setErrorMessage('')
      const response = await fetch(`/api/google-calendar/events/${eventId}?calendarId=${encodeURIComponent(selectedCalendarId)}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir o evento.')
      }

      setSuccessMessage('Evento excluído com sucesso.')
      await loadEvents()
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível excluir o evento.')
    }
  }

  const calendarMainContent = (
    <main className={`main-content settings-main ${isEmbedded ? 'calendar-main-embedded' : ''}`}>
      <section className="glass-panel settings-panel calendar-panel">
        <div className="settings-head">
          <div>
            <h1>Google Calendar</h1>
            <p>Conecte a agenda da operação, escolha o calendário ativo e gerencie eventos com link do Google Meet direto pelo app.</p>
          </div>
          <div className="calendar-head-actions">
            {canEditCalendar && connection?.connected && (
              <button type="button" className="btn btn-secondary" onClick={handleDisconnectGoogle}>
                Desconectar conta
              </button>
            )}
            {canEditCalendar && (
              <button type="button" className="btn btn-primary" onClick={handleConnectGoogle}>
                {connection?.connected ? 'Reconectar Google' : 'Conectar Google'}
              </button>
            )}
          </div>
        </div>

        {errorMessage && <div className="form-alert">{errorMessage}</div>}
        {successMessage && <div className="success-banner">{successMessage}</div>}

        {!canViewDashboard ? (
          <div className="empty-panel glass-item">
            <h3>Sem acesso à agenda</h3>
            <p>Seu usuário ainda não possui dashboards liberados neste workspace.</p>
          </div>
        ) : isLoadingConnection ? (
          <div className="empty-panel glass-item">
            <h3>Carregando Google Calendar</h3>
            <p>Estamos verificando a conexão e os calendários disponíveis.</p>
          </div>
        ) : !connection?.connected ? (
          <div className="glass-item calendar-connect-card">
            <div>
              <h2>Nenhuma conta conectada</h2>
              <p>
                {setupRequired
                  ? 'A integração do Google Calendar ainda precisa da migration no Supabase antes da conexão da conta.'
                  : 'Conecte uma conta do Google para listar calendários, criar eventos, editar compromissos e gerar reuniões do Google Meet.'}
              </p>
            </div>
            {canEditCalendar ? (
              <button type="button" className="btn btn-primary" onClick={handleConnectGoogle} disabled={setupRequired}>
                Conectar Google Calendar
              </button>
            ) : (
              <div className="field-helper">
                Somente usuários com permissão de edição podem conectar a agenda.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="settings-grid calendar-grid">
              <div className="glass-item settings-block">
                <h2>Conta conectada</h2>
                <p>Essa conta abastece o calendário do workspace inteiro.</p>
                <div className="calendar-connection-meta">
                  <strong>{connection.email || 'Conta conectada'}</strong>
                  <span>{connection.selectedCalendarSummary || 'Calendário principal'}</span>
                </div>
              </div>

              <div className="glass-item settings-block">
                <h2>Calendário ativo</h2>
                <p>Escolha em qual agenda os eventos devem ser lidos e gravados.</p>
                <select
                  className="client-select-input"
                  value={selectedCalendarId}
                  onChange={(event) => handleCalendarSelectionChange(event.target.value)}
                  disabled={!canEditCalendar}
                >
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.summary}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="glass-item settings-block settings-block-full">
              <div className="calendar-toolbar">
                <div className="calendar-range-grid">
                  <div className="input-group">
                    <label>De</label>
                    <input
                      type="date"
                      value={range.from}
                      onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
                    />
                  </div>
                  <div className="input-group">
                    <label>Até</label>
                    <input
                      type="date"
                      value={range.to}
                      onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
                    />
                  </div>
                </div>

                {canEditCalendar && (
                  <button type="button" className="btn btn-primary" onClick={handleOpenNewEvent}>
                    Novo evento
                  </button>
                )}
              </div>

              {isLoadingEvents ? (
                <div className="empty-panel glass-item compact-empty-state">
                  <h3>Buscando eventos</h3>
                  <p>Estamos carregando a agenda do período selecionado.</p>
                </div>
              ) : !events.length ? (
                <div className="empty-panel glass-item compact-empty-state">
                  <h3>Nenhum evento no período</h3>
                  <p>Não encontramos compromissos no calendário selecionado para esse intervalo.</p>
                </div>
              ) : (
                <div className="calendar-events-grid">
                  {events.map((event) => (
                    <article key={event.id} className="glass-item calendar-event-card">
                      <div className="calendar-event-head">
                        <div>
                          <strong>{event.summary}</strong>
                          <span>{formatEventDate(event)}</span>
                        </div>
                        {canEditCalendar && (
                          <div className="calendar-event-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => handleOpenEditEvent(event)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => handleDeleteEvent(event.id)}>
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>

                      {event.location && <p><strong>Local:</strong> {event.location}</p>}
                      {event.description && <p>{event.description}</p>}
                      {event.attendees.length > 0 && (
                        <p><strong>Convidados:</strong> {event.attendees.join(', ')}</p>
                      )}

                      <div className="calendar-event-links">
                        {event.meetLink && (
                          <a href={event.meetLink} target="_blank" rel="noreferrer" className="btn btn-secondary">
                            Abrir Meet
                          </a>
                        )}
                        {event.htmlLink && (
                          <a href={event.htmlLink} target="_blank" rel="noreferrer" className="btn btn-secondary">
                            Ver no Google
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )

  return (
    <div className={`dashboard-container ${isEmbedded ? 'calendar-shell-embedded' : ''}`}>
      {!isEmbedded ? (
      <aside className="sidebar glass-panel">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <span>Dash</span>
        </div>

        <nav className="nav-menu">
          <Link href="/home" className="nav-item">
            <i className="bx bx-layout"></i>
            Apresentação
          </Link>
          <span className="nav-item active">
            <i className="bx bx-calendar-event"></i>
            Agenda
          </span>
          <Link href="/assistant" className="nav-item">
            <i className="bx bx-bot"></i>
            Assistente
          </Link>
          <Link href="/settings" className="nav-item">
            <i className="bx bx-cog"></i>
            Configurações
          </Link>
          <Link href="/privacy" className="nav-item" target="_blank" rel="noreferrer">
            <i className="bx bx-shield-quarter"></i>
            Política e Privacidade
          </Link>
        </nav>
      </aside>
      ) : null}

      {calendarMainContent}

      {isEventModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEventModalOpen(false)}>
          <div className="modal-card glass-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{eventForm.id ? 'Editar evento' : 'Novo evento'}</h3>
                <p>Gerencie compromissos do Google Calendar sem sair do app.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setIsEventModalOpen(false)} aria-label="Fechar modal de evento">
                <i className="bx bx-x"></i>
              </button>
            </div>

            <form onSubmit={handleSaveEvent}>
              <div className="form-grid user-admin-grid">
                <div className="input-group">
                  <label>Título</label>
                  <input
                    type="text"
                    value={eventForm.summary}
                    onChange={(event) => setEventForm((current) => ({ ...current, summary: event.target.value }))}
                    placeholder="Ex.: Reunião comercial"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Local</label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))}
                    placeholder="Presencial ou remoto"
                  />
                </div>
              </div>

              <div className="form-grid user-admin-grid">
                <div className="input-group">
                  <label>Convidados</label>
                  <input
                    type="text"
                    value={eventForm.attendees}
                    onChange={(event) => setEventForm((current) => ({ ...current, attendees: event.target.value }))}
                    placeholder="email1@empresa.com, email2@empresa.com"
                  />
                </div>
                <div className="input-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={eventForm.allDay}
                      onChange={(event) => setEventForm((current) => ({ ...current, allDay: event.target.checked }))}
                    />
                    Evento de dia inteiro
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={eventForm.withMeet}
                      onChange={(event) => setEventForm((current) => ({ ...current, withMeet: event.target.checked }))}
                    />
                    Gerar Google Meet
                  </label>
                </div>
              </div>

              {eventForm.allDay ? (
                <div className="form-grid user-admin-grid">
                  <div className="input-group">
                    <label>Data inicial</label>
                    <input
                      type="date"
                      value={eventForm.startDate}
                      onChange={(event) => setEventForm((current) => ({ ...current, startDate: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Data final</label>
                    <input
                      type="date"
                      value={eventForm.endDate}
                      onChange={(event) => setEventForm((current) => ({ ...current, endDate: event.target.value }))}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="form-grid user-admin-grid">
                  <div className="input-group">
                    <label>Início</label>
                    <input
                      type="datetime-local"
                      value={eventForm.startDateTime}
                      onChange={(event) => setEventForm((current) => ({ ...current, startDateTime: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Fim</label>
                    <input
                      type="datetime-local"
                      value={eventForm.endDateTime}
                      onChange={(event) => setEventForm((current) => ({ ...current, endDateTime: event.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="input-group">
                <label>Descrição</label>
                <textarea
                  value={eventForm.description}
                  onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Pauta, observações ou contexto da reunião"
                  rows={4}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEventModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingEvent}>
                  {isSavingEvent ? 'Salvando...' : eventForm.id ? 'Atualizar evento' : 'Criar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .calendar-shell-embedded {
          min-height: 100%;
        }

        .settings-main {
          width: 100%;
        }

        .calendar-main-embedded {
          margin-left: 0;
          min-height: 100%;
          padding: 0;
        }

        .settings-panel {
          padding: 32px;
          display: grid;
          gap: 24px;
        }

        .settings-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-head h1 {
          font-size: 30px;
          margin-bottom: 8px;
        }

        .settings-head p,
        .settings-block p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .settings-grid {
          display: grid;
          gap: 20px;
        }

        .settings-block {
          padding: 24px;
          display: grid;
          gap: 18px;
          border-radius: 20px;
        }

        .settings-block-full {
          margin-top: 4px;
        }

        .settings-block h2 {
          font-size: 22px;
        }

        .calendar-panel {
          gap: 1.5rem;
        }

        .calendar-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .calendar-head-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .calendar-connect-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .calendar-connection-meta {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-top: 0.75rem;
        }

        .calendar-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: end;
          margin-bottom: 1rem;
        }

        .calendar-range-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 180px));
          gap: 1rem;
        }

        .calendar-events-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .calendar-event-card {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .calendar-event-card p {
          margin: 0;
          color: var(--text-secondary);
        }

        .calendar-event-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }

        .calendar-event-head strong {
          display: block;
          font-size: 1.15rem;
          margin-bottom: 0.35rem;
        }

        .calendar-event-head span {
          color: var(--text-secondary);
        }

        .calendar-event-actions,
        .calendar-event-links {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .input-group {
          display: grid;
          gap: 8px;
        }

        .input-group label {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .input-group input,
        .input-group textarea,
        .client-select-input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .input-group textarea {
          min-height: 120px;
          padding: 14px;
        }

        .input-group input:focus,
        .input-group textarea:focus,
        .client-select-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .checkbox-group {
          display: flex;
          align-items: end;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .checkbox-group label {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .success-banner {
          padding: 1rem 1.2rem;
          border-radius: 18px;
          border: 1px solid rgba(16, 185, 129, 0.35);
          background: rgba(16, 185, 129, 0.12);
          color: #d1fae5;
        }

        .form-alert {
          padding: 1rem 1.2rem;
          border-radius: 18px;
          border: 1px solid rgba(239, 68, 68, 0.28);
          background: rgba(127, 29, 29, 0.25);
          color: #fecaca;
        }

        .field-helper {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .empty-panel {
          padding: 28px;
          text-align: center;
          display: grid;
          gap: 10px;
        }

        .compact-empty-state {
          padding: 24px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.72);
          backdrop-filter: blur(10px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .modal-card {
          width: min(780px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          padding: 24px;
          display: grid;
          gap: 20px;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .modal-header h3 {
          font-size: 28px;
          margin-bottom: 8px;
        }

        .modal-header p {
          color: var(--text-secondary);
        }

        .modal-close {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 24px;
          flex-shrink: 0;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        @media (max-width: 1024px) {
          .calendar-grid,
          .calendar-events-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .settings-head,
          .calendar-head-actions,
          .calendar-connect-card,
          .calendar-toolbar,
          .calendar-event-head {
            flex-direction: column;
            align-items: stretch;
          }

          .calendar-range-grid {
            grid-template-columns: 1fr;
          }

          .modal-overlay {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  )
}
