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