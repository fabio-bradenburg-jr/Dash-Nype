'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import AssistantPage from '@/app/assistant/page'
import CalendarPage from '@/app/calendar/page'
import { useUser } from '@/lib/contexts/UserContext'
import { createClient } from '@/lib/supabase/client'
import {
  createClientRecord,
  createClientGroupRecord,
  createDashboardTemplate,
  DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS,
  DEFAULT_INTEGRATIONS,
  DEFAULT_PREFERENCES,
  loadDashboardPreferences,
  saveDashboardPreferences,
} from '@/lib/dashboard-storage'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { normalizeAiSettings } from '@/lib/ai-config'
import {
  buildMetaSummaryFromCampaigns,
  campaignMatchesMetaResultFilters,
  extractMetaCampaignMetrics,
  getAvailableMetaResultFilters,
  normalizeMetaResultFilters,
  resolveMetaPrimaryResultKey,
} from '@/lib/meta-metrics'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
)

const THEMES = {
  blue: { main: '#3b82f6', glow: 'rgba(59, 130, 246, 0.18)', surface: 'rgba(59, 130, 246, 0.10)' },
  emerald: { main: '#10b981', glow: 'rgba(16, 185, 129, 0.18)', surface: 'rgba(16, 185, 129, 0.10)' },
  orange: { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.18)', surface: 'rgba(245, 158, 11, 0.10)' },
  rose: { main: '#f43f5e', glow: 'rgba(244, 63, 94, 0.18)', surface: 'rgba(244, 63, 94, 0.10)' },
  slate: { main: '#38bdf8', glow: 'rgba(56, 189, 248, 0.18)', surface: 'rgba(56, 189, 248, 0.10)' },
}

const THEME_LABELS = {
  blue: 'Azul',
  emerald: 'Esmeralda',
  orange: 'Laranja',
  rose: 'Rosa',
  slate: 'Ciano',
}

const AI_INSIGHT_TYPE_LABELS = {
  opportunity: 'Oportunidade',
  alert: 'Alerta',
  anomaly: 'Anomalia',
  win: 'Destaque',
  insight: 'Insight',
}

const AI_CAMPAIGN_STATUS_LABELS = {
  positive: 'Positivo',
  attention: 'Atenção',
  urgent: 'Urgência',
}

function looksLikeJsonBlock(value) {
  const normalized = String(value || '').trim()
  return normalized.startsWith('{') || normalized.startsWith('[')
}

const EMPTY_META_BREAKDOWNS = {
  ages: [],
  states: [],
  cities: [],
  creatives: [],
  geoScope: 'city',
  errors: {
    ages: '',
    states: '',
    cities: '',
    creatives: '',
  },
}

const BRAZIL_MAP_SILHOUETTE_PATH = 'M32 18 L42 10 L58 9 L71 17 L86 14 L101 18 L116 28 L120 42 L128 54 L123 70 L112 81 L107 97 L96 108 L89 124 L77 134 L64 127 L58 114 L49 104 L38 98 L33 84 L25 72 L18 57 L14 41 L18 24 L25 18 Z'

const BRAZIL_STATE_MAP_POINTS = {
  AC: { x: 14, y: 47, name: 'Acre' },
  AL: { x: 83, y: 55, name: 'Alagoas' },
  AP: { x: 75, y: 13, name: 'Amapá' },
  AM: { x: 34, y: 24, name: 'Amazonas' },
  BA: { x: 73, y: 60, name: 'Bahia' },
  CE: { x: 80, y: 42, name: 'Ceará' },
  DF: { x: 54, y: 57, name: 'Distrito Federal' },
  ES: { x: 72, y: 69, name: 'Espírito Santo' },
  GO: { x: 50, y: 55, name: 'Goiás' },
  MA: { x: 68, y: 38, name: 'Maranhão' },
  MT: { x: 40, y: 47, name: 'Mato Grosso' },
  MS: { x: 38, y: 63, name: 'Mato Grosso do Sul' },
  MG: { x: 64, y: 65, name: 'Minas Gerais' },
  PA: { x: 60, y: 26, name: 'Pará' },
  PB: { x: 87, y: 46, name: 'Paraíba' },
  PR: { x: 56, y: 83, name: 'Paraná' },
  PE: { x: 84, y: 50, name: 'Pernambuco' },
  PI: { x: 73, y: 42, name: 'Piauí' },
  RJ: { x: 69, y: 73, name: 'Rio de Janeiro' },
  RN: { x: 88, y: 42, name: 'Rio Grande do Norte' },
  RS: { x: 54, y: 96, name: 'Rio Grande do Sul' },
  RO: { x: 23, y: 40, name: 'Rondônia' },
  RR: { x: 57, y: 7, name: 'Roraima' },
  SC: { x: 58, y: 89, name: 'Santa Catarina' },
  SP: { x: 60, y: 76, name: 'São Paulo' },
  SE: { x: 81, y: 58, name: 'Sergipe' },
  TO: { x: 53, y: 44, name: 'Tocantins' },
}

const BRAZIL_STATE_NAME_TO_UF = Object.fromEntries(
  Object.entries(BRAZIL_STATE_MAP_POINTS).map(([uf, item]) => [item.name, uf])
)

const BRAZIL_CITY_MAP_POINTS = {
  'aracaju': { x: 81, y: 58, state: 'SE' },
  'belem': { x: 60, y: 26, state: 'PA' },
  'belo horizonte': { x: 64, y: 65, state: 'MG' },
  'boa vista': { x: 57, y: 7, state: 'RR' },
  'brasilia': { x: 54, y: 57, state: 'DF' },
  'campinas': { x: 59, y: 74, state: 'SP' },
  'campo grande': { x: 38, y: 63, state: 'MS' },
  'cuiaba': { x: 40, y: 47, state: 'MT' },
  'curitiba': { x: 56, y: 83, state: 'PR' },
  'florianopolis': { x: 58, y: 89, state: 'SC' },
  'fortaleza': { x: 80, y: 42, state: 'CE' },
  'goiania': { x: 50, y: 56, state: 'GO' },
  'joao pessoa': { x: 87, y: 46, state: 'PB' },
  'maceio': { x: 83, y: 55, state: 'AL' },
  'manaus': { x: 34, y: 24, state: 'AM' },
  'natal': { x: 88, y: 42, state: 'RN' },
  'palmas': { x: 53, y: 44, state: 'TO' },
  'porto alegre': { x: 54, y: 96, state: 'RS' },
  'porto velho': { x: 23, y: 40, state: 'RO' },
  'recife': { x: 84, y: 50, state: 'PE' },
  'rio branco': { x: 14, y: 47, state: 'AC' },
  'rio de janeiro': { x: 69, y: 73, state: 'RJ' },
  'salvador': { x: 73, y: 60, state: 'BA' },
  'santos': { x: 61, y: 78, state: 'SP' },
  'sao luis': { x: 68, y: 38, state: 'MA' },
  'sao paulo': { x: 60, y: 76, state: 'SP' },
  'teresina': { x: 73, y: 42, state: 'PI' },
  'vitoria': { x: 72, y: 69, state: 'ES' },
}

function clampColorChannel(value) {
  const numericValue = Number.parseInt(value, 10)
  if (!Number.isFinite(numericValue)) return 0
  return Math.max(0, Math.min(255, numericValue))
}

function hexToRgb(hexValue) {
  const normalized = String(hexValue || '').trim().replace('#', '')
  if (!/^[\da-fA-F]{6}$/.test(normalized)) return null

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const channels = [r, g, b].map((value) => clampColorChannel(value).toString(16).padStart(2, '0'))
  return `#${channels.join('')}`
}

function parseDashboardColor(value) {
  if (!value) return null

  if (THEMES[value]?.main) {
    return hexToRgb(THEMES[value].main)
  }

  const hexMatch = String(value).trim().match(/^#([\da-fA-F]{6})$/)
  if (hexMatch) {
    return hexToRgb(hexMatch[0])
  }

  const rgbMatch = String(value)
    .trim()
    .match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)

  if (rgbMatch) {
    return {
      r: clampColorChannel(rgbMatch[1]),
      g: clampColorChannel(rgbMatch[2]),
      b: clampColorChannel(rgbMatch[3]),
    }
  }

  return null
}

function buildCustomTheme(colorValue) {
  const parsedColor = parseDashboardColor(colorValue) || hexToRgb(THEMES.blue.main)
  const { r, g, b } = parsedColor

  return {
    main: `rgb(${r}, ${g}, ${b})`,
    glow: `rgba(${r}, ${g}, ${b}, 0.18)`,
    surface: `rgba(${r}, ${g}, ${b}, 0.10)`,
  }
}

function resolveDashboardTheme(colorValue) {
  if (THEMES[colorValue]) return THEMES[colorValue]
  return buildCustomTheme(colorValue)
}

function getDashboardColorLabel(colorValue) {
  if (THEME_LABELS[colorValue]) return THEME_LABELS[colorValue]

  const parsedColor = parseDashboardColor(colorValue)
  return parsedColor ? rgbToHex(parsedColor).toUpperCase() : 'Azul'
}

function getNameInitials(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return 'CL'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function getClientStatusMeta(client) {
  if (client?.metaAdAccountId) {
    return {
      label: 'Ativo',
      tone: 'success',
      description: 'Conta operacional conectada',
    }
  }

  if (client?.logoUrl) {
    return {
      label: 'Em setup',
      tone: 'info',
      description: 'Identidade pronta, integração pendente',
    }
  }

  return {
    label: 'Onboarding',
    tone: 'neutral',
    description: 'Configuração inicial em andamento',
  }
}

const METRIC_OPTIONS = {
  spend: { label: 'Investimento', type: 'currency' },
  impressions: { label: 'Impressões', type: 'number' },
  cpm: { label: 'CPM', type: 'currency' },
  reach: { label: 'Alcance', type: 'number' },
  frequency: { label: 'Frequência', type: 'decimal' },
  clicks: { label: 'Cliques no link', type: 'number' },
  landingPageViews: { label: 'Visualização de página de destino', type: 'number' },
  addToCart: { label: 'Adição ao carrinho', type: 'number' },
  initiateCheckout: { label: 'Finalização de compra', type: 'number' },
  cpc: { label: 'CPC', type: 'currency' },
  ctr: { label: 'CTR', type: 'percent' },
  totalConversions: { label: 'Conversões totais', type: 'number' },
  conversionRate: { label: 'Taxa de conversão', type: 'percent' },
  purchaseValue: { label: 'Faturamento', type: 'currency' },
  purchases: { label: 'Compras', type: 'number' },
  leads: { label: 'Leads', type: 'number' },
  messages: { label: 'Mensagens', type: 'number' },
  videoViews: { label: 'Video views', type: 'number' },
  videoViewRate: { label: '% de visualizações', type: 'percent' },
  thruplay: { label: 'Thruplay', type: 'number' },
  hookRate: { label: 'Hook', type: 'percent' },
  cpa: { label: 'CPA', type: 'currency' },
  roas: { label: 'ROAS', type: 'multiplier' },
  landingPageViews: { label: 'Visualização de página de destino', type: 'number' },
}

const DATE_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'maximum', label: 'Todo o histórico' },
  { value: 'custom', label: 'Período personalizado' },
]

const META_RESULT_PERIOD_OPTIONS = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Ano' },
]

const META_RESULT_COMPARISON_OPTIONS = {
  purchases: {
    key: 'purchases',
    title: 'Compras',
    description: 'Compare a curva de compras com o custo por compra no agrupamento que fizer mais sentido para leitura executiva.',
    resultMetricKey: 'purchases',
    costMetricKey: 'cpa',
    resultLabel: 'Compras',
    costLabel: 'Custo por compra',
    resultTone: '#10b981',
    costTone: '#f59e0b',
    icon: 'bx-cart',
  },
  leads: {
    key: 'leads',
    title: 'Cadastros',
    description: 'Veja como os cadastros evoluem junto com o custo por cadastro ao longo do tempo.',
    resultMetricKey: 'leads',
    costMetricKey: 'cpa',
    resultLabel: 'Cadastros',
    costLabel: 'Custo por cadastro',
    resultTone: '#fbbf24',
    costTone: '#38bdf8',
    icon: 'bx-user-plus',
  },
  messages: {
    key: 'messages',
    title: 'Mensagens iniciadas',
    description: 'Acompanhe o volume de mensagens iniciadas contra o custo por mensagem em cada janela de agrupamento.',
    resultMetricKey: 'messages',
    costMetricKey: 'cpa',
    resultLabel: 'Mensagens iniciadas',
    costLabel: 'Custo por mensagem iniciada',
    resultTone: '#3b82f6',
    costTone: '#a855f7',
    icon: 'bx-message-rounded-dots',
  },
  reach: {
    key: 'reach',
    title: 'Alcance',
    description: 'Leia o alcance gerado ao longo do tempo junto com o custo por alcance no agrupamento selecionado.',
    resultMetricKey: 'reachResults',
    costMetricKey: 'costPerReach',
    resultLabel: 'Alcance',
    costLabel: 'Custo por alcance',
    resultTone: '#38bdf8',
    costTone: '#22c55e',
    icon: 'bx-radar',
  },
  truplays: {
    key: 'truplays',
    title: 'TruPlays',
    description: 'Acompanhe a evolução dos TruPlays junto com o custo por TruPlay no período filtrado.',
    resultMetricKey: 'thruplays',
    costMetricKey: 'costPerTruplay',
    resultLabel: 'TruPlays',
    costLabel: 'Custo por TruPlay',
    resultTone: '#a855f7',
    costTone: '#f59e0b',
    icon: 'bx-play-circle',
  },
}

const CLIENT_INTEGRATION_GROUPS = [
  {
    title: 'Google Ads',
    icon: 'bxl-google',
    accent: '#ea4335',
    description: 'Selecione a conta Google Ads referente a este cliente.',
    fields: [
      { name: 'googleAdsAccountId', label: 'Conta Google Ads do cliente', placeholder: '123-456-7890', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'TikTok Ads',
    icon: 'bxl-tiktok',
    accent: '#ff0050',
    description: 'Selecione a conta TikTok Ads que deve compor o dashboard deste cliente.',
    fields: [
      { name: 'tiktokAdsAccountId', label: 'Conta TikTok Ads do cliente', placeholder: '987654321', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'LinkedIn Ads',
    icon: 'bxl-linkedin-square',
    accent: '#0a66c2',
    description: 'Selecione a conta LinkedIn Ads usada por este cliente.',
    fields: [
      { name: 'linkedInAdsAccountId', label: 'Conta LinkedIn Ads do cliente', placeholder: 'urn:li:sponsoredAccount:123', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Google Sheets',
    icon: 'bx-spreadsheet',
    accent: '#22c55e',
    description: 'Cole a URL pública da planilha para transformar colunas numéricas em métricas personalizadas no dashboard.',
    fields: [
      { name: 'googleSheetsUrl', label: 'URL da planilha ou CSV publicado', placeholder: 'https://docs.google.com/spreadsheets/d/...', storage: 'client', type: 'text' },
      { name: 'googleSheetsHeaderRow', label: 'Linha do cabeçalho', placeholder: '1', storage: 'client', type: 'number' },
      { name: 'googleSheetsStatusColumn', label: 'Coluna de status / pipeline', placeholder: 'Status', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'RD Station',
    icon: 'bx-signal-5',
    accent: '#14b8a6',
    description: 'Separe a operação de automação e CRM do RD Station por cliente.',
    fields: [
      { name: 'rdStationToken', label: 'Chave / credencial', placeholder: 'Token do RD Station', storage: 'integrations', type: 'password' },
      { name: 'rdStationAccountId', label: 'Conta / pipeline do cliente', placeholder: 'Conta, funil ou ID do RD', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Salesforce',
    icon: 'bx-cloud',
    accent: '#60a5fa',
    description: 'Mapeie a conta do Salesforce usada na jornada desse cliente.',
    fields: [
      { name: 'salesforceToken', label: 'Chave / credencial', placeholder: 'Token ou access token', storage: 'integrations', type: 'password' },
      { name: 'salesforceAccountId', label: 'Conta / org do cliente', placeholder: 'Org ID, pipeline ou referência', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Agendor',
    icon: 'bx-briefcase-alt-2',
    accent: '#f97316',
    description: 'Deixe o Agendor separado para consultar a origem comercial correta.',
    fields: [
      { name: 'agendorToken', label: 'Chave / credencial', placeholder: 'Token do Agendor', storage: 'integrations', type: 'password' },
      { name: 'agendorAccountId', label: 'Conta / pipeline do cliente', placeholder: 'Pipeline, funil ou ID da conta', storage: 'client', type: 'text' },
    ],
  },
]

const GLOBAL_INTEGRATION_GROUPS = [
  {
    title: 'Meta Ads',
    icon: 'bxl-meta',
    accent: '#0668E1',
    description: 'Chave principal da operação para listar contas e puxar dados da Meta.',
    field: { name: 'metaAccessToken', label: 'Chave da API da Meta', placeholder: 'EAABsbCS1...' },
  },
  {
    title: 'Google Ads',
    icon: 'bxl-google',
    accent: '#ea4335',
    description: 'Credencial global da operação para futuras conexões e listagem de contas.',
    field: { name: 'googleAdsToken', label: 'Token / credencial do Google Ads', placeholder: 'Developer token ou OAuth' },
  },
  {
    title: 'TikTok Ads',
    icon: 'bxl-tiktok',
    accent: '#ff0050',
    description: 'Credencial global da operação para conectar e gerenciar contas do TikTok Ads.',
    field: { name: 'tiktokAdsToken', label: 'Token / credencial do TikTok Ads', placeholder: 'tt_...' },
  },
  {
    title: 'LinkedIn Ads',
    icon: 'bxl-linkedin-square',
    accent: '#0a66c2',
    description: 'Credencial global da operação para trabalhar com contas do LinkedIn Ads.',
    field: { name: 'linkedinAdsToken', label: 'Token OAuth 2.0 do LinkedIn Ads', placeholder: 'AQV...' },
  },
  {
    title: 'ClickUp',
    icon: 'bx-task',
    accent: '#8b5cf6',
    description: 'Token global para consultar listas, tarefas, responsáveis e status operacionais.',
    field: { name: 'clickUpToken', label: 'Token de API do ClickUp', placeholder: 'pk_...' },
  },
  {
    title: 'Monday',
    icon: 'bx-columns',
    accent: '#f59e0b',
    description: 'Token global para consultar boards, itens, status e responsáveis no Monday.',
    field: { name: 'mondayToken', label: 'Token de API do Monday', placeholder: 'Cole aqui o token do Monday' },
  },
]

const META_TEMPLATE_METRIC_OPTIONS = {
  spend: {
    label: 'Investimento',
    type: 'currency',
    icon: 'bx-wallet',
    tone: 'blue',
    description: 'Valor total investido no período filtrado.',
  },
  impressions: {
    label: 'Impressões',
    type: 'number',
    icon: 'bx-show',
    tone: 'purple',
    description: 'Total de impressões entregues no período.',
  },
  clicks: {
    label: 'Cliques no link',
    type: 'number',
    icon: 'bx-pointer',
    tone: 'cyan',
    description: 'Cliques no link dentro das campanhas filtradas.',
  },
  cpc: {
    label: 'CPC',
    type: 'currency',
    icon: 'bx-purchase-tag',
    tone: 'orange',
    description: 'Custo médio por clique.',
  },
  ctr: {
    label: 'CTR',
    type: 'percent',
    icon: 'bx-mouse',
    tone: 'pink',
    description: 'Taxa de cliques sobre impressões.',
  },
  totalConversions: {
    label: 'Conversões totais',
    type: 'number',
    icon: 'bx-line-chart',
    tone: 'gold',
    description: 'Compras, leads e mensagens somadas.',
  },
  reach: {
    label: 'Alcance',
    type: 'number',
    icon: 'bx-radar',
    tone: 'blue',
    description: 'Pessoas alcançadas no período filtrado.',
  },
  cpm: {
    label: 'CPM',
    type: 'currency',
    icon: 'bx-bar-chart-alt-2',
    tone: 'purple',
    description: 'Custo por mil impressões.',
  },
  frequency: {
    label: 'Frequência',
    type: 'decimal',
    icon: 'bx-repeat',
    tone: 'gold',
    description: 'Média de exibições por pessoa alcançada.',
  },
  conversionRate: {
    label: 'Taxa de conversão clique -> conversão',
    type: 'percent',
    icon: 'bx-git-compare',
    tone: 'emerald',
    description: 'Conversões totais divididas pelos cliques no link.',
  },
  averageTicket: {
    label: 'Ticket médio',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'orange',
    description: 'Faturamento atribuído dividido pelas compras.',
  },
  purchaseValue: {
    label: 'Faturamento',
    type: 'currency',
    icon: 'bx-money',
    tone: 'emerald',
    description: 'Valor total das compras atribuídas no período.',
  },
  videoViews: {
    label: 'Video views',
    type: 'number',
    icon: 'bx-play-circle',
    tone: 'pink',
    description: 'Total de visualizações de vídeo reconhecidas pela Meta no período.',
  },
  videoViewRate: {
    label: '% de visualizações',
    type: 'percent',
    icon: 'bx-slideshow',
    tone: 'purple',
    description: 'Percentual de impressões que viraram visualização de vídeo.',
  },
  thruplay: {
    label: 'Thruplay',
    type: 'number',
    icon: 'bx-movie-play',
    tone: 'blue',
    description: 'Quantidade de visualizações qualificadas como Thruplay.',
  },
  hookRate: {
    label: 'Hook',
    type: 'percent',
    icon: 'bx-magnet',
    tone: 'gold',
    description: 'Percentual das visualizações que avançaram pelo menos 25% do vídeo.',
  },
  purchases: {
    label: 'Compras',
    type: 'number',
    icon: 'bx-cart',
    tone: 'emerald',
    description: 'Total de compras atribuídas no período.',
  },
  costPerPurchase: {
    label: 'Custo por compra',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'gold',
    description: 'Investimento dividido pelas compras atribuídas.',
  },
  leads: {
    label: 'Leads',
    type: 'number',
    icon: 'bx-user-plus',
    tone: 'cyan',
    description: 'Cadastros gerados nas campanhas filtradas.',
  },
  costPerLead: {
    label: 'Custo por lead',
    type: 'currency',
    icon: 'bx-purchase-tag',
    tone: 'orange',
    description: 'Investimento dividido pelos leads gerados.',
  },
  messages: {
    label: 'Mensagens iniciadas',
    type: 'number',
    icon: 'bx-chat',
    tone: 'blue',
    description: 'Conversas iniciadas em canais de mensagem.',
  },
  costPerMessage: {
    label: 'Custo por mensagem',
    type: 'currency',
    icon: 'bx-message-square-dots',
    tone: 'pink',
    description: 'Investimento dividido pelas mensagens iniciadas.',
  },
  reachResults: {
    label: 'Alcance qualificado',
    type: 'number',
    icon: 'bx-radar',
    tone: 'blue',
    description: 'Pessoas alcançadas nas campanhas classificadas como alcance.',
  },
  costPerReach: {
    label: 'Custo por alcance',
    type: 'currency',
    icon: 'bx-target-lock',
    tone: 'cyan',
    description: 'Investimento das campanhas de alcance dividido pelas pessoas alcançadas.',
  },
  thruplays: {
    label: 'TruPlays',
    type: 'number',
    icon: 'bx-play-circle',
    tone: 'purple',
    description: 'Resultados de truplay nas campanhas de vídeo.',
  },
  costPerTruplay: {
    label: 'Custo por TruPlay',
    type: 'currency',
    icon: 'bx-movie-play',
    tone: 'gold',
    description: 'Investimento das campanhas de vídeo dividido pelos truplays.',
  },
  clicksWithoutConversion: {
    label: 'Cliques sem conversão',
    type: 'number',
    icon: 'bx-pointer',
    tone: 'purple',
    description: 'Cliques que não viraram compra, lead ou mensagem.',
  },
  roas: {
    label: 'ROAS consolidado',
    type: 'multiplier',
    icon: 'bx-line-chart',
    tone: 'blue',
    description: 'Retorno sobre investimento da leitura filtrada.',
  },
}

const FIXED_META_METRIC_KEYS = new Set([
  'spend',
  'impressions',
  'cpm',
  'reach',
  'frequency',
  'clicks',
  'cpc',
  'ctr',
  'totalConversions',
  'conversionRate',
  'purchaseValue',
  'purchases',
  'costPerPurchase',
  'roas',
  'leads',
  'costPerLead',
  'messages',
  'costPerMessage',
])

const FUNNEL_LIBRARY_EXCLUDED_KEYS = new Set([
  'spend',
  'cpm',
  'frequency',
  'cpc',
  'ctr',
  'conversionRate',
  'purchaseValue',
  'videoViewRate',
  'cpa',
  'roas',
])

const META_CAMPAIGN_TABLE_COLUMN_OPTIONS = {
  spend: { label: 'Investimento', type: 'currency', description: 'Valor investido no período filtrado.' },
  totalConversions: { label: 'Conversões', type: 'number', description: 'Total consolidado de compras, leads e mensagens.' },
  purchases: { label: 'Compras', type: 'number', description: 'Compras atribuídas à campanha.' },
  leads: { label: 'Leads', type: 'number', description: 'Leads atribuídos à campanha.' },
  messages: { label: 'Mensagens', type: 'number', description: 'Mensagens iniciadas atribuídas à campanha.' },
  cpa: { label: 'CPA', type: 'currency', description: 'Custo médio por resultado consolidado.' },
  roas: { label: 'ROAS', type: 'multiplier', description: 'Retorno sobre investimento da campanha.' },
  purchaseValue: { label: 'Faturamento', type: 'currency', description: 'Receita atribuída às compras da campanha.' },
  clicks: { label: 'Cliques', type: 'number', description: 'Cliques registrados no período.' },
  impressions: { label: 'Impressões', type: 'number', description: 'Volume de impressões da campanha.' },
  reach: { label: 'Alcance', type: 'number', description: 'Pessoas alcançadas pela campanha.' },
  ctr: { label: 'CTR', type: 'percent', description: 'Taxa de cliques sobre impressões.' },
  cpc: { label: 'CPC', type: 'currency', description: 'Custo médio por clique.' },
  cpm: { label: 'CPM', type: 'currency', description: 'Custo por mil impressões.' },
  frequency: { label: 'Frequência', type: 'decimal', description: 'Média de exibições por pessoa alcançada.' },
  conversionRate: { label: 'Taxa de conversão', type: 'percent', description: 'Conversão de cliques em resultados.' },
}

const RD_TEMPLATE_METRIC_OPTIONS = {
  opportunityCount: {
    label: 'Oportunidades',
    type: 'number',
    icon: 'bx-bulb',
    tone: 'blue',
    description: 'Leads da safra criada no período que viraram oportunidade.',
  },
  qualifiedOpportunityCount: {
    label: 'Qualificados',
    type: 'number',
    icon: 'bx-filter-alt',
    tone: 'emerald',
    description: 'Oportunidades que passaram pelas etapas qualificadas.',
  },
  wonOpportunityCount: {
    label: 'Vendas da safra criada e fechada no período',
    type: 'number',
    icon: 'bx-badge-check',
    tone: 'emerald',
    description: 'Leads criados no período e vendidos dentro do mesmo período.',
  },
  wonOpportunityRevenue: {
    label: 'Faturamento da safra criada e fechada',
    type: 'currency',
    icon: 'bx-wallet-alt',
    tone: 'orange',
    description: 'Receita da safra criada e convertida dentro do período.',
  },
  avgTicketWonByCreation: {
    label: 'Ticket médio da safra criada e fechada',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'gold',
    description: 'Ticket médio das vendas da safra criada no período.',
  },
  leadToQualifiedRate: {
    label: 'Taxa de oportunidade para qualificados',
    type: 'percent',
    icon: 'bx-transfer-alt',
    tone: 'cyan',
    description: 'Conversão da oportunidade em qualificação.',
  },
  qualifiedToWonRate: {
    label: 'Taxa de qualificados para venda',
    type: 'percent',
    icon: 'bx-badge-check',
    tone: 'emerald',
    description: 'Conversão dos qualificados em venda.',
  },
  leadToWonRate: {
    label: 'Taxa de oportunidade para venda',
    type: 'percent',
    icon: 'bx-line-chart',
    tone: 'blue',
    description: 'Conversão da safra criada em venda.',
  },
  lostOpportunityCount: {
    label: 'Negócios perdidos',
    type: 'number',
    icon: 'bx-x-circle',
    tone: 'pink',
    description: 'Oportunidades perdidas dentro da leitura da safra.',
  },
  wonDeals: {
    label: 'Negociações ganhas fechadas no período',
    type: 'number',
    icon: 'bx-calendar-check',
    tone: 'emerald',
    description: 'Negociações ganhas com fechamento no período selecionado.',
  },
  wonDealsFromPreviousCohorts: {
    label: 'Negociações ganhas de safras anteriores',
    type: 'number',
    icon: 'bx-history',
    tone: 'blue',
    description: 'Negociações fechadas no período de leads criados antes do intervalo.',
  },
  wonRevenue: {
    label: 'Faturamento das negociações fechadas',
    type: 'currency',
    icon: 'bx-wallet-alt',
    tone: 'orange',
    description: 'Receita total das negociações ganhas fechadas no período.',
  },
  avgTicketWon: {
    label: 'Ticket médio das negociações fechadas',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'gold',
    description: 'Ticket médio das negociações ganhas no período.',
  },
  wonRevenueFromPreviousCohorts: {
    label: 'Faturamento de safras anteriores fechadas',
    type: 'currency',
    icon: 'bx-coin-stack',
    tone: 'orange',
    description: 'Receita das negociações de leads de safras anteriores.',
  },
  avgTicketWonPreviousCohorts: {
    label: 'Ticket médio de safras anteriores fechadas',
    type: 'currency',
    icon: 'bx-spreadsheet',
    tone: 'gold',
    description: 'Ticket médio das negociações de safras anteriores.',
  },
  rdFinalSalesCount: {
    label: 'Vendas totais do resultado final',
    type: 'number',
    icon: 'bx-trophy',
    tone: 'emerald',
    description: 'Soma de vendas da safra com vendas de safras anteriores no período.',
  },
  rdFinalRevenue: {
    label: 'Faturamento total do resultado final',
    type: 'currency',
    icon: 'bx-wallet-alt',
    tone: 'orange',
    description: 'Receita final consolidada da leitura comercial.',
  },
  rdFinalAvgTicket: {
    label: 'Ticket médio do resultado final',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'gold',
    description: 'Ticket médio do consolidado final do período.',
  },
  contacts: {
    label: 'Leads totais',
    type: 'number',
    icon: 'bx-user',
    tone: 'blue',
    description: 'Contatos totais retornados pelo RD.',
  },
  contactsInPeriod: {
    label: 'Leads criados no período',
    type: 'number',
    icon: 'bx-calendar',
    tone: 'cyan',
    description: 'Contatos que entraram na base dentro do período.',
  },
  contactsMoved: {
    label: 'Leads movimentados',
    type: 'number',
    icon: 'bx-transfer',
    tone: 'purple',
    description: 'Contatos que avançaram em alguma etapa comercial.',
  },
  qualifiedDeals: {
    label: 'Negócios qualificados',
    type: 'number',
    icon: 'bx-filter-alt',
    tone: 'emerald',
    description: 'Total de negócios que passaram pelas etapas qualificadas.',
  },
  qualifiedContacts: {
    label: 'Contatos qualificados',
    type: 'number',
    icon: 'bx-check-shield',
    tone: 'emerald',
    description: 'Contatos que chegaram em etapas qualificadas.',
  },
  closeRate: {
    label: 'Taxa de fechamento',
    type: 'percent',
    icon: 'bx-badge-check',
    tone: 'emerald',
    description: 'Percentual de negócios fechados com ganho.',
  },
  dealToWonRate: {
    label: 'Taxa de negócio para venda',
    type: 'percent',
    icon: 'bx-line-chart',
    tone: 'blue',
    description: 'Conversão de negócios em vendas.',
  },
  leadToDealRate: {
    label: 'Taxa de lead para negócio',
    type: 'percent',
    icon: 'bx-trending-up',
    tone: 'cyan',
    description: 'Percentual de leads que viraram negócio.',
  },
  sourceConversionRate: {
    label: 'Conversão por origem',
    type: 'percent',
    icon: 'bx-git-branch',
    tone: 'gold',
    description: 'Conversão média da origem filtrada.',
  },
  avgLeadToWonDays: {
    label: 'Tempo médio lead -> venda',
    type: 'duration',
    icon: 'bx-time-five',
    tone: 'orange',
    description: 'Tempo médio total entre entrada do lead e venda.',
  },
  avgDealToWonDays: {
    label: 'Tempo médio negócio -> venda',
    type: 'duration',
    icon: 'bx-timer',
    tone: 'orange',
    description: 'Tempo médio entre criação do negócio e venda.',
  },
  avgLeadToWonDaysFiltered: {
    label: 'Tempo médio lead -> venda (filtro)',
    type: 'duration',
    icon: 'bx-time',
    tone: 'pink',
    description: 'Tempo médio considerando o filtro atual.',
  },
  avgDealToWonDaysFiltered: {
    label: 'Tempo médio negócio -> venda (filtro)',
    type: 'duration',
    icon: 'bx-stopwatch',
    tone: 'pink',
    description: 'Tempo médio por venda dentro do filtro atual.',
  },
  contactsWithDeals: {
    label: 'Contatos com negócio',
    type: 'number',
    icon: 'bx-briefcase-alt',
    tone: 'blue',
    description: 'Quantidade de contatos que geraram negócios.',
  },
  contactsWithWonDeals: {
    label: 'Contatos com venda',
    type: 'number',
    icon: 'bx-trophy',
    tone: 'emerald',
    description: 'Quantidade de contatos com venda ganha.',
  },
  lostContacts: {
    label: 'Contatos perdidos',
    type: 'number',
    icon: 'bx-x-circle',
    tone: 'pink',
    description: 'Contatos marcados como perda na operação.',
  },
}

const FIXED_RD_METRIC_KEYS = new Set([
  'opportunityCount',
  'qualifiedOpportunityCount',
  'wonOpportunityCount',
  'wonOpportunityRevenue',
  'avgTicketWonByCreation',
  'leadToQualifiedRate',
  'qualifiedToWonRate',
  'leadToWonRate',
  'lostOpportunityCount',
  'wonDeals',
  'wonDealsFromPreviousCohorts',
  'wonRevenue',
  'avgTicketWon',
  'wonRevenueFromPreviousCohorts',
  'avgTicketWonPreviousCohorts',
  'rdFinalSalesCount',
  'rdFinalRevenue',
  'rdFinalAvgTicket',
])

const LOWER_IS_BETTER_METRIC_KEYS = new Set([
  'cpc',
  'cpm',
  'cpa',
  'costPerPurchase',
  'costPerLead',
  'costPerMessage',
  'cost_per_purchase',
  'cost_per_lead',
  'cost_per_message',
  'avgLeadToWonDays',
  'avgDealToWonDays',
  'avgLeadToWonDaysFiltered',
  'avgDealToWonDaysFiltered',
  'lostOpportunityCount',
  'lostContacts',
])

const NEUTRAL_TREND_METRIC_KEYS = new Set([
  'spend',
  'impressions',
  'clicks',
  'reach',
  'contacts',
  'contactsInPeriod',
  'contactsMoved',
])

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}%`
}

function formatDecimal(value, decimals = 1) {
  return Number(value || 0).toFixed(decimals).replace('.', ',')
}

function normalizeGeoLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveBrazilStateMeta(label) {
  const normalized = normalizeGeoLabel(label)
  if (!normalized) return null

  const byUf = Object.entries(BRAZIL_STATE_MAP_POINTS).find(([uf]) => uf.toLowerCase() === normalized)
  if (byUf) {
    return {
      uf: byUf[0],
      ...byUf[1],
    }
  }

  const stateEntry = Object.entries(BRAZIL_STATE_NAME_TO_UF).find(([name]) => normalizeGeoLabel(name) === normalized)
  if (!stateEntry) return null

  const uf = stateEntry[1]
  return {
    uf,
    ...BRAZIL_STATE_MAP_POINTS[uf],
  }
}

function resolveBrazilCityMeta(item) {
  const cityKey = normalizeGeoLabel(item?.city || item?.label)
  const regionMeta = resolveBrazilStateMeta(item?.region)

  if (BRAZIL_CITY_MAP_POINTS[cityKey]) {
    return BRAZIL_CITY_MAP_POINTS[cityKey]
  }

  if (regionMeta) {
    return {
      x: regionMeta.x,
      y: regionMeta.y,
      state: regionMeta.uf,
    }
  }

  return null
}

function getMetaBreakdownConversions(item) {
  return Number(item?.custom_metrics?.totalConversions || 0)
}

function getMetaBreakdownResultValue(item, resultMetricKey = 'totalConversions') {
  if (resultMetricKey === 'reachResults') {
    return Number(item?.custom_metrics?.reachResults || item?.custom_metrics?.reach || item?.reach || 0)
  }

  return Number(item?.custom_metrics?.[resultMetricKey] || 0)
}

function getMetaBreakdownAverageCost(item, resultMetricKey = 'totalConversions') {
  const explicitCostMap = {
    totalConversions: Number(item?.custom_metrics?.cpa || 0),
    purchases: Number(item?.custom_metrics?.cost_per_purchase || 0),
    leads: Number(item?.custom_metrics?.cost_per_lead || 0),
    messages: Number(item?.custom_metrics?.cost_per_message || 0),
    reachResults: Number(item?.custom_metrics?.cost_per_reach || 0),
    thruplays: Number(item?.custom_metrics?.cost_per_thruplay || 0),
  }
  const explicitCost = explicitCostMap[resultMetricKey] || 0
  if (explicitCost > 0) return explicitCost

  const results = getMetaBreakdownResultValue(item, resultMetricKey)
  return results > 0 ? Number(item?.spend || 0) / results : 0
}

function getMetaBreakdownConversionRate(item, resultMetricKey = 'totalConversions') {
  const clicks = Number(item?.clicks || 0)
  return clicks > 0 ? (getMetaBreakdownResultValue(item, resultMetricKey) / clicks) * 100 : 0
}

function buildMetaRankingChartLabel(label) {
  const normalizedLabel = String(label || 'Sem nome').trim()
  if (normalizedLabel.length <= 20) return normalizedLabel

  const words = normalizedLabel.split(/\s+/)
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (nextLine.length <= 20) {
      currentLine = nextLine
      return
    }

    if (currentLine) lines.push(currentLine)
    currentLine = word
  })

  if (currentLine) lines.push(currentLine)
  return lines.slice(0, 2)
}

function formatMetaRankingResultLabel(resultLabel = '') {
  return String(resultLabel || 'resultados').trim().toLowerCase()
}

function formatMultiplier(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}x`
}

function formatDurationDays(value) {
  const days = Number(value || 0)
  if (!days) return 'Sem base'
  if (days < 1) return 'Menos de 1 dia'
  return `${days.toFixed(1).replace('.', ',')} dias`
}

function formatDurationHours(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0)))
  if (!totalSeconds) return '0h'

  const totalMinutes = Math.round(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${String(minutes).padStart(2, '0')}min`
}

function formatShortDate(value) {
  const date = parseLocalDateInput(value) || (value ? new Date(value) : null)
  if (!date || Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function normalizeMondayGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getMondayTaskUrgency(task) {
  const explicitLabel = String(task?.priorityLabel || '').trim()
  const explicitRank = Number(task?.priorityRank || 0)

  if (explicitLabel || explicitRank > 0) {
    const safeRank = explicitRank > 0 ? explicitRank : 1
    return {
      label: explicitLabel || 'Prioridade definida',
      rank: safeRank,
      tone: safeRank >= 4 ? 'danger' : safeRank === 3 ? 'warning' : safeRank === 2 ? 'info' : 'neutral',
    }
  }

  const daysOverdue = Number(task?.daysOverdue || 0)
  if (task?.isOverdue && daysOverdue >= 30) return { label: 'Crítica', rank: 5, tone: 'danger' }
  if (task?.isBlocked && task?.isOverdue) return { label: 'Muito alta', rank: 4, tone: 'danger' }
  if (task?.isOverdue) return { label: 'Alta', rank: 4, tone: 'danger' }
  if (task?.isBlocked || task?.isDueSoon) return { label: 'Média', rank: 3, tone: 'warning' }
  return { label: 'Baixa', rank: 1, tone: 'neutral' }
}

function sortMondayTasksForDrilldown(items) {
  return [...(items || [])].sort((left, right) => {
    const leftUrgency = getMondayTaskUrgency(left)
    const rightUrgency = getMondayTaskUrgency(right)

    if (leftUrgency.rank !== rightUrgency.rank) return rightUrgency.rank - leftUrgency.rank
    if (left.isBlocked !== right.isBlocked) return Number(right.isBlocked) - Number(left.isBlocked)
    if ((left.daysOverdue || 0) !== (right.daysOverdue || 0)) return (right.daysOverdue || 0) - (left.daysOverdue || 0)
    if (left.isOverdue !== right.isOverdue) return Number(right.isOverdue) - Number(left.isOverdue)
    if (left.isDueSoon !== right.isDueSoon) return Number(right.isDueSoon) - Number(left.isDueSoon)
    if ((right.trackedSeconds || 0) !== (left.trackedSeconds || 0)) return (right.trackedSeconds || 0) - (left.trackedSeconds || 0)
    return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')
  })
}

function buildMondayDrilldownOwnerGroups(items, ownerFilter, ownerLabel) {
  const sortedItems = sortMondayTasksForDrilldown(items)
  if (!sortedItems.length) return []

  const enrichGroup = (group) => {
    const rankedItems = sortMondayTasksForDrilldown(group.items)
    const topTask = rankedItems[0] || null

    return {
      ...group,
      items: rankedItems,
      overdueCount: rankedItems.filter((task) => task.isOverdue).length,
      blockedCount: rankedItems.filter((task) => task.isBlocked).length,
      dueSoonCount: rankedItems.filter((task) => task.isDueSoon).length,
      topUrgencyRank: topTask ? getMondayTaskUrgency(topTask).rank : 0,
      topDaysOverdue: topTask?.daysOverdue || 0,
    }
  }

  if (ownerFilter && ownerFilter !== 'all') {
    return [enrichGroup({
      key: normalizeMondayGroupKey(ownerFilter) || 'selected-owner',
      owner: ownerLabel || 'Responsável selecionado',
      items: sortedItems,
    })]
  }

  const groups = new Map()

  sortedItems.forEach((task) => {
    const owners = Array.isArray(task.owners) && task.owners.length ? task.owners : ['Sem responsável']
    owners.forEach((owner) => {
      const key = normalizeMondayGroupKey(owner) || 'sem-responsavel'
      const currentGroup = groups.get(key) || {
        key,
        owner: owner || 'Sem responsável',
        items: [],
      }
      currentGroup.items.push(task)
      groups.set(key, currentGroup)
    })
  })

  return Array.from(groups.values())
    .map(enrichGroup)
    .sort((left, right) => {
      if (left.topUrgencyRank !== right.topUrgencyRank) return right.topUrgencyRank - left.topUrgencyRank
      if (left.topDaysOverdue !== right.topDaysOverdue) return right.topDaysOverdue - left.topDaysOverdue
      if (left.overdueCount !== right.overdueCount) return right.overdueCount - left.overdueCount
      if (left.items.length !== right.items.length) return right.items.length - left.items.length
      return String(left.owner || '').localeCompare(String(right.owner || ''), 'pt-BR')
    })
}

function getDatePresetLabel(datePreset, since, until) {
  if (datePreset === 'custom' && since && until) {
    return `${formatShortDate(since)} - ${formatShortDate(until)}`
  }

  const preset = DATE_PRESETS.find((item) => item.value === datePreset)
  return preset?.label || 'Período selecionado'
}

function parseLocalDateInput(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatLocalDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftLocalDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

function getRangeLengthInDays(start, end) {
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.round((endOfDay - startOfDay) / 86400000) + 1)
}

function resolveDateWindow(datePreset, since, until, { excludeTodayForLast30d = false } = {}) {
  const today = new Date()
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  if (datePreset === 'custom' && since && until) {
    const start = parseLocalDateInput(since)
    const end = parseLocalDateInput(until)
    if (!start || !end) return null
    return { start, end }
  }

  switch (datePreset) {
    case 'today':
      return { start: endOfToday, end: endOfToday }
    case 'yesterday': {
      const yesterday = shiftLocalDays(endOfToday, -1)
      return { start: yesterday, end: yesterday }
    }
    case 'last_7d':
      return {
        start: shiftLocalDays(endOfToday, -6),
        end: endOfToday,
      }
    case 'last_30d':
      return excludeTodayForLast30d
        ? {
            start: shiftLocalDays(endOfToday, -30),
            end: shiftLocalDays(endOfToday, -1),
          }
        : {
            start: shiftLocalDays(endOfToday, -29),
            end: endOfToday,
          }
    case 'this_month':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: endOfToday,
      }
    default:
      return null
  }
}

function buildPreviousWindow(currentWindow) {
  if (!currentWindow?.start || !currentWindow?.end) return null

  const totalDays = getRangeLengthInDays(currentWindow.start, currentWindow.end)
  const previousEnd = shiftLocalDays(currentWindow.start, -1)
  const previousStart = shiftLocalDays(previousEnd, -(totalDays - 1))

  return {
    start: previousStart,
    end: previousEnd,
  }
}

function getMetricTrendDirection(metricKey) {
  if (LOWER_IS_BETTER_METRIC_KEYS.has(metricKey)) return 'down'
  if (NEUTRAL_TREND_METRIC_KEYS.has(metricKey)) return 'neutral'
  return 'up'
}

function formatTrendChange(value, type) {
  const absoluteValue = Math.abs(Number(value || 0))

  if (type === 'currency') return formatCurrency(absoluteValue)
  if (type === 'percent') return `${absoluteValue.toFixed(2).replace('.', ',')} p.p.`
  if (type === 'multiplier') return `${absoluteValue.toFixed(2).replace('.', ',')}x`
  if (type === 'decimal') return absoluteValue.toFixed(2).replace('.', ',')
  if (type === 'duration') return formatDurationDays(absoluteValue)
  return formatNumber(absoluteValue)
}

function buildMetricTrend(metricKey, currentValue, previousValue, type) {
  const current = Number(currentValue || 0)
  const previous = Number(previousValue ?? 0)

  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null

  if (current === previous) {
    return {
      tone: 'neutral',
      icon: 'bx-minus',
      label: 'Sem variação vs período anterior',
    }
  }

  const direction = getMetricTrendDirection(metricKey)
  const delta = current - previous
  const movedUp = delta > 0

  if (direction === 'neutral') {
    return {
      tone: 'neutral',
      icon: movedUp ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt',
      label: `${movedUp ? 'Subiu' : 'Caiu'} ${formatTrendChange(delta, type)} vs período anterior`,
    }
  }

  const isPositive = (direction === 'up' && delta > 0) || (direction === 'down' && delta < 0)

  return {
    tone: isPositive ? 'positive' : 'negative',
    icon: isPositive ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt',
    label: `${isPositive ? 'Movimento positivo' : 'Movimento negativo'} de ${formatTrendChange(delta, type)}`,
  }
}

function formatMetricValue(value, metricKey) {
  const type = METRIC_OPTIONS[metricKey]?.type
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(value)
  if (type === 'multiplier') return formatMultiplier(value)
  return formatNumber(value)
}

function formatDashboardMetricValue(value, type) {
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(value)
  if (type === 'multiplier') return formatMultiplier(value)
  if (type === 'decimal') return Number(value || 0).toFixed(2).replace('.', ',')
  if (type === 'duration') return formatDurationDays(value)
  return formatNumber(value)
}

function formatChartAxis(value, metricKey) {
  const type = METRIC_OPTIONS[metricKey]?.type

  if (type === 'currency') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(value || 0))
  }

  if (type === 'percent') return `${Number(value || 0).toFixed(1).replace('.', ',')}%`
  if (type === 'multiplier') return `${Number(value || 0).toFixed(1).replace('.', ',')}x`

  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function haveSameSelection(left = [], right = []) {
  if (left.length !== right.length) return false

  const leftSet = new Set(left)
  return right.every((item) => leftSet.has(item))
}

function normalizeDashboardMetricLayouts(layouts = []) {
  if (!Array.isArray(layouts)) return []

  return layouts
    .filter((item) => typeof item?.metricKey === 'string' && item.metricKey.trim())
    .map((item, index) => ({
      id: item?.id || `dashboard-card-${item.metricKey}-${index}`,
      metricKey: item.metricKey,
      size: item?.size === 'lg' ? 'lg' : 'sm',
    }))
}

function cloneDashboardMetricLayouts(layouts = []) {
  return normalizeDashboardMetricLayouts(layouts).map((item) => ({ ...item }))
}

function haveSameDashboardMetricLayouts(left = [], right = []) {
  const normalizedLeft = normalizeDashboardMetricLayouts(left)
  const normalizedRight = normalizeDashboardMetricLayouts(right)

  if (normalizedLeft.length !== normalizedRight.length) return false

  return normalizedLeft.every((leftItem, index) => {
    const rightItem = normalizedRight[index]
    if (!rightItem) return false

    return (
      leftItem.id === rightItem.id &&
      leftItem.metricKey === rightItem.metricKey &&
      leftItem.size === rightItem.size
    )
  })
}

function normalizeMetaCampaignTableColumnKeys(columnKeys) {
  const normalized = Array.isArray(columnKeys)
    ? Array.from(new Set(columnKeys.filter((columnKey) => typeof columnKey === 'string' && META_CAMPAIGN_TABLE_COLUMN_OPTIONS[columnKey])))
    : []

  return normalized.length ? normalized : [...DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS]
}

function cloneDashboardTemplates(templates = []) {
  return templates.map((template) => ({
    ...template,
    metaMetricKeys: Array.isArray(template?.metaMetricKeys) ? [...template.metaMetricKeys] : [],
    metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(template?.metaCampaignTableColumnKeys),
    rdMetricKeys: Array.isArray(template?.rdMetricKeys) ? [...template.rdMetricKeys] : [],
    sheetsMetricKeys: Array.isArray(template?.sheetsMetricKeys) ? [...template.sheetsMetricKeys] : [],
    metaMetricLayouts: cloneDashboardMetricLayouts(template?.metaMetricLayouts),
    rdMetricLayouts: cloneDashboardMetricLayouts(template?.rdMetricLayouts),
    sheetsMetricLayouts: cloneDashboardMetricLayouts(template?.sheetsMetricLayouts),
  }))
}

function haveSameDashboardTemplates(left = [], right = []) {
  if (left.length !== right.length) return false

  return left.every((leftTemplate, index) => {
    const rightTemplate = right[index]
    if (!rightTemplate) return false

    return (
      leftTemplate.id === rightTemplate.id &&
      leftTemplate.name === rightTemplate.name &&
      haveSameSelection(
        normalizeMetaCampaignTableColumnKeys(leftTemplate.metaCampaignTableColumnKeys),
        normalizeMetaCampaignTableColumnKeys(rightTemplate.metaCampaignTableColumnKeys)
      ) &&
      haveSameDashboardMetricLayouts(leftTemplate.metaMetricLayouts || [], rightTemplate.metaMetricLayouts || []) &&
      haveSameDashboardMetricLayouts(leftTemplate.rdMetricLayouts || [], rightTemplate.rdMetricLayouts || []) &&
      haveSameDashboardMetricLayouts(leftTemplate.sheetsMetricLayouts || [], rightTemplate.sheetsMetricLayouts || [])
    )
  })
}

function normalizeClientGroupClientIds(clientIds = []) {
  if (!Array.isArray(clientIds)) return []
  return Array.from(new Set(clientIds.filter((clientId) => typeof clientId === 'string' && clientId.trim())))
}

function cloneClientGroups(groups = []) {
  return groups.map((group) => ({
    ...group,
    clientIds: normalizeClientGroupClientIds(group?.clientIds),
  }))
}

function haveSameClientGroups(left = [], right = []) {
  if (left.length !== right.length) return false

  return left.every((leftGroup, index) => {
    const rightGroup = right[index]
    if (!rightGroup) return false

    return (
      leftGroup.id === rightGroup.id &&
      leftGroup.name === rightGroup.name &&
      haveSameSelection(normalizeClientGroupClientIds(leftGroup.clientIds), normalizeClientGroupClientIds(rightGroup.clientIds))
    )
  })
}

function getMetricData(metricKey, dayData) {
  switch (metricKey) {
    case 'spend':
      return parseFloat(dayData.spend || 0)
    case 'impressions':
      return parseInt(dayData.impressions || 0, 10)
    case 'reach':
      return parseInt(dayData.reach || 0, 10)
    case 'clicks':
      return parseInt(dayData.clicks || 0, 10)
    case 'landingPageViews':
      return parseInt(dayData.landingPageViews || dayData.custom_metrics?.landingPageViews || 0, 10)
    case 'addToCart':
      return parseInt(dayData.custom_metrics?.addToCart || 0, 10)
    case 'initiateCheckout':
      return parseInt(dayData.custom_metrics?.initiateCheckout || 0, 10)
    case 'cpc':
      return parseFloat(dayData.cpc || 0)
    case 'cpm':
      return parseFloat(dayData.custom_metrics?.cpm || 0)
    case 'frequency':
      return parseFloat(dayData.custom_metrics?.frequency || 0)
    case 'ctr':
      return parseFloat(dayData.ctr || 0)
    case 'totalConversions':
      return parseInt(dayData.custom_metrics?.totalConversions || 0, 10)
    case 'conversionRate':
      return parseFloat(dayData.custom_metrics?.conversionRate || 0)
    case 'purchaseValue':
      return parseFloat(dayData.custom_metrics?.purchaseValue || 0)
    case 'purchases':
      return parseInt(dayData.custom_metrics?.purchases || 0, 10)
    case 'leads':
      return parseInt(dayData.custom_metrics?.leads || 0, 10)
    case 'messages':
      return parseInt(dayData.custom_metrics?.messages || 0, 10)
    case 'videoViews':
      return parseInt(dayData.custom_metrics?.videoViews || 0, 10)
    case 'videoViewRate':
      return parseFloat(dayData.custom_metrics?.videoViewRate || 0)
    case 'thruplay':
      return parseInt(dayData.custom_metrics?.thruplay || 0, 10)
    case 'hookRate':
      return parseFloat(dayData.custom_metrics?.hookRate || 0)
    case 'cpa':
      return parseFloat(dayData.custom_metrics?.cpa || 0)
    case 'roas':
      return parseFloat(dayData.custom_metrics?.roas || 0)
    default:
      return 0
  }
}

function parseMetaSeriesDate(dateString) {
  if (!dateString) return null

  const parsed = new Date(`${dateString}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getStartOfWeek(date) {
  const base = new Date(date)
  const day = base.getDay()
  const diff = day === 0 ? -6 : 1 - day
  base.setDate(base.getDate() + diff)
  base.setHours(0, 0, 0, 0)
  return base
}

function getStartOfQuarter(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1)
}

function getMetaResultBucketMeta(date, grouping) {
  if (!date) return null

  if (grouping === 'day') {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return {
      key: start.toISOString().slice(0, 10),
      start,
      end: start,
      label: start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    }
  }

  if (grouping === 'week') {
    const start = getStartOfWeek(date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    return {
      key: `week-${start.toISOString().slice(0, 10)}`,
      start,
      end,
      label: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
    }
  }

  if (grouping === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      start,
      end,
      label: start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
    }
  }

  if (grouping === 'quarter') {
    const start = getStartOfQuarter(date)
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0)
    const quarter = Math.floor(start.getMonth() / 3) + 1
    return {
      key: `${start.getFullYear()}-Q${quarter}`,
      start,
      end,
      label: `T${quarter} ${start.getFullYear()}`,
    }
  }

  const start = new Date(date.getFullYear(), 0, 1)
  const end = new Date(date.getFullYear(), 11, 31)
  return {
    key: String(start.getFullYear()),
    start,
    end,
    label: String(start.getFullYear()),
  }
}

function buildMetaResultBucketTimeline(dateWindow, grouping) {
  if (!dateWindow?.start || !dateWindow?.end) return []

  const buckets = []
  const cursor = new Date(dateWindow.start.getFullYear(), dateWindow.start.getMonth(), dateWindow.start.getDate())
  const end = new Date(dateWindow.end.getFullYear(), dateWindow.end.getMonth(), dateWindow.end.getDate())
  const seenKeys = new Set()

  while (cursor <= end) {
    const bucketMeta = getMetaResultBucketMeta(cursor, grouping)
    if (bucketMeta && !seenKeys.has(bucketMeta.key)) {
      seenKeys.add(bucketMeta.key)
      buckets.push({
        ...bucketMeta,
        spend: 0,
        results: 0,
      })
    }

    if (grouping === 'day') {
      cursor.setDate(cursor.getDate() + 1)
    } else if (grouping === 'week') {
      cursor.setDate(cursor.getDate() + 7)
    } else if (grouping === 'month') {
      cursor.setMonth(cursor.getMonth() + 1, 1)
    } else if (grouping === 'quarter') {
      cursor.setMonth(cursor.getMonth() + 3, 1)
    } else {
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1)
    }
  }

  return buckets
}

function buildMetaResultComparisonSeries(dailyItems = [], resultMetricKey, grouping = 'week', campaignObjectiveMap = {}, dateWindow = null) {
  const buckets = new Map(
    buildMetaResultBucketTimeline(dateWindow, grouping).map((bucket) => [bucket.key, bucket])
  )

  dailyItems.forEach((dayItem) => {
    const parsedDate = parseMetaSeriesDate(dayItem.date_start)
    const bucketMeta = getMetaResultBucketMeta(parsedDate, grouping)
    if (!bucketMeta) return

    const campaignId = String(dayItem.campaign_id || '').trim()
    const metrics = dayItem.custom_metrics || extractMetaCampaignMetrics(dayItem)

    const spendValue = parseFloat(dayItem.spend || 0)
    const resultValue = resultMetricKey === 'reachResults'
      ? Number(metrics.reachResults || metrics.reach || dayItem.reach || 0)
      : Number(metrics[resultMetricKey] || 0)

    if (!campaignId && resultValue <= 0 && spendValue <= 0) return

    if (!buckets.has(bucketMeta.key)) {
      buckets.set(bucketMeta.key, {
        ...bucketMeta,
        spend: 0,
        results: 0,
      })
    }

    const bucket = buckets.get(bucketMeta.key)
    bucket.spend += spendValue
    bucket.results += resultValue
  })

  return Array.from(buckets.values())
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map((bucket) => ({
      ...bucket,
      cost: bucket.results > 0 ? bucket.spend / bucket.results : 0,
    }))
}

function buildMetaDetailDailySeries(dailyItems = [], dateWindow = null) {
  const points = new Map(
    dailyItems
      .map((item) => {
        const parsedDate = parseMetaSeriesDate(item.date_start)
        if (!parsedDate) return null

        const metrics = item.custom_metrics || extractMetaCampaignMetrics(item)
        const resultMetricKey = item.resultMetricKey || 'totalConversions'
        const results = resultMetricKey === 'reachResults'
          ? Number(metrics.reachResults || metrics.reach || item.reach || 0)
          : Number(metrics[resultMetricKey] || 0)
        const spendValue = parseFloat(item.spend || 0)

        return [
          item.date_start,
          {
            key: item.date_start,
            date: parsedDate,
            label: parsedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
            results,
            spend: spendValue,
            cost: results > 0 ? spendValue / results : 0,
          },
        ]
      })
      .filter(Boolean)
  )

  if (!dateWindow?.start || !dateWindow?.end) {
    return Array.from(points.values()).sort((left, right) => left.date.getTime() - right.date.getTime())
  }

  const filledSeries = []
  const cursor = new Date(dateWindow.start.getFullYear(), dateWindow.start.getMonth(), dateWindow.start.getDate())
  const end = new Date(dateWindow.end.getFullYear(), dateWindow.end.getMonth(), dateWindow.end.getDate())

  while (cursor <= end) {
    const key = formatLocalDateInput(cursor)
    const existingPoint = points.get(key)

    if (existingPoint) {
      filledSeries.push(existingPoint)
    } else {
      filledSeries.push({
        key,
        date: new Date(cursor),
        label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        results: 0,
        spend: 0,
        cost: 0,
      })
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return filledSeries
}

function getSummaryMetricValue(metricKey, summary, customMetrics) {
  switch (metricKey) {
    case 'spend':
      return parseFloat(summary?.spend || 0)
    case 'impressions':
      return parseInt(summary?.impressions || 0, 10)
    case 'reach':
      return parseInt(summary?.reach || 0, 10)
    case 'clicks':
      return parseInt(summary?.clicks || 0, 10)
    case 'landingPageViews':
      return parseInt(summary?.landingPageViews || customMetrics?.landingPageViews || 0, 10)
    case 'addToCart':
      return parseInt(customMetrics?.addToCart || 0, 10)
    case 'initiateCheckout':
      return parseInt(customMetrics?.initiateCheckout || 0, 10)
    case 'cpc':
      return parseFloat(summary?.cpc || 0)
    case 'cpm':
      return parseFloat(customMetrics?.cpm || 0)
    case 'frequency':
      return parseFloat(customMetrics?.frequency || 0)
    case 'ctr':
      return parseFloat(summary?.ctr || 0)
    case 'totalConversions':
      return parseInt(customMetrics?.totalConversions || 0, 10)
    case 'conversionRate':
      return parseFloat(customMetrics?.conversionRate || 0)
    case 'purchaseValue':
      return parseFloat(customMetrics?.purchaseValue || 0)
    case 'purchases':
      return parseInt(customMetrics?.purchases || 0, 10)
    case 'leads':
      return parseInt(customMetrics?.leads || 0, 10)
    case 'messages':
      return parseInt(customMetrics?.messages || 0, 10)
    case 'videoViews':
      return parseInt(customMetrics?.videoViews || 0, 10)
    case 'videoViewRate':
      return parseFloat(customMetrics?.videoViewRate || 0)
    case 'thruplay':
      return parseInt(customMetrics?.thruplay || 0, 10)
    case 'hookRate':
      return parseFloat(customMetrics?.hookRate || 0)
    case 'cpa':
      return parseFloat(customMetrics?.cpa || 0)
    case 'roas':
      return parseFloat(customMetrics?.roas || 0)
    default:
      return 0
  }
}

export default function DashboardPage() {
  const { user, profile, access, loading: userLoading } = useUser()
  const supabase = createClient()
  const dashboardRef = useRef(null)
  const campaignsRef = useRef([])
  const hasOpenedDashboardEntryRef = useRef(false)
  const lastMetaStructureFetchKeyRef = useRef('')
  const lastRdPipelinesFetchKeyRef = useRef('')
  const lastDashboardFetchKeyRef = useRef('')
  const lastBreakdownsFetchKeyRef = useRef('')
  const lastGoogleSheetsFetchKeyRef = useRef('')
  const selectedQualifiedStagesRef = useRef([])
  const rdLeadSourceFiltersRef = useRef([])
  const metaFilteredCampaignIdsRef = useRef([])
  const metaFilteredAdsetIdsRef = useRef([])
  const metaFilteredAdIdsRef = useRef([])

  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [activeTab, setActiveTab] = useState('assistant')
  const [dateRange, setDateRange] = useState('last_7d')
  const [draftDateRange, setDraftDateRange] = useState('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [draftCustomSince, setDraftCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [draftCustomUntil, setDraftCustomUntil] = useState('')
  const [mondayDateRange, setMondayDateRange] = useState('last_7d')
  const [draftMondayDateRange, setDraftMondayDateRange] = useState('last_7d')
  const [mondayCustomSince, setMondayCustomSince] = useState('')
  const [draftMondayCustomSince, setDraftMondayCustomSince] = useState('')
  const [mondayCustomUntil, setMondayCustomUntil] = useState('')
  const [draftMondayCustomUntil, setDraftMondayCustomUntil] = useState('')
  const [themeColor, setThemeColor] = useState('blue')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isHomeToolsExpanded, setIsHomeToolsExpanded] = useState(false)
  const [metric1, setMetric1] = useState('spend')
  const [metric2, setMetric2] = useState('roas')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ACTIVE')
  const [campaignSortBy, setCampaignSortBy] = useState('spend')
  const [isCampaignColumnLibraryOpen, setIsCampaignColumnLibraryOpen] = useState(false)
  const [metaResultFilters, setMetaResultFilters] = useState([])
  const [draftMetaResultFilters, setDraftMetaResultFilters] = useState([])
  const [metaCampaignFilters, setMetaCampaignFilters] = useState([])
  const [draftMetaCampaignFilters, setDraftMetaCampaignFilters] = useState([])
  const [metaAdsetFilters, setMetaAdsetFilters] = useState([])
  const [draftMetaAdsetFilters, setDraftMetaAdsetFilters] = useState([])
  const [metaAdFilters, setMetaAdFilters] = useState([])
  const [draftMetaAdFilters, setDraftMetaAdFilters] = useState([])
  const [isMetaCampaignFilterOpen, setIsMetaCampaignFilterOpen] = useState(false)
  const [isMetaAdsetFilterOpen, setIsMetaAdsetFilterOpen] = useState(false)
  const [isMetaAdFilterOpen, setIsMetaAdFilterOpen] = useState(false)
  const [isRdDiagnosticsOpen, setIsRdDiagnosticsOpen] = useState(false)
  const [isRdSourceFilterOpen, setIsRdSourceFilterOpen] = useState(false)
  const [clients, setClients] = useState([])
  const [clientGroups, setClientGroups] = useState([])
  const [activeClientId, setActiveClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientGroupName, setNewClientGroupName] = useState('')
  const [adAccounts, setAdAccounts] = useState([])
  const [insights, setInsights] = useState(null)
  const [previousInsights, setPreviousInsights] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [dailyCampaignData, setDailyCampaignData] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [metaHierarchy, setMetaHierarchy] = useState([])
  const [breakdowns, setBreakdowns] = useState(EMPTY_META_BREAKDOWNS)
  const [metaResultDrilldown, setMetaResultDrilldown] = useState(null)
  const [metaRankingDrilldown, setMetaRankingDrilldown] = useState(null)
  const [metaSecondaryResultDrilldown, setMetaSecondaryResultDrilldown] = useState(null)
  const [metaRankingDetailDailyData, setMetaRankingDetailDailyData] = useState([])
  const [metaRankingDetailDailyLoading, setMetaRankingDetailDailyLoading] = useState(false)
  const [metaRankingDetailDailyError, setMetaRankingDetailDailyError] = useState('')
  const [metaResultPreviewKey, setMetaResultPreviewKey] = useState('purchases')
  const [metaResultGrouping, setMetaResultGrouping] = useState('week')
  const [isRankingsLoading, setIsRankingsLoading] = useState(false)
  const [rankingsError, setRankingsError] = useState('')
  const [rdSummary, setRdSummary] = useState(null)
  const [previousRdSummary, setPreviousRdSummary] = useState(null)
  const [googleSheetsSummary, setGoogleSheetsSummary] = useState(null)
  const [googleSheetsError, setGoogleSheetsError] = useState('')
  const [clickUpSummary, setClickUpSummary] = useState(null)
  const [clickUpError, setClickUpError] = useState('')
  const [mondaySummary, setMondaySummary] = useState(null)
  const [mondayError, setMondayError] = useState('')
  const [mondayOwnerFilter, setMondayOwnerFilter] = useState('all')
  const [mondayMetricDrilldown, setMondayMetricDrilldown] = useState(null)
  const [expandedMondayGroups, setExpandedMondayGroups] = useState({})
  const [rdPipelines, setRdPipelines] = useState([])
  const [rdPipelineStages, setRdPipelineStages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMetaStructureReady, setIsMetaStructureReady] = useState(false)
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isAiInsightsModalOpen, setIsAiInsightsModalOpen] = useState(false)
  const [isAiInsightsLoading, setIsAiInsightsLoading] = useState(false)
  const [aiInsightsError, setAiInsightsError] = useState('')
  const [aiInsightsResult, setAiInsightsResult] = useState(null)
  const [hasSyncedServerState, setHasSyncedServerState] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dragMetricKey, setDragMetricKey] = useState('')
  const [dragSourceIndex, setDragSourceIndex] = useState(null)
  const [dashboardMetricDragState, setDashboardMetricDragState] = useState(null)
  const [rdPipelineFilter, setRdPipelineFilter] = useState('')
  const [draftRdPipelineFilter, setDraftRdPipelineFilter] = useState('')
  const [rdSellerFilter, setRdSellerFilter] = useState('all')
  const [draftRdSellerFilter, setDraftRdSellerFilter] = useState('all')
  const [rdLeadSourceFilters, setRdLeadSourceFilters] = useState([])
  const [draftRdLeadSourceFilters, setDraftRdLeadSourceFilters] = useState([])
  const [draftFunnelSteps, setDraftFunnelSteps] = useState([])
  const [draftDashboardTemplates, setDraftDashboardTemplates] = useState([])
  const [draftDashboardTemplateId, setDraftDashboardTemplateId] = useState('')
  const [isMetaMetricLibraryOpen, setIsMetaMetricLibraryOpen] = useState(false)
  const [isRdMetricLibraryOpen, setIsRdMetricLibraryOpen] = useState(false)
  const [isSheetsMetricLibraryOpen, setIsSheetsMetricLibraryOpen] = useState(false)
  const [isQualifiedStagesVisible, setIsQualifiedStagesVisible] = useState(false)
  const [usersList, setUsersList] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)
  const [isDashboardEntryModalOpen, setIsDashboardEntryModalOpen] = useState(false)
  const [dashboardEntryClientId, setDashboardEntryClientId] = useState('')
  const [createUserError, setCreateUserError] = useState('')
  const [editUserError, setEditUserError] = useState('')
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'visualizador',
    aiAccessLevel: 'team',
    clientIds: [],
    clientGroupIds: [],
  })
  const [savingUser, setSavingUser] = useState(false)
  const [globalIntegrations, setGlobalIntegrations] = useState({
    ...DEFAULT_PREFERENCES.globalIntegrations,
  })
  const [metaConnection, setMetaConnection] = useState({
    connected: false,
    userId: '',
    userName: '',
    scopes: '',
    expiresAt: '',
  })

  const currentTheme = useMemo(() => resolveDashboardTheme(themeColor), [themeColor])
  const role = access?.role || profile?.role || 'visualizador'
  const canManageUsers = Boolean(access?.canManageUsers)
  const canManageClients = Boolean(access?.canManageClients)
  const canEditIntegrations = Boolean(access?.canEditIntegrations)
  const canViewDashboard = access?.canViewDashboard !== false
  const isMaster = role === 'master'

  useEffect(() => {
    setMondayMetricDrilldown(null)
  }, [mondaySummary, mondayOwnerFilter, mondayDateRange, mondayCustomSince, mondayCustomUntil])

  useEffect(() => {
    setExpandedMondayGroups({})
  }, [mondayMetricDrilldown])

  useEffect(() => {
    setMetaRankingDrilldown(null)
  }, [breakdowns, activeClientId])

  useEffect(() => {
    if (activeTab !== 'home') {
      setIsHomeToolsExpanded(false)
    }
  }, [activeTab])

  useEffect(() => {
    setMetaResultDrilldown(null)
  }, [activeClientId, dateRange, customSince, customUntil, dailyData])

  useEffect(() => {
    const availableKeys = Object.keys(META_RESULT_COMPARISON_OPTIONS)
    if (availableKeys.includes(metaResultPreviewKey)) return
    setMetaResultPreviewKey('purchases')
  }, [metaResultPreviewKey])

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) || null,
    [clients, activeClientId]
  )
  const activeDashboardTemplates = useMemo(
    () => (Array.isArray(activeClient?.dashboardTemplates) ? activeClient.dashboardTemplates : []),
    [activeClient]
  )
  const activeDashboardTemplate = useMemo(() => {
    if (!activeDashboardTemplates.length) return null
    return (
      activeDashboardTemplates.find((template) => template.id === activeClient?.activeDashboardTemplateId) ||
      activeDashboardTemplates[0]
    )
  }, [activeDashboardTemplates, activeClient])
  const activeDraftDashboardTemplates = useMemo(
    () => (Array.isArray(draftDashboardTemplates) ? draftDashboardTemplates : []),
    [draftDashboardTemplates]
  )
  const activeDraftDashboardTemplate = useMemo(() => {
    if (!activeDraftDashboardTemplates.length) return null
    return (
      activeDraftDashboardTemplates.find((template) => template.id === draftDashboardTemplateId) ||
      activeDraftDashboardTemplates[0]
    )
  }, [activeDraftDashboardTemplates, draftDashboardTemplateId])
  const selectedManagedUser = useMemo(
    () => usersList.find((managedUser) => managedUser.id === selectedUserId) || null,
    [usersList, selectedUserId]
  )
  const clientGroupsById = useMemo(
    () =>
      new Map(
        clientGroups.map((group) => [
          group.id,
          {
            ...group,
            clientIds: normalizeClientGroupClientIds(group.clientIds),
          },
        ])
    ),
    [clientGroups]
  )
  const clientIdsSet = useMemo(() => new Set(clients.map((client) => client.id)), [clients])
  const connectedClientsCount = useMemo(
    () => clients.filter((client) => Boolean(client.metaAdAccountId)).length,
    [clients]
  )
  const brandedClientsCount = useMemo(
    () => clients.filter((client) => Boolean(client.logoUrl)).length,
    [clients]
  )
  const pendingClientsCount = useMemo(
    () => clients.filter((client) => !client.metaAdAccountId || !client.logoUrl).length,
    [clients]
  )
  const clientSecurityScore = useMemo(() => {
    if (!clients.length) return 0
    const score = ((connectedClientsCount + brandedClientsCount) / (clients.length * 2)) * 100
    return Math.round(score * 10) / 10
  }, [clients.length, connectedClientsCount, brandedClientsCount])
  const mondayBoardsConfigured = useMemo(
    () =>
      Array.from(new Set(
        String(globalIntegrations.mondayBoardIds || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )).length,
    [globalIntegrations.mondayBoardIds]
  )
  const clickUpListsConfigured = useMemo(
    () =>
      Array.from(new Set(
        String(globalIntegrations.clickUpListIds || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )).length,
    [globalIntegrations.clickUpListIds]
  )
  const homeToolsMenuItems = useMemo(() => {
    const items = [
      { key: 'assistant', label: 'AI Search', helper: 'Copiloto da operação', onClick: () => setActiveTab('assistant') },
      { key: 'apresentacao', label: 'Pitch Deck', helper: activeClient ? activeClient.name : 'Leitura executiva', onClick: () => setActiveTab('apresentacao') },
      { key: 'clickup', label: 'ClickUp', helper: clickUpListsConfigured ? `${formatNumber(clickUpListsConfigured)} listas` : 'Configuração pendente', onClick: () => setActiveTab('clickup') },
      { key: 'monday', label: 'Monday', helper: mondayBoardsConfigured ? `${formatNumber(mondayBoardsConfigured)} boards` : 'Configuração pendente', onClick: () => setActiveTab('monday') },
      { key: 'calendar', label: 'Agenda', helper: 'Rotina operacional', onClick: () => setActiveTab('calendar') },
    ]

    if (canManageClients) {
      items.splice(2, 0, { key: 'clientes', label: 'Clientes', helper: `${formatNumber(clients.length)} na base`, onClick: () => setActiveTab('clientes') })
    }

    if (canManageUsers) {
      items.push({ key: 'usuarios', label: 'Users', helper: `${formatNumber(usersList.length || 0)} usuários`, onClick: () => setActiveTab('usuarios') })
    }

    return items
  }, [activeClient, clickUpListsConfigured, mondayBoardsConfigured, canManageClients, canManageUsers, clients.length, usersList.length])
  const activeIntegrations = activeClient?.integrations || DEFAULT_INTEGRATIONS
  const selectedAdAccount = activeClient?.metaAdAccountId || ''
  const normalizedAiIntegrations = useMemo(
    () => normalizeAiSettings(globalIntegrations),
    [globalIntegrations]
  )
  const isAiInsightsConfigured = Boolean(
    normalizedAiIntegrations.aiAnalysisEnabled &&
    String(normalizedAiIntegrations.aiApiKey || '').trim() &&
    String(normalizedAiIntegrations.aiModel || '').trim() &&
    String(normalizedAiIntegrations.aiBaseUrl || '').trim()
  )
  const aiInsightGroups = useMemo(() => {
    const items = Array.isArray(aiInsightsResult?.structured?.insights) ? aiInsightsResult.structured.insights : []

    return [
      {
        key: 'opportunity',
        title: 'Oportunidades',
        items: items.filter((item) => String(item.type || '').trim().toLowerCase() === 'opportunity'),
      },
      {
        key: 'win',
        title: 'Destaques',
        items: items.filter((item) => String(item.type || '').trim().toLowerCase() === 'win'),
      },
      {
        key: 'alert',
        title: 'Alertas',
        items: items.filter((item) => String(item.type || '').trim().toLowerCase() === 'alert'),
      },
      {
        key: 'anomaly',
        title: 'Anomalias',
        items: items.filter((item) => String(item.type || '').trim().toLowerCase() === 'anomaly'),
      },
      {
        key: 'insight',
        title: 'Leituras gerais',
        items: items.filter((item) => !['opportunity', 'win', 'alert', 'anomaly'].includes(String(item.type || '').trim().toLowerCase())),
      },
    ].filter((group) => group.items.length > 0)
  }, [aiInsightsResult])
  const totalAiInsights = useMemo(
    () => aiInsightGroups.reduce((total, group) => total + group.items.length, 0),
    [aiInsightGroups]
  )
  const aiStructuredHeadline = !looksLikeJsonBlock(aiInsightsResult?.structured?.headline)
    ? aiInsightsResult?.structured?.headline || 'Insight gerado'
    : 'Leitura processada'
  const aiStructuredSummary = !looksLikeJsonBlock(aiInsightsResult?.structured?.summary)
    ? aiInsightsResult?.structured?.summary || ''
    : ''
  const aiHasStructuredInsights = aiInsightGroups.length > 0
  const aiHasNextActions = Array.isArray(aiInsightsResult?.structured?.nextActions) && aiInsightsResult.structured.nextActions.length > 0
  const aiCampaignAnalyses = Array.isArray(aiInsightsResult?.structured?.campaignAnalyses)
    ? aiInsightsResult.structured.campaignAnalyses
    : []
  const aiFocusSummary = useMemo(
    () => aiInsightsResult?.structured?.focusSummary || { positives: [], attention: [], urgency: [] },
    [aiInsightsResult]
  )
  const aiFocusGroups = useMemo(
    () => [
      {
        key: 'positives',
        title: 'Pontos positivos',
        tone: 'positive',
        items: Array.isArray(aiFocusSummary.positives) ? aiFocusSummary.positives : [],
      },
      {
        key: 'attention',
        title: 'Atenção',
        tone: 'attention',
        items: Array.isArray(aiFocusSummary.attention) ? aiFocusSummary.attention : [],
      },
      {
        key: 'urgency',
        title: 'Urgência',
        tone: 'urgent',
        items: Array.isArray(aiFocusSummary.urgency) ? aiFocusSummary.urgency : [],
      },
    ].filter((group) => group.items.length > 0),
    [aiFocusSummary]
  )
  const aiHasStructuredResponse = aiHasStructuredInsights || aiHasNextActions || aiCampaignAnalyses.length > 0 || aiFocusGroups.length > 0
  const aiFallbackTakeaways = useMemo(() => {
    const source = String(aiStructuredSummary || aiInsightsResult?.rawText || '').replace(/\s+/g, ' ').trim()
    if (!source) return []

    return source
      .split(/(?:\.\s+|\!\s+|\?\s+|;\s+)/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((item, index) => ({
        title: index === 0 ? 'Diagnóstico central' : `Leitura ${index + 1}`,
        text: /[.!?]$/.test(item) ? item : `${item}.`,
      }))
  }, [aiStructuredSummary, aiInsightsResult])
  const selectedQualifiedStages = useMemo(
    () => activeClient?.rdQualifiedStages || [],
    [activeClient]
  )
  const activeClientDashboardRgb = useMemo(
    () => parseDashboardColor(activeClient?.dashboardColor || themeColor || 'blue') || hexToRgb(THEMES.blue.main),
    [activeClient?.dashboardColor, themeColor]
  )
  const currentMetaResultWindow = useMemo(
    () => resolveDateWindow(dateRange, customSince, customUntil, { excludeTodayForLast30d: dateRange === 'last_30d' }),
    [dateRange, customSince, customUntil]
  )
  const activeClientDashboardHex = useMemo(
    () => rgbToHex(activeClientDashboardRgb),
    [activeClientDashboardRgb]
  )
  const selectedQualifiedStagesKey = useMemo(
    () => JSON.stringify([...selectedQualifiedStages].sort()),
    [selectedQualifiedStages]
  )
  const hasMetaManualToken = Boolean(String(globalIntegrations.metaAccessToken || '').trim())
  const hasMetaOauthConnection = Boolean(metaConnection.connected)
  const shouldUseMetaOauth =
    hasMetaOauthConnection && (globalIntegrations.metaConnectionMode === 'oauth' || !hasMetaManualToken)
  const metaRequestHeaders = useMemo(() => {
    if (shouldUseMetaOauth || !hasMetaManualToken) return {}

    return {
      'x-meta-access-token': globalIntegrations.metaAccessToken,
    }
  }, [shouldUseMetaOauth, hasMetaManualToken, globalIntegrations.metaAccessToken])
  const metaCredentialSignature = useMemo(
    () =>
      JSON.stringify({
        mode: shouldUseMetaOauth ? 'oauth' : 'manual',
        manualToken: hasMetaManualToken ? globalIntegrations.metaAccessToken : '',
        connectionUserId: metaConnection.userId || '',
        connectionExpiresAt: metaConnection.expiresAt || '',
      }),
    [
      shouldUseMetaOauth,
      hasMetaManualToken,
      globalIntegrations.metaAccessToken,
      metaConnection.userId,
      metaConnection.expiresAt,
    ]
  )
  const hasMetaConfigured = Boolean(selectedAdAccount && (hasMetaManualToken || hasMetaOauthConnection))
  const hasRdConfigured = Boolean(activeIntegrations.rdStationToken)
  const hasSheetsConfigured = Boolean(String(activeClient?.googleSheetsUrl || '').trim())
  const hasClickUpConfigured = Boolean(
    String(globalIntegrations.clickUpToken || '').trim() && String(globalIntegrations.clickUpListIds || '').trim()
  )
  const hasMondayConfigured = Boolean(
    String(globalIntegrations.mondayToken || '').trim() && String(globalIntegrations.mondayBoardIds || '').trim()
  )
  const hasAnyPresentationData =
    hasMetaConfigured || hasRdConfigured || hasSheetsConfigured
  const rdPipelineOptions = useMemo(
    () => (rdPipelines.length ? rdPipelines : rdSummary?.availablePipelines || []),
    [rdPipelines, rdSummary]
  )
  const selectedRdPipeline = useMemo(
    () => rdPipelineOptions.find((pipeline) => pipeline.id === rdPipelineFilter) || null,
    [rdPipelineOptions, rdPipelineFilter]
  )
  const draftSelectedRdPipeline = useMemo(
    () => rdPipelineOptions.find((pipeline) => pipeline.id === draftRdPipelineFilter) || null,
    [rdPipelineOptions, draftRdPipelineFilter]
  )
  const availableRdStages = useMemo(
    () => (rdPipelineStages.length ? rdPipelineStages : rdSummary?.availableStages || []),
    [rdPipelineStages, rdSummary]
  )
  const activeDashboardTemplateId = activeDashboardTemplate?.id || activeDashboardTemplates[0]?.id || ''
  const activeDraftDashboardTemplateId = activeDraftDashboardTemplate?.id || activeDraftDashboardTemplates[0]?.id || ''
  const draftMetaDashboardMetricLayouts = useMemo(
    () => normalizeDashboardMetricLayouts(activeDraftDashboardTemplate?.metaMetricLayouts),
    [activeDraftDashboardTemplate]
  )
  const draftMetaCampaignTableColumnKeys = useMemo(
    () => normalizeMetaCampaignTableColumnKeys(activeDraftDashboardTemplate?.metaCampaignTableColumnKeys),
    [activeDraftDashboardTemplate]
  )
  const draftRdDashboardMetricLayouts = useMemo(
    () => normalizeDashboardMetricLayouts(activeDraftDashboardTemplate?.rdMetricLayouts),
    [activeDraftDashboardTemplate]
  )
  const draftSheetsDashboardMetricLayouts = useMemo(
    () => normalizeDashboardMetricLayouts(activeDraftDashboardTemplate?.sheetsMetricLayouts),
    [activeDraftDashboardTemplate]
  )
  const activeFunnelSteps = useMemo(
    () => activeClient?.funnelSteps || [],
    [activeClient]
  )
  const activeDraftFunnelSteps = useMemo(
    () => (Array.isArray(draftFunnelSteps) ? draftFunnelSteps : []),
    [draftFunnelSteps]
  )
  const availableMetaResultFilters = useMemo(
    () => getAvailableMetaResultFilters(campaigns),
    [campaigns]
  )
  const availableMetaCampaignOptions = useMemo(() => {
    const campaignsWithSpendMap = new Map(
      campaigns
        .filter((campaign) => campaign?.id && Number(campaign.spend || 0) > 0)
        .map((campaign) => [
          campaign.id,
          {
            id: campaign.id,
            name: campaign.name || 'Campanha sem nome',
          },
        ])
    )
    const hierarchyCampaignMap = new Map()

    metaHierarchy.forEach((item) => {
      if (!item?.campaignId || !campaignsWithSpendMap.has(item.campaignId)) return
      if (!hierarchyCampaignMap.has(item.campaignId)) {
        hierarchyCampaignMap.set(item.campaignId, {
          id: item.campaignId,
          name: item.campaignName || 'Campanha sem nome',
        })
      }
    })

    const hierarchyOptions = Array.from(hierarchyCampaignMap.values())

    if (hierarchyOptions.length > 0) {
      return hierarchyOptions.sort((campaignA, campaignB) =>
        campaignA.name.localeCompare(campaignB.name, 'pt-BR')
      )
    }

    return Array.from(campaignsWithSpendMap.values())
      .sort((campaignA, campaignB) => campaignA.name.localeCompare(campaignB.name, 'pt-BR'))
  }, [campaigns, metaHierarchy])
  const activeRdLeadSources = useMemo(() => {
    const sources = rdSummary?.availableSources || []
    if (!sources.length) return []
    if (!rdLeadSourceFilters.length) return sources
    const normalizedFilters = rdLeadSourceFilters.filter((source) => sources.includes(source))
    return normalizedFilters.length > 0 ? normalizedFilters : sources
  }, [rdSummary, rdLeadSourceFilters])
  const rdLeadSourceFiltersKey = useMemo(
    () => JSON.stringify([...rdLeadSourceFilters].sort()),
    [rdLeadSourceFilters]
  )
  const activeDraftRdLeadSources = useMemo(() => {
    const sources = rdSummary?.availableSources || []
    if (!sources.length) return []
    if (!draftRdLeadSourceFilters.length) return sources
    const normalizedFilters = draftRdLeadSourceFilters.filter((source) => sources.includes(source))
    return normalizedFilters.length > 0 ? normalizedFilters : sources
  }, [rdSummary, draftRdLeadSourceFilters])
  const normalizedMetaResultFilters = useMemo(
    () => normalizeMetaResultFilters(metaResultFilters, availableMetaResultFilters.map((item) => item.key)),
    [metaResultFilters, availableMetaResultFilters]
  )
  const normalizedDraftMetaResultFilters = useMemo(
    () => normalizeMetaResultFilters(draftMetaResultFilters, availableMetaResultFilters.map((item) => item.key)),
    [draftMetaResultFilters, availableMetaResultFilters]
  )
  const activeMetaCampaignIds = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)

    if (!availableIds.length) return []
    if (!metaCampaignFilters.length) return availableIds

    const normalizedSelection = metaCampaignFilters.filter((campaignId) => availableIds.includes(campaignId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaCampaignFilters, availableMetaCampaignOptions])
  const activeDraftMetaCampaignIds = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)

    if (!availableIds.length) return []
    if (!draftMetaCampaignFilters.length) return availableIds

    const normalizedSelection = draftMetaCampaignFilters.filter((campaignId) => availableIds.includes(campaignId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaCampaignFilters, availableMetaCampaignOptions])
  const metaFilteredCampaignIds = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaignMatchesMetaResultFilters(campaign, normalizedMetaResultFilters, availableMetaResultFilters.map((item) => item.key)))
        .filter((campaign) => activeMetaCampaignIds.length === 0 || activeMetaCampaignIds.includes(campaign.id))
        .map((campaign) => campaign.id)
        .filter(Boolean),
    [campaigns, normalizedMetaResultFilters, availableMetaResultFilters, activeMetaCampaignIds]
  )
  const metaFilteredCampaignIdsKey = useMemo(
    () => JSON.stringify(metaFilteredCampaignIds),
    [metaFilteredCampaignIds]
  )
  const draftMetaFilteredCampaignIds = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaignMatchesMetaResultFilters(campaign, normalizedDraftMetaResultFilters, availableMetaResultFilters.map((item) => item.key)))
        .filter((campaign) => activeDraftMetaCampaignIds.length === 0 || activeDraftMetaCampaignIds.includes(campaign.id))
        .map((campaign) => campaign.id)
        .filter(Boolean),
    [campaigns, normalizedDraftMetaResultFilters, availableMetaResultFilters, activeDraftMetaCampaignIds]
  )
  const draftMetaResultMatchedCampaignIds = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaignMatchesMetaResultFilters(campaign, normalizedDraftMetaResultFilters, availableMetaResultFilters.map((item) => item.key)))
        .map((campaign) => campaign.id)
        .filter((campaignId) => availableMetaCampaignOptions.some((campaign) => campaign.id === campaignId)),
    [campaigns, normalizedDraftMetaResultFilters, availableMetaResultFilters, availableMetaCampaignOptions]
  )
  const availableMetaAdsetOptions = useMemo(() => {
    const adsetMap = new Map()

    metaHierarchy
      .filter((item) => metaFilteredCampaignIds.length === 0 || metaFilteredCampaignIds.includes(item.campaignId))
      .forEach((item) => {
        if (!item.adsetId) return
        if (!adsetMap.has(item.adsetId)) {
          adsetMap.set(item.adsetId, {
            id: item.adsetId,
            name: item.adsetName || 'Conjunto sem nome',
          })
        }
      })

    return Array.from(adsetMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, metaFilteredCampaignIds])
  const draftAvailableMetaAdsetOptions = useMemo(() => {
    const adsetMap = new Map()

    metaHierarchy
      .filter((item) => draftMetaFilteredCampaignIds.length === 0 || draftMetaFilteredCampaignIds.includes(item.campaignId))
      .forEach((item) => {
        if (!item.adsetId) return
        if (!adsetMap.has(item.adsetId)) {
          adsetMap.set(item.adsetId, {
            id: item.adsetId,
            name: item.adsetName || 'Conjunto sem nome',
          })
        }
      })

    return Array.from(adsetMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, draftMetaFilteredCampaignIds])
  const activeMetaAdsetIds = useMemo(() => {
    const availableIds = availableMetaAdsetOptions.map((adset) => adset.id)

    if (!availableIds.length) return []
    if (!metaAdsetFilters.length) return availableIds

    const normalizedSelection = metaAdsetFilters.filter((adsetId) => availableIds.includes(adsetId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaAdsetFilters, availableMetaAdsetOptions])
  const activeDraftMetaAdsetIds = useMemo(() => {
    const availableIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)

    if (!availableIds.length) return []
    if (!draftMetaAdsetFilters.length) return availableIds

    const normalizedSelection = draftMetaAdsetFilters.filter((adsetId) => availableIds.includes(adsetId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaAdsetFilters, draftAvailableMetaAdsetOptions])
  const availableMetaAdOptions = useMemo(() => {
    const adMap = new Map()

    metaHierarchy
      .filter((item) => metaFilteredCampaignIds.length === 0 || metaFilteredCampaignIds.includes(item.campaignId))
      .filter((item) => activeMetaAdsetIds.length === 0 || activeMetaAdsetIds.includes(item.adsetId))
      .forEach((item) => {
        if (!item.adId) return
        if (!adMap.has(item.adId)) {
          adMap.set(item.adId, {
            id: item.adId,
            name: item.adName || 'Anúncio sem nome',
          })
        }
      })

    return Array.from(adMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, metaFilteredCampaignIds, activeMetaAdsetIds])
  const draftAvailableMetaAdOptions = useMemo(() => {
    const adMap = new Map()

    metaHierarchy
      .filter((item) => draftMetaFilteredCampaignIds.length === 0 || draftMetaFilteredCampaignIds.includes(item.campaignId))
      .filter((item) => activeDraftMetaAdsetIds.length === 0 || activeDraftMetaAdsetIds.includes(item.adsetId))
      .forEach((item) => {
        if (!item.adId) return
        if (!adMap.has(item.adId)) {
          adMap.set(item.adId, {
            id: item.adId,
            name: item.adName || 'Anúncio sem nome',
          })
        }
      })

    return Array.from(adMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, draftMetaFilteredCampaignIds, activeDraftMetaAdsetIds])
  const activeMetaAdIds = useMemo(() => {
    const availableIds = availableMetaAdOptions.map((ad) => ad.id)

    if (!availableIds.length) return []
    if (!metaAdFilters.length) return availableIds

    const normalizedSelection = metaAdFilters.filter((adId) => availableIds.includes(adId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaAdFilters, availableMetaAdOptions])
  const activeDraftMetaAdIds = useMemo(() => {
    const availableIds = draftAvailableMetaAdOptions.map((ad) => ad.id)

    if (!availableIds.length) return []
    if (!draftMetaAdFilters.length) return availableIds

    const normalizedSelection = draftMetaAdFilters.filter((adId) => availableIds.includes(adId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaAdFilters, draftAvailableMetaAdOptions])
  const metaCampaignFilterSummary = useMemo(() => {
    const totalCampaigns = availableMetaCampaignOptions.length
    const selectedCount = activeDraftMetaCampaignIds.length

    if (!totalCampaigns) return 'Nenhuma campanha disponível'
    if (selectedCount === totalCampaigns) return 'Todas as campanhas'
    if (selectedCount === 1) {
      return availableMetaCampaignOptions.find((campaign) => campaign.id === activeDraftMetaCampaignIds[0])?.name || '1 campanha selecionada'
    }

    return `${selectedCount} campanhas selecionadas`
  }, [availableMetaCampaignOptions, activeDraftMetaCampaignIds])
  const metaAdsetFilterSummary = useMemo(() => {
    const totalAdsets = draftAvailableMetaAdsetOptions.length
    const selectedCount = activeDraftMetaAdsetIds.length

    if (!totalAdsets) return 'Nenhum conjunto disponível'
    if (selectedCount === totalAdsets) return 'Todos os conjuntos'
    if (selectedCount === 1) {
      return draftAvailableMetaAdsetOptions.find((adset) => adset.id === activeDraftMetaAdsetIds[0])?.name || '1 conjunto selecionado'
    }

    return `${selectedCount} conjuntos selecionados`
  }, [draftAvailableMetaAdsetOptions, activeDraftMetaAdsetIds])
  const metaAdFilterSummary = useMemo(() => {
    const totalAds = draftAvailableMetaAdOptions.length
    const selectedCount = activeDraftMetaAdIds.length

    if (!totalAds) return 'Nenhum anúncio disponível'
    if (selectedCount === totalAds) return 'Todos os anúncios'
    if (selectedCount === 1) {
      return draftAvailableMetaAdOptions.find((ad) => ad.id === activeDraftMetaAdIds[0])?.name || '1 anúncio selecionado'
    }

    return `${selectedCount} anúncios selecionados`
  }, [draftAvailableMetaAdOptions, activeDraftMetaAdIds])
  const rdLeadSourceFilterSummary = useMemo(() => {
    const totalSources = rdSummary?.availableSources?.length || 0
    const selectedCount = activeDraftRdLeadSources.length

    if (!totalSources) return 'Nenhuma origem disponível'
    if (selectedCount === totalSources) return 'Todas as origens'
    if (selectedCount === 1) return activeDraftRdLeadSources[0] || '1 origem selecionada'

    return `${selectedCount} origens selecionadas`
  }, [rdSummary, activeDraftRdLeadSources])
  const rdPipelineFilterSummary = useMemo(() => {
    const totalPipelines = rdPipelineOptions.length

    if (!totalPipelines) return 'Nenhum funil disponível'
    if (!draftRdPipelineFilter) return 'Todos os funis'
    return draftSelectedRdPipeline?.name || 'Funil selecionado'
  }, [rdPipelineOptions, draftRdPipelineFilter, draftSelectedRdPipeline])
  const rdAppliedPipelineSummary = useMemo(() => {
    const totalPipelines = rdPipelineOptions.length

    if (!totalPipelines) return 'Nenhum funil disponível'
    if (!rdPipelineFilter) return 'Todos os funis'
    return selectedRdPipeline?.name || 'Funil selecionado'
  }, [rdPipelineOptions, rdPipelineFilter, selectedRdPipeline])
  const hasPendingDashboardFilters = useMemo(() => {
    const hasDateRangeChanges = draftDateRange !== dateRange
    const hasCustomDateChanges =
      (draftDateRange === 'custom' || dateRange === 'custom') &&
      (draftCustomSince !== customSince || draftCustomUntil !== customUntil)
    const hasResultChanges = !haveSameSelection(normalizedDraftMetaResultFilters, normalizedMetaResultFilters)
    const hasCampaignChanges = !haveSameSelection(activeDraftMetaCampaignIds, activeMetaCampaignIds)
    const hasAdsetChanges = !haveSameSelection(activeDraftMetaAdsetIds, activeMetaAdsetIds)
    const hasAdChanges = !haveSameSelection(activeDraftMetaAdIds, activeMetaAdIds)
    const hasPipelineChanges = draftRdPipelineFilter !== rdPipelineFilter
    const hasSellerChanges = draftRdSellerFilter !== rdSellerFilter
    const hasLeadSourceChanges = !haveSameSelection(activeDraftRdLeadSources, activeRdLeadSources)
    const hasFunnelChanges = !haveSameSelection(activeDraftFunnelSteps, activeFunnelSteps)
    const hasTemplateSelectionChanges = activeDraftDashboardTemplateId !== activeDashboardTemplateId
    const hasTemplateContentChanges = !haveSameDashboardTemplates(activeDraftDashboardTemplates, activeDashboardTemplates)

    return (
      hasDateRangeChanges ||
      hasCustomDateChanges ||
      hasResultChanges ||
      hasCampaignChanges ||
      hasAdsetChanges ||
      hasAdChanges ||
      hasPipelineChanges ||
      hasSellerChanges ||
      hasLeadSourceChanges ||
      hasFunnelChanges ||
      hasTemplateSelectionChanges ||
      hasTemplateContentChanges
    )
  }, [
    draftDateRange,
    dateRange,
    draftCustomSince,
    customSince,
    draftCustomUntil,
    customUntil,
    normalizedDraftMetaResultFilters,
    normalizedMetaResultFilters,
    activeDraftMetaCampaignIds,
    activeMetaCampaignIds,
    activeDraftMetaAdsetIds,
    activeMetaAdsetIds,
    activeDraftMetaAdIds,
    activeMetaAdIds,
    draftRdPipelineFilter,
    rdPipelineFilter,
    draftRdSellerFilter,
    rdSellerFilter,
    activeDraftRdLeadSources,
    activeRdLeadSources,
    activeDraftFunnelSteps,
    activeFunnelSteps,
    activeDraftDashboardTemplateId,
    activeDashboardTemplateId,
    activeDraftDashboardTemplates,
    activeDashboardTemplates,
  ])
  const hasPendingMondayFilters = useMemo(() => {
    const hasDateRangeChanges = draftMondayDateRange !== mondayDateRange
    const hasCustomDateChanges =
      (draftMondayDateRange === 'custom' || mondayDateRange === 'custom') &&
      (draftMondayCustomSince !== mondayCustomSince || draftMondayCustomUntil !== mondayCustomUntil)

    return hasDateRangeChanges || hasCustomDateChanges
  }, [
    draftMondayDateRange,
    mondayDateRange,
    draftMondayCustomSince,
    mondayCustomSince,
    draftMondayCustomUntil,
    mondayCustomUntil,
  ])
  const isApplyDashboardFiltersDisabled =
    !hasPendingDashboardFilters || (draftDateRange === 'custom' && (!draftCustomSince || !draftCustomUntil))
  const isApplyMondayFiltersDisabled =
    !hasPendingMondayFilters || (draftMondayDateRange === 'custom' && (!draftMondayCustomSince || !draftMondayCustomUntil))
  const roleLabels = {
    master: 'Master',
    operador: 'Operador',
    cliente: 'Cliente',
    visualizador: 'Visualizador',
  }
  const aiAccessLabels = {
    master: 'IA Master',
    team: 'IA Time',
  }

  useEffect(() => {
    const preferences = loadDashboardPreferences()
    const initialClients = preferences.clients?.length
      ? preferences.clients
      : [createClientRecord({ name: 'Cliente demo' })]
    const initialActiveClientId = preferences.activeClientId || initialClients[0]?.id || ''

    setThemeColor(preferences.themeColor)
    setMetric1(preferences.metric1)
    setMetric2(preferences.metric2)
    setGlobalIntegrations(
      {
        ...DEFAULT_PREFERENCES.globalIntegrations,
        ...(preferences.globalIntegrations || {}),
        ...normalizeAiSettings(preferences.globalIntegrations || {}),
      }
    )
    setClients(initialClients)
    setClientGroups(Array.isArray(preferences.clientGroups) ? cloneClientGroups(preferences.clientGroups) : [])
    setActiveClientId(initialActiveClientId)
    setHasLoadedPreferences(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedPreferences || userLoading || !user) return

    let cancelled = false

    const loadMetaConnection = async () => {
      try {
        const response = await fetch('/api/meta/connection', { cache: 'no-store' })
        const data = await response.json().catch(() => null)

        if (cancelled) return

        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível carregar a conexão da Meta.')
        }

        setMetaConnection(
          data?.connection || {
            connected: false,
            userId: '',
            userName: '',
            scopes: '',
            expiresAt: '',
          }
        )
      } catch (error) {
        if (cancelled) return
        console.error('Erro ao carregar conexão da Meta:', error)
        setMetaConnection({
          connected: false,
          userId: '',
          userName: '',
          scopes: '',
          expiresAt: '',
        })
      }
    }

    loadMetaConnection()

    return () => {
      cancelled = true
    }
  }, [hasLoadedPreferences, userLoading, user])

  useEffect(() => {
    if (!activeClient?.dashboardColor) return
    setThemeColor(activeClient.dashboardColor)
  }, [activeClient])

  useEffect(() => {
    campaignsRef.current = campaigns
  }, [campaigns])

  useEffect(() => {
    selectedQualifiedStagesRef.current = selectedQualifiedStages
  }, [selectedQualifiedStages])

  useEffect(() => {
    const nextPipelineId = activeClient?.rdPipelineId || ''
    setRdPipelineFilter(nextPipelineId)
    setDraftRdPipelineFilter(nextPipelineId)
  }, [activeClientId, activeClient?.rdPipelineId])

  useEffect(() => {
    rdLeadSourceFiltersRef.current = rdLeadSourceFilters
  }, [rdLeadSourceFilters])

  useEffect(() => {
    setDraftDateRange(dateRange)
    setDraftCustomSince(customSince)
    setDraftCustomUntil(customUntil)
    setDraftMetaResultFilters(metaResultFilters)
    setDraftMetaCampaignFilters(metaCampaignFilters)
    setDraftMetaAdsetFilters(metaAdsetFilters)
    setDraftMetaAdFilters(metaAdFilters)
    setDraftRdPipelineFilter(rdPipelineFilter)
    setDraftRdSellerFilter(rdSellerFilter)
    setDraftRdLeadSourceFilters(rdLeadSourceFilters)
    setDraftFunnelSteps(activeFunnelSteps)
    setDraftDashboardTemplates(cloneDashboardTemplates(activeDashboardTemplates))
    setDraftDashboardTemplateId(activeDashboardTemplateId)
  }, [
    dateRange,
    customSince,
    customUntil,
    metaResultFilters,
    metaCampaignFilters,
    metaAdsetFilters,
    metaAdFilters,
    rdPipelineFilter,
    rdSellerFilter,
    rdLeadSourceFilters,
    activeFunnelSteps,
    activeDashboardTemplates,
    activeDashboardTemplateId,
    activeClientId,
    selectedAdAccount,
  ])

  useEffect(() => {
    const availableCampaignIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
    if (!availableCampaignIds.length) return

    const matchedCampaignIds = draftMetaResultMatchedCampaignIds.filter((campaignId) => availableCampaignIds.includes(campaignId))
    const nextCampaignSelection =
      matchedCampaignIds.length === availableCampaignIds.length ? [] : matchedCampaignIds

    if (haveSameSelection(draftMetaCampaignFilters, nextCampaignSelection)) return

    setDraftMetaCampaignFilters(nextCampaignSelection)
    setDraftMetaAdsetFilters([])
    setDraftMetaAdFilters([])
  }, [normalizedDraftMetaResultFilters, availableMetaCampaignOptions, draftMetaResultMatchedCampaignIds, draftMetaCampaignFilters])

  useEffect(() => {
    setDraftMondayDateRange(mondayDateRange)
    setDraftMondayCustomSince(mondayCustomSince)
    setDraftMondayCustomUntil(mondayCustomUntil)
  }, [mondayDateRange, mondayCustomSince, mondayCustomUntil])

  useEffect(() => {
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
    setIsSheetsMetricLibraryOpen(false)
    setIsCampaignColumnLibraryOpen(false)
  }, [activeClientId, activeDashboardTemplate?.id])

  useEffect(() => {
    if (activeTab !== 'apresentacao') {
      hasOpenedDashboardEntryRef.current = false
      setIsDashboardEntryModalOpen(false)
      return
    }

    if (clients.length <= 1) {
      setIsDashboardEntryModalOpen(false)
      return
    }

    if (hasOpenedDashboardEntryRef.current) {
      return
    }

    hasOpenedDashboardEntryRef.current = true
    setDashboardEntryClientId(activeClientId || clients[0]?.id || '')
    setIsDashboardEntryModalOpen(true)
  }, [activeTab, activeClientId, clients])

  useEffect(() => {
    if (activeTab === 'clientes' && !canManageClients) {
      setActiveTab('home')
    }

    if (activeTab === 'usuarios' && !canManageUsers) {
      setActiveTab('home')
    }

    if (activeTab === 'integracoes') {
      setActiveTab('home')
    }
  }, [activeTab, canManageClients, canManageUsers])

  useEffect(() => {
    const sellers = rdSummary?.sellers || []

    if (!sellers.length) {
      setRdSellerFilter('all')
      setDraftRdSellerFilter('all')
      return
    }

    if (rdSellerFilter !== 'all' && !sellers.some((seller) => seller.id === rdSellerFilter)) {
      setRdSellerFilter('all')
    }
    if (draftRdSellerFilter !== 'all' && !sellers.some((seller) => seller.id === draftRdSellerFilter)) {
      setDraftRdSellerFilter('all')
    }
  }, [rdSummary, rdSellerFilter, draftRdSellerFilter])

  useEffect(() => {
    if (activeTab !== 'clientes' && activeTab !== 'apresentacao') {
      lastRdPipelinesFetchKeyRef.current = ''
      return
    }

    if (!activeClientId || !activeIntegrations.rdStationToken) {
      lastRdPipelinesFetchKeyRef.current = ''
      setRdPipelines([])
      setRdPipelineStages([])
      return
    }

    let cancelled = false

    const loadRdPipelines = async () => {
      try {
        const selectedPipelineId = activeClient?.rdPipelineId || ''
        const fetchKey = JSON.stringify({
          activeClientId,
          rdToken: activeIntegrations.rdStationToken,
          selectedPipelineId,
        })

        if (lastRdPipelinesFetchKeyRef.current === fetchKey) {
          return
        }

        lastRdPipelinesFetchKeyRef.current = fetchKey

        const params = new URLSearchParams()
        if (selectedPipelineId) {
          params.set('pipeline_id', selectedPipelineId)
        }

        const response = await fetch(`/api/rd/pipelines${params.toString() ? `?${params.toString()}` : ''}`, {
          headers: {
            'x-rd-station-token': activeIntegrations.rdStationToken,
          },
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Não foi possível carregar os funis do RD Station.')
        }

        if (cancelled) return

        setRdPipelines(Array.isArray(data?.pipelines) ? data.pipelines : [])
        setRdPipelineStages(Array.isArray(data?.stages) ? data.stages : [])
      } catch (error) {
        if (cancelled) return
        setRdPipelines([])
        setRdPipelineStages([])
        setErrorMessage(error.message || 'Não foi possível carregar os funis do RD Station.')
      }
    }

    loadRdPipelines()

    return () => {
      cancelled = true
    }
  }, [activeTab, activeClientId, activeClient?.rdPipelineId, activeIntegrations.rdStationToken])

  useEffect(() => {
    if (!hasLoadedPreferences || userLoading || !user || hasSyncedServerState) return

    const syncFromServer = async () => {
      try {
        const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
        if (!response.ok) {
          setHasSyncedServerState(true)
          return
        }

        const state = await response.json()

        setThemeColor(state.themeColor || 'blue')
        setMetric1(state.metric1 || 'spend')
        setMetric2(state.metric2 || 'roas')
        setGlobalIntegrations((current) => {
          const nextIntegrations = {
            ...current,
            ...(state.globalIntegrations || {}),
          }

          return {
            ...nextIntegrations,
            ...normalizeAiSettings(nextIntegrations),
          }
        })
        setClients(Array.isArray(state.clients) ? state.clients : [])
        setClientGroups(Array.isArray(state.clientGroups) ? cloneClientGroups(state.clientGroups) : [])
        setActiveClientId(state.activeClientId || state.clients?.[0]?.id || '')
      } catch (error) {
        console.error('Erro ao sincronizar estado do servidor:', error)
      } finally {
        setHasSyncedServerState(true)
      }
    }

    syncFromServer()
  }, [hasLoadedPreferences, userLoading, user, hasSyncedServerState])

  useEffect(() => {
    if (!hasLoadedPreferences) return

    const state = {
      themeColor,
      metric1,
      metric2,
      activeClientId,
      globalIntegrations,
      clients,
      clientGroups,
    }

    saveDashboardPreferences(state)

    if (userLoading || !user || !canManageClients || !hasSyncedServerState) return

    const timeoutId = window.setTimeout(() => {
      fetch('/api/dashboard/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }).catch((error) => {
        console.error('Erro ao salvar estado no servidor:', error)
      })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [hasLoadedPreferences, themeColor, metric1, metric2, activeClientId, globalIntegrations, clients, clientGroups, userLoading, user, canManageClients, hasSyncedServerState])

  useEffect(() => {
    ChartJS.defaults.color = '#94a3b8'
    ChartJS.defaults.font.family = "'Inter', sans-serif"
  }, [])

  useEffect(() => {
    if (userLoading) return
    if (!user) {
      window.location.href = '/login'
    }
  }, [user, userLoading])

  const updateActiveClient = (updater) => {
    setClients((currentClients) =>
      currentClients.map((client) => {
        if (client.id !== activeClientId) return client
        return updater(client)
      })
    )
  }

  const updateDraftDashboardTemplate = (updater) => {
    if (!activeDraftDashboardTemplateId) return

    setDraftDashboardTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.id === activeDraftDashboardTemplateId ? updater(template) : template
      )
    )
  }

  const handleDashboardTemplateChange = (templateId) => {
    if (!templateId) return

    setDraftDashboardTemplateId(templateId)
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
  }

  const handleSaveDashboardTemplate = () => {
    if (!activeDraftDashboardTemplate) return

    const suggestedName =
      activeDraftDashboardTemplates.length <= 1
        ? 'Modelo 2'
        : `Modelo ${activeDraftDashboardTemplates.length + 1}`
    const templateName = window.prompt('Nome do modelo', suggestedName)
    const trimmedName = templateName?.trim()

    if (!trimmedName) return

    const newTemplate = createDashboardTemplate({
      name: trimmedName,
      metaCampaignTableColumnKeys: [...draftMetaCampaignTableColumnKeys],
      metaMetricLayouts: cloneDashboardMetricLayouts(draftMetaDashboardMetricLayouts),
      rdMetricLayouts: cloneDashboardMetricLayouts(draftRdDashboardMetricLayouts),
      sheetsMetricLayouts: cloneDashboardMetricLayouts(draftSheetsDashboardMetricLayouts),
    })

    setDraftDashboardTemplates((currentTemplates) => [...currentTemplates, newTemplate])
    setDraftDashboardTemplateId(newTemplate.id)
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
    setIsSheetsMetricLibraryOpen(false)
  }

  const handleAddMetaDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      metaMetricLayouts: [
        ...normalizeDashboardMetricLayouts(template.metaMetricLayouts),
        {
          id: globalThis.crypto?.randomUUID?.() || `dashboard-card-${metricKey}-${Date.now()}`,
          metricKey,
          size: 'sm',
        },
      ],
    }))
  }

  const handleToggleMetaCampaignTableColumn = (columnKey) => {
    if (!META_CAMPAIGN_TABLE_COLUMN_OPTIONS[columnKey]) return

    updateDraftDashboardTemplate((template) => {
      const currentColumns = normalizeMetaCampaignTableColumnKeys(template.metaCampaignTableColumnKeys)
      const nextColumns = currentColumns.includes(columnKey)
        ? currentColumns.filter((item) => item !== columnKey)
        : [...currentColumns, columnKey]

      return {
        ...template,
        metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(nextColumns),
      }
    })
  }

  const handleRemoveMetaDashboardMetric = (layoutId) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      metaMetricLayouts: normalizeDashboardMetricLayouts(template.metaMetricLayouts).filter((item) => item.id !== layoutId),
    }))
  }

  const handleAddRdDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      rdMetricLayouts: [
        ...normalizeDashboardMetricLayouts(template.rdMetricLayouts),
        {
          id: globalThis.crypto?.randomUUID?.() || `dashboard-card-${metricKey}-${Date.now()}`,
          metricKey,
          size: 'sm',
        },
      ],
    }))
  }

  const handleRemoveRdDashboardMetric = (layoutId) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      rdMetricLayouts: normalizeDashboardMetricLayouts(template.rdMetricLayouts).filter((item) => item.id !== layoutId),
    }))
  }

  const handleAddSheetsDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      sheetsMetricLayouts: [
        ...normalizeDashboardMetricLayouts(template.sheetsMetricLayouts),
        {
          id: globalThis.crypto?.randomUUID?.() || `dashboard-card-${metricKey}-${Date.now()}`,
          metricKey,
          size: 'sm',
        },
      ],
    }))
  }

  const handleRemoveSheetsDashboardMetric = (layoutId) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      sheetsMetricLayouts: normalizeDashboardMetricLayouts(template.sheetsMetricLayouts).filter((item) => item.id !== layoutId),
    }))
  }

  const handleDashboardMetricSizeToggle = (source, layoutId) => {
    const fieldName =
      source === 'meta'
        ? 'metaMetricLayouts'
        : source === 'rd'
          ? 'rdMetricLayouts'
          : 'sheetsMetricLayouts'

    updateDraftDashboardTemplate((template) => ({
      ...template,
      [fieldName]: normalizeDashboardMetricLayouts(template[fieldName]).map((item) =>
        item.id === layoutId
          ? {
              ...item,
              size: item.size === 'lg' ? 'sm' : 'lg',
            }
          : item
      ),
    }))
  }

  const handleDashboardMetricDragStart = (source, layoutId) => {
    setDashboardMetricDragState({ source, layoutId })
  }

  const handleDashboardMetricDrop = (source, targetLayoutId) => {
    if (!dashboardMetricDragState || dashboardMetricDragState.source !== source) return
    if (dashboardMetricDragState.layoutId === targetLayoutId) return

    const fieldName =
      source === 'meta'
        ? 'metaMetricLayouts'
        : source === 'rd'
          ? 'rdMetricLayouts'
          : 'sheetsMetricLayouts'

    updateDraftDashboardTemplate((template) => {
      const currentLayouts = normalizeDashboardMetricLayouts(template[fieldName])
      const sourceIndex = currentLayouts.findIndex((item) => item.id === dashboardMetricDragState.layoutId)
      const targetIndex = currentLayouts.findIndex((item) => item.id === targetLayoutId)

      if (sourceIndex === -1 || targetIndex === -1) return template

      const nextLayouts = [...currentLayouts]
      const [movedItem] = nextLayouts.splice(sourceIndex, 1)
      nextLayouts.splice(targetIndex, 0, movedItem)

      return {
        ...template,
        [fieldName]: nextLayouts,
      }
    })

    setDashboardMetricDragState(null)
  }

  const handleDashboardMetricDragEnd = () => {
    setDashboardMetricDragState(null)
  }

  const handleCreateClient = (event) => {
    event.preventDefault()
    if (!isMaster) return
    const trimmedName = newClientName.trim()
    if (!trimmedName) return

    const newClient = createClientRecord({ name: trimmedName })
    setClients((currentClients) => [...currentClients, newClient])
    setActiveClientId(newClient.id)
    setActiveTab('clientes')
    setNewClientName('')
  }

  const handleRemoveClient = (clientId) => {
    if (!isMaster) return
    const nextClients = clients.filter((client) => client.id !== clientId)
    setClients(nextClients)
    setClientGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        clientIds: group.clientIds.filter((currentClientId) => currentClientId !== clientId),
      }))
    )

    if (clientId === activeClientId) {
      setActiveClientId(nextClients[0]?.id || '')
    }
  }

  const handleCreateClientGroup = (event) => {
    event.preventDefault()
    if (!isMaster) return

    const trimmedName = newClientGroupName.trim()
    if (!trimmedName) return

    setClientGroups((currentGroups) => [...currentGroups, createClientGroupRecord({ name: trimmedName })])
    setNewClientGroupName('')
  }

  const handleClientGroupFieldChange = (groupId, fieldName, value) => {
    setClientGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              [fieldName]: value,
            }
          : group
      )
    )
  }

  const handleClientGroupClientToggle = (groupId, clientId) => {
    setClientGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id !== groupId) return group

        const currentClientIds = normalizeClientGroupClientIds(group.clientIds)
        const nextClientIds = currentClientIds.includes(clientId)
          ? currentClientIds.filter((currentClientId) => currentClientId !== clientId)
          : [...currentClientIds, clientId]

        return {
          ...group,
          clientIds: nextClientIds,
        }
      })
    )
  }

  const handleRemoveClientGroup = (groupId) => {
    if (!isMaster) return
    setClientGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupId))
    setUsersList((currentUsers) =>
      currentUsers.map((managedUser) => ({
        ...managedUser,
        clientGroupAccess: (managedUser.clientGroupAccess || []).filter((groupAccess) => groupAccess.group_id !== groupId),
      }))
    )
  }

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return

    try {
      setUsersLoading(true)
      const response = await fetch('/api/users', { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os usuários.')
      }

      setUsersList(data)
      setSelectedUserId((current) => current || data[0]?.id || '')
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      alert(error.message || 'Não foi possível carregar os usuários.')
    } finally {
      setUsersLoading(false)
    }
  }, [canManageUsers])

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase()
    if (!term) return usersList

    return usersList.filter((managedUser) =>
      [managedUser.full_name, managedUser.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    )
  }, [usersList, userSearch])
  const metaFilteredAdsetIds = useMemo(
    () =>
      availableMetaAdsetOptions
        .filter((adset) => activeMetaAdsetIds.length === 0 || activeMetaAdsetIds.includes(adset.id))
        .map((adset) => adset.id),
    [availableMetaAdsetOptions, activeMetaAdsetIds]
  )
  const metaFilteredAdsetIdsKey = useMemo(
    () => JSON.stringify(metaFilteredAdsetIds),
    [metaFilteredAdsetIds]
  )
  const metaFilteredAdIds = useMemo(
    () =>
      availableMetaAdOptions
        .filter((ad) => activeMetaAdIds.length === 0 || activeMetaAdIds.includes(ad.id))
        .map((ad) => ad.id),
    [availableMetaAdOptions, activeMetaAdIds]
  )
  const metaFilteredAdIdsKey = useMemo(
    () => JSON.stringify(metaFilteredAdIds),
    [metaFilteredAdIds]
  )
  const hasActiveMetaCampaignNarrowing = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
    if (!availableIds.length) return false
    return metaFilteredCampaignIds.length !== availableIds.length
  }, [availableMetaCampaignOptions, metaFilteredCampaignIds])
  const hasActiveMetaAdsetNarrowing = useMemo(() => {
    const availableIds = availableMetaAdsetOptions.map((adset) => adset.id)
    if (!availableIds.length) return false
    return metaFilteredAdsetIds.length !== availableIds.length
  }, [availableMetaAdsetOptions, metaFilteredAdsetIds])
  const hasActiveMetaAdNarrowing = useMemo(() => {
    const availableIds = availableMetaAdOptions.map((ad) => ad.id)
    if (!availableIds.length) return false
    return metaFilteredAdIds.length !== availableIds.length
  }, [availableMetaAdOptions, metaFilteredAdIds])

  useEffect(() => {
    metaFilteredCampaignIdsRef.current = metaFilteredCampaignIds
  }, [metaFilteredCampaignIds])

  useEffect(() => {
    metaFilteredAdsetIdsRef.current = metaFilteredAdsetIds
  }, [metaFilteredAdsetIds])

  useEffect(() => {
    metaFilteredAdIdsRef.current = metaFilteredAdIds
  }, [metaFilteredAdIds])

  const handleUserClientToggle = (clientId) => {
    setUserForm((current) => ({
      ...current,
      clientIds: current.clientIds.includes(clientId)
        ? current.clientIds.filter((id) => id !== clientId)
        : [...current.clientIds, clientId],
    }))
  }

  const handleUserClientGroupToggle = (groupId) => {
    setUserForm((current) => ({
      ...current,
      clientGroupIds: current.clientGroupIds.includes(groupId)
        ? current.clientGroupIds.filter((id) => id !== groupId)
        : [...current.clientGroupIds, groupId],
    }))
  }

  const getManagedUserAccessibleClientCount = useCallback((managedUser) => {
    if (!managedUser) return 0
    if (managedUser.role === 'master') return clients.length

    const accessibleClientIds = new Set(
      (managedUser.clientAccess || [])
        .filter((item) => item.can_view)
        .map((item) => item.client_id)
        .filter((clientId) => clientIdsSet.has(clientId))
    )

    ;(managedUser.clientGroupAccess || [])
      .filter((item) => item.can_view)
      .forEach((groupAccess) => {
        const group = clientGroupsById.get(groupAccess.group_id)
        ;(group?.clientIds || []).forEach((clientId) => {
          if (clientIdsSet.has(clientId)) {
            accessibleClientIds.add(clientId)
          }
        })
      })

    return accessibleClientIds.size
  }, [clients.length, clientGroupsById, clientIdsSet])

  const handleMetaResultFilterToggle = (filterKey) => {
    setDraftMetaResultFilters((current) => {
      const availableKeys = availableMetaResultFilters.map((item) => item.key)
      const normalizedCurrent = normalizeMetaResultFilters(current, availableKeys)

      if (normalizedCurrent.includes(filterKey)) {
        const nextFilters = normalizedCurrent.filter((item) => item !== filterKey)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      return [...normalizedCurrent, filterKey]
    })
  }

  const handleMetaCampaignFilterToggle = (campaignId) => {
    setDraftMetaCampaignFilters((current) => {
      const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(campaignId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== campaignId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, campaignId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleApplyDashboardFilters = () => {
    if (activeTab === 'monday') {
      setMondayDateRange(draftMondayDateRange)
      setMondayCustomSince(draftMondayCustomSince)
      setMondayCustomUntil(draftMondayCustomUntil)
      return
    }

    const availableResultKeys = availableMetaResultFilters.map((item) => item.key)
    const availableCampaignIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
    const availableAdsetIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)
    const availableAdIds = draftAvailableMetaAdOptions.map((ad) => ad.id)
    const availableLeadSources = rdSummary?.availableSources || []

    const normalizedResultSelection = draftMetaResultFilters.length > 0
      ? draftMetaResultFilters.filter((filterKey) => availableResultKeys.includes(filterKey))
      : []
    const normalizedCampaignSelection = draftMetaCampaignFilters.length > 0
      ? draftMetaCampaignFilters.filter((campaignId) => availableCampaignIds.includes(campaignId))
      : []
    const normalizedAdsetSelection = draftMetaAdsetFilters.length > 0
      ? draftMetaAdsetFilters.filter((adsetId) => availableAdsetIds.includes(adsetId))
      : []
    const normalizedAdSelection = draftMetaAdFilters.length > 0
      ? draftMetaAdFilters.filter((adId) => availableAdIds.includes(adId))
      : []
    const normalizedLeadSourceSelection = draftRdLeadSourceFilters.length > 0
      ? draftRdLeadSourceFilters.filter((source) => availableLeadSources.includes(source))
      : []

    setDateRange(draftDateRange)
    setCustomSince(draftCustomSince)
    setCustomUntil(draftCustomUntil)
    setMetaResultFilters(
      normalizedResultSelection.length === availableResultKeys.length ? [] : normalizedResultSelection
    )
    setMetaCampaignFilters(
      normalizedCampaignSelection.length === availableCampaignIds.length ? [] : normalizedCampaignSelection
    )
    setMetaAdsetFilters(
      normalizedAdsetSelection.length === availableAdsetIds.length ? [] : normalizedAdsetSelection
    )
    setMetaAdFilters(
      normalizedAdSelection.length === availableAdIds.length ? [] : normalizedAdSelection
    )
    setRdPipelineFilter(draftRdPipelineFilter)
    setRdSellerFilter(draftRdSellerFilter)
    setRdLeadSourceFilters(
      normalizedLeadSourceSelection.length === availableLeadSources.length ? [] : normalizedLeadSourceSelection
    )
    updateActiveClient((client) => ({
      ...client,
      rdPipelineId: draftRdPipelineFilter,
      funnelSteps: activeDraftFunnelSteps,
      dashboardTemplates: cloneDashboardTemplates(activeDraftDashboardTemplates),
      activeDashboardTemplateId:
        draftDashboardTemplateId ||
        activeDraftDashboardTemplates[0]?.id ||
        client.activeDashboardTemplateId,
    }))
  }

  const handleMetaAdsetFilterToggle = (adsetId) => {
    setDraftMetaAdsetFilters((current) => {
      const availableIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(adsetId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== adsetId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, adsetId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleMetaAdFilterToggle = (adId) => {
    setDraftMetaAdFilters((current) => {
      const availableIds = draftAvailableMetaAdOptions.map((ad) => ad.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(adId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== adId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, adId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleRdLeadSourceToggle = (sourceLabel) => {
    setDraftRdLeadSourceFilters((current) => {
      const availableSources = rdSummary?.availableSources || []
      const currentSelection = current.length > 0 ? current.filter((source) => availableSources.includes(source)) : availableSources

      if (currentSelection.includes(sourceLabel)) {
        const nextSelection = currentSelection.filter((item) => item !== sourceLabel)
        if (nextSelection.length === 0) return currentSelection
        return nextSelection.length === availableSources.length ? [] : nextSelection
      }

      const nextSelection = [...currentSelection, sourceLabel]
      return nextSelection.length === availableSources.length ? [] : nextSelection
    })
  }

  const isMetaRateLimitMessage = (message = '') =>
    /rate limit|request limit|too many calls|too many requests/i.test(message)

  const persistWorkspaceState = async () => {
    const state = {
      themeColor,
      metric1,
      metric2,
      activeClientId,
      globalIntegrations,
      clients,
      clientGroups,
    }

    const response = await fetch('/api/dashboard/state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.error || 'Não foi possível salvar os grupos e dashboards no Supabase antes de liberar o usuário.')
    }

    return data
  }

  const handleCreateUser = async (event) => {
    event.preventDefault()

    try {
      setCreateUserError('')
      setSavingUser(true)
      if ((userForm.clientGroupIds || []).length > 0) {
        await persistWorkspaceState()
      }
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userForm),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível criar o usuário.')
      }

      setUserForm({
        fullName: '',
        email: '',
        password: '',
        role: 'visualizador',
        aiAccessLevel: 'team',
        clientIds: [],
        clientGroupIds: [],
      })
      setIsCreateUserModalOpen(false)
      await loadUsers()
    } catch (error) {
      setCreateUserError(error.message || 'Não foi possível criar o usuário.')
    } finally {
      setSavingUser(false)
    }
  }

  const handleUpdateUser = async (managedUser) => {
    try {
      setEditUserError('')
      if ((managedUser.clientGroupAccess || []).length > 0) {
        await persistWorkspaceState()
      }
      const response = await fetch(`/api/users/${managedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: managedUser.full_name || '',
          role: managedUser.role,
          aiAccessLevel: managedUser.ai_access_level || (managedUser.role === 'master' ? 'master' : 'team'),
          clientIds: (managedUser.clientAccess || []).map((item) => item.client_id),
          clientGroupIds: (managedUser.clientGroupAccess || []).map((item) => item.group_id),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível atualizar o usuário.')
      }

      setIsEditUserModalOpen(false)
      await loadUsers()
    } catch (error) {
      setEditUserError(error.message || 'Não foi possível atualizar o usuário.')
    }
  }

  const handleManagedUserChange = (userId, updater) => {
    setUsersList((current) =>
      current.map((item) => (item.id === userId ? updater(item) : item))
    )
  }

  const handleDeleteUser = async (managedUserId) => {
    try {
      const response = await fetch(`/api/users/${managedUserId}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir o usuário.')
      }

      setIsEditUserModalOpen(false)
      setSelectedUserId('')
      await loadUsers()
    } catch (error) {
      alert(error.message || 'Não foi possível excluir o usuário.')
    }
  }

  useEffect(() => {
    if (!canManageUsers || activeTab !== 'usuarios') return
    loadUsers()
  }, [canManageUsers, activeTab, loadUsers])

  useEffect(() => {
    if (!usersList.length) {
      setSelectedUserId('')
      return
    }

    if (selectedUserId && usersList.some((managedUser) => managedUser.id === selectedUserId)) {
      return
    }

    setSelectedUserId(usersList[0].id)
  }, [usersList, selectedUserId])

  useEffect(() => {
    if (!isCreateUserModalOpen) {
      setCreateUserError('')
    }
  }, [isCreateUserModalOpen])

  useEffect(() => {
    if (!isEditUserModalOpen) {
      setEditUserError('')
    }
  }, [isEditUserModalOpen])

  const handleClientFieldChange = (fieldName, value) => {
    updateActiveClient((client) => ({
      ...client,
      [fieldName]: value,
    }))
  }

  const handleConfirmDashboardEntry = () => {
    if (!dashboardEntryClientId) return
    setActiveClientId(dashboardEntryClientId)
    setIsDashboardEntryModalOpen(false)
  }

  const handleClientDashboardRgbChange = (channel, value) => {
    const nextRgb = {
      ...activeClientDashboardRgb,
      [channel]: clampColorChannel(value),
    }
    const nextColor = `rgb(${nextRgb.r}, ${nextRgb.g}, ${nextRgb.b})`

    handleClientFieldChange('dashboardColor', nextColor)
    setThemeColor(nextColor)
  }

  const handleClientDashboardHexChange = (value) => {
    const parsedColor = hexToRgb(value)
    if (!parsedColor) return

    const nextColor = `rgb(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b})`
    handleClientFieldChange('dashboardColor', nextColor)
    setThemeColor(nextColor)
  }

  const handleGlobalIntegrationChange = (fieldName, value) => {
    setGlobalIntegrations((current) => ({
      ...current,
      [fieldName]: value,
    }))
  }

  const handleQualifiedStageToggle = (stageName) => {
    updateActiveClient((client) => {
      const currentStages = Array.isArray(client.rdQualifiedStages) ? client.rdQualifiedStages : []
      const nextStages = currentStages.includes(stageName)
        ? currentStages.filter((stage) => stage !== stageName)
        : [...currentStages, stageName]

      return {
        ...client,
        rdQualifiedStages: nextStages,
      }
    })
  }

  const handleIntegrationChange = (fieldName, value, storage) => {
    if (storage === 'client') {
      handleClientFieldChange(fieldName, value)
      return
    }

    updateActiveClient((client) => ({
      ...client,
      integrations: {
        ...client.integrations,
        [fieldName]: value,
      },
    }))
  }

  const handleClientLogoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      handleClientFieldChange('logoUrl', reader.result?.toString() || '')
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (!hasLoadedPreferences || !activeClient) {
      setAdAccounts([])
      return
    }

    if (activeTab !== 'clientes' && activeTab !== 'integracoes') {
      return
    }

    if (!hasMetaManualToken && !hasMetaOauthConnection) {
      setAdAccounts([])
      return
    }

    const fetchAdAccounts = async () => {
      setErrorMessage('')

      try {
        const response = await fetch('/api/meta/adaccounts', {
          headers: metaRequestHeaders,
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Não foi possível listar as contas da Meta.')
        }

        setAdAccounts(data)

        if (!activeClient.metaAdAccountId && data[0]?.id) {
          setClients((currentClients) =>
            currentClients.map((client) =>
              client.id === activeClientId
                ? { ...client, metaAdAccountId: data[0].id }
                : client
            )
          )
        }
      } catch (error) {
        setAdAccounts([])
        setErrorMessage(error.message || 'Não foi possível conectar à Meta.')
      }
    }

    fetchAdAccounts()
  }, [
    hasLoadedPreferences,
    activeClient,
    activeClientId,
    hasMetaManualToken,
    hasMetaOauthConnection,
    metaRequestHeaders,
    activeTab,
  ])

  useEffect(() => {
    if (activeTab !== 'apresentacao') return

    if (!activeClientId) {
      lastMetaStructureFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setDailyCampaignData([])
      setCampaigns([])
      setMetaHierarchy([])
      setBreakdowns(EMPTY_META_BREAKDOWNS)
      setRdSummary(null)
      setIsMetaStructureReady(false)
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    let cancelled = false

    const loadMetaStructure = async () => {
      if (!hasMetaConfigured) {
        setCampaigns([])
        setMetaHierarchy([])
        setIsMetaStructureReady(true)
        return
      }

      setIsMetaStructureReady(false)

      try {
        const fetchKey = JSON.stringify({
          activeClientId,
          selectedAdAccount,
          dateRange,
          customSince,
          customUntil,
          metaCredentialSignature,
        })

        if (lastMetaStructureFetchKeyRef.current === fetchKey) {
          setIsMetaStructureReady(true)
          return
        }

        lastMetaStructureFetchKeyRef.current = fetchKey

        const params = new URLSearchParams({
          ad_account_id: selectedAdAccount,
          date_preset: dateRange,
        })

        if (dateRange === 'custom') {
          params.set('since', customSince)
          params.set('until', customUntil)
        }

        const [campaignsResponse, structureResponse] = await Promise.all([
          fetch(`/api/meta/campaigns?${params.toString()}`, { headers: metaRequestHeaders }),
          fetch(`/api/meta/structure?${params.toString()}`, { headers: metaRequestHeaders }),
        ])
        const [campaignsData, structureData] = await Promise.all([
          campaignsResponse.json().catch(() => ({ error: 'Não foi possível interpretar a resposta das campanhas da Meta.' })),
          structureResponse.json().catch(() => ({ error: 'Não foi possível interpretar a resposta da estrutura da Meta.' })),
        ])

        if (!campaignsResponse.ok) {
          throw new Error(campaignsData.error || 'Não foi possível carregar as campanhas da Meta.')
        }

        if (cancelled) return
        setCampaigns(campaignsData || [])
        setMetaHierarchy(structureResponse.ok ? structureData || [] : [])

        if (!structureResponse.ok) {
          setErrorMessage(structureData?.error || 'Não foi possível carregar conjuntos e anúncios da Meta.')
        }

        setIsMetaStructureReady(true)
      } catch (error) {
        if (!cancelled) {
          setCampaigns([])
          setMetaHierarchy([])
          setIsMetaStructureReady(true)
          setErrorMessage(error.message || 'Não foi possível carregar a estrutura da Meta.')
        }
      }
    }

    loadMetaStructure()

    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    metaCredentialSignature,
    metaRequestHeaders,
  ])

  useEffect(() => {
    const shouldFetchPresentationData = activeTab === 'apresentacao'
    const shouldFetchClickUpData = activeTab === 'clickup'
    const shouldFetchMondayData = activeTab === 'monday'

    if (!shouldFetchPresentationData && !shouldFetchClickUpData && !shouldFetchMondayData) return

    if (shouldFetchPresentationData && !activeClientId) {
      lastDashboardFetchKeyRef.current = ''
      lastGoogleSheetsFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setDailyCampaignData([])
      setRdSummary(null)
      setGoogleSheetsSummary(null)
      setClickUpSummary(null)
      setClickUpError('')
      setMondaySummary(null)
      setMondayError('')
      return
    }

    if (
      shouldFetchPresentationData
      && !hasMetaConfigured
      && !hasRdConfigured
      && !hasSheetsConfigured
    ) {
      lastDashboardFetchKeyRef.current = ''
      lastGoogleSheetsFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setDailyCampaignData([])
      setRdSummary(null)
      setGoogleSheetsSummary(null)
      setClickUpSummary(null)
      setClickUpError('')
      setMondaySummary(null)
      setMondayError('')
      return
    }

    if (shouldFetchPresentationData && dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    if (shouldFetchMondayData && mondayDateRange === 'custom' && (!mondayCustomSince || !mondayCustomUntil)) {
      return
    }

    if (shouldFetchPresentationData && hasMetaConfigured && !isMetaStructureReady) {
      return
    }

    let cancelled = false

    const fetchDashboardData = async () => {
      const fetchKey = JSON.stringify({
        activeClientId,
        selectedAdAccount,
        dateRange,
        customSince,
        customUntil,
        mondayDateRange,
        mondayCustomSince,
        mondayCustomUntil,
        hasMetaConfigured,
        hasRdConfigured,
        hasSheetsConfigured,
        rdPipelineFilter,
        rdSellerFilter,
        rdLeadSourceFiltersKey,
        selectedQualifiedStagesKey,
        metaFilteredCampaignIdsKey,
        metaFilteredAdsetIdsKey,
        metaFilteredAdIdsKey,
        hasActiveMetaCampaignNarrowing,
        hasActiveMetaAdsetNarrowing,
        hasActiveMetaAdNarrowing,
        isMetaStructureReady,
        metaCredentialSignature,
        rdToken: activeIntegrations.rdStationToken,
        googleSheetsUrl: activeClient?.googleSheetsUrl || '',
        googleSheetsHeaderRow: Number(activeClient?.googleSheetsHeaderRow || 1),
        googleSheetsStatusColumn: activeClient?.googleSheetsStatusColumn || '',
        mondayOwnerFilter,
      })

      if (lastDashboardFetchKeyRef.current === fetchKey) {
        return
      }

      lastDashboardFetchKeyRef.current = fetchKey
      setIsLoading(true)
      setErrorMessage('')

      try {
        let metaError = ''
        let rdError = ''
        let sheetsError = ''
        let clickUpRequestError = ''
        let mondayRequestError = ''
        const currentMetaFilteredCampaignIds = metaFilteredCampaignIdsRef.current
        const currentMetaFilteredAdsetIds = metaFilteredAdsetIdsRef.current
        const currentMetaFilteredAdIds = metaFilteredAdIdsRef.current
        const currentRdLeadSourceFilters = rdLeadSourceFiltersRef.current
        const currentSelectedQualifiedStages = selectedQualifiedStagesRef.current

        if (shouldFetchPresentationData && hasMetaConfigured) {
          const params = new URLSearchParams({
            ad_account_id: selectedAdAccount,
            date_preset: dateRange,
          })

          if (dateRange === 'custom') {
            params.set('since', customSince)
            params.set('until', customUntil)
          }

          const insightsParams = new URLSearchParams(params)

          if (currentMetaFilteredCampaignIds.length === 0) {
            insightsParams.set('campaign_ids', '__none__')
          } else if (hasActiveMetaCampaignNarrowing) {
            insightsParams.set('campaign_ids', currentMetaFilteredCampaignIds.join(','))
          }
          if (hasActiveMetaAdsetNarrowing && currentMetaFilteredAdsetIds.length > 0) {
            insightsParams.set('adset_ids', currentMetaFilteredAdsetIds.join(','))
          }
          if (hasActiveMetaAdNarrowing && currentMetaFilteredAdIds.length > 0) {
            insightsParams.set('ad_ids', currentMetaFilteredAdIds.join(','))
          }

          const currentMetaWindow = resolveDateWindow(dateRange, customSince, customUntil, {
            excludeTodayForLast30d: dateRange === 'last_30d',
          })
          const previousMetaWindow = buildPreviousWindow(currentMetaWindow)

          const previousInsightsParams = new URLSearchParams({
            ad_account_id: selectedAdAccount,
            date_preset: 'custom',
          })
          if (previousMetaWindow) {
            previousInsightsParams.set('since', formatLocalDateInput(previousMetaWindow.start))
            previousInsightsParams.set('until', formatLocalDateInput(previousMetaWindow.end))
          }
          if (currentMetaFilteredCampaignIds.length === 0) {
            previousInsightsParams.set('campaign_ids', '__none__')
          } else if (hasActiveMetaCampaignNarrowing) {
            previousInsightsParams.set('campaign_ids', currentMetaFilteredCampaignIds.join(','))
          }
          if (hasActiveMetaAdsetNarrowing && currentMetaFilteredAdsetIds.length > 0) {
            previousInsightsParams.set('adset_ids', currentMetaFilteredAdsetIds.join(','))
          }
          if (hasActiveMetaAdNarrowing && currentMetaFilteredAdIds.length > 0) {
            previousInsightsParams.set('ad_ids', currentMetaFilteredAdIds.join(','))
          }

          const [insightsResponse, previousInsightsResponse] = await Promise.all([
            fetch(`/api/meta/insights?${insightsParams.toString()}`, { headers: metaRequestHeaders }),
            previousMetaWindow
              ? fetch(`/api/meta/insights?${previousInsightsParams.toString()}`, { headers: metaRequestHeaders })
              : Promise.resolve(null),
          ])

          const insightsData = await insightsResponse.json()

          if (!insightsResponse.ok) {
            const nextMetaError = insightsData.error || 'Não foi possível carregar os indicadores da Meta.'
            if (!cancelled) {
              setInsights(buildMetaSummaryFromCampaigns(campaignsRef.current))
              setDailyData([])
              setDailyCampaignData([])
              setPreviousInsights(null)
            }
            metaError = isMetaRateLimitMessage(nextMetaError) ? '' : nextMetaError
          } else if (!cancelled) {
            setInsights(insightsData.summary || {})
            setDailyData(insightsData.daily || [])
            setDailyCampaignData(insightsData.daily_by_campaign || [])

            if (previousInsightsResponse) {
              const previousInsightsData = await previousInsightsResponse.json()
              setPreviousInsights(previousInsightsResponse.ok ? (previousInsightsData.summary || {}) : null)
            } else {
              setPreviousInsights(null)
            }
          }
        } else if (!cancelled) {
          setInsights(null)
          setPreviousInsights(null)
          setDailyData([])
          setDailyCampaignData([])
        }

        if (shouldFetchPresentationData && hasRdConfigured) {
          const rdParams = new URLSearchParams()
          if (rdPipelineFilter) {
            rdParams.set('pipeline_id', rdPipelineFilter)
          }
          if (rdSellerFilter && rdSellerFilter !== 'all') {
            rdParams.set('seller_id', rdSellerFilter)
          }
          if (currentRdLeadSourceFilters.length > 0) {
            currentRdLeadSourceFilters.forEach((source) => {
              rdParams.append('lead_source', source)
            })
          }
          rdParams.set('date_preset', dateRange)
          currentSelectedQualifiedStages.forEach((stage) => {
            rdParams.append('qualified_stage', stage)
          })
          if (dateRange === 'custom') {
            rdParams.set('since', customSince)
            rdParams.set('until', customUntil)
          }

          const currentRdWindow = resolveDateWindow(dateRange, customSince, customUntil)
          const previousRdWindow = buildPreviousWindow(currentRdWindow)
          const previousRdParams = new URLSearchParams(rdParams)

          if (previousRdWindow) {
            previousRdParams.set('date_preset', 'custom')
            previousRdParams.set('since', formatLocalDateInput(previousRdWindow.start))
            previousRdParams.set('until', formatLocalDateInput(previousRdWindow.end))
          }

          const rdHeaders = {
            'x-rd-station-token': activeIntegrations.rdStationToken,
          }

          const [rdResponse, previousRdResponse] = await Promise.all([
            fetch(`/api/rd/summary${rdParams.toString() ? `?${rdParams.toString()}` : ''}`, {
              headers: rdHeaders,
            }),
            previousRdWindow
              ? fetch(`/api/rd/summary?${previousRdParams.toString()}`, {
                  headers: rdHeaders,
                })
              : Promise.resolve(null),
          ])

          const rdData = await rdResponse.json()

          if (!rdResponse.ok) {
            rdError = rdData.error || 'Não foi possível carregar os dados do RD Station.'
            if (!cancelled) {
              setRdSummary(null)
              setPreviousRdSummary(null)
            }
          } else if (!cancelled) {
            setRdSummary(rdData || null)

            if (previousRdResponse) {
              const previousRdData = await previousRdResponse.json()
              setPreviousRdSummary(previousRdResponse.ok ? (previousRdData || null) : null)
            } else {
              setPreviousRdSummary(null)
            }
          }
        } else if (!cancelled) {
          setRdSummary(null)
          setPreviousRdSummary(null)
        }

        if (shouldFetchPresentationData && hasSheetsConfigured) {
          const sheetsFetchKey = JSON.stringify({
            activeClientId,
            googleSheetsUrl: activeClient?.googleSheetsUrl || '',
            googleSheetsHeaderRow: Number(activeClient?.googleSheetsHeaderRow || 1),
            googleSheetsStatusColumn: String(activeClient?.googleSheetsStatusColumn || '').trim(),
          })

          if (lastGoogleSheetsFetchKeyRef.current !== sheetsFetchKey) {
            try {
              const sheetsParams = new URLSearchParams({
                url: activeClient?.googleSheetsUrl || '',
                header_row: String(Number(activeClient?.googleSheetsHeaderRow || 1)),
              })
              if (String(activeClient?.googleSheetsStatusColumn || '').trim()) {
                sheetsParams.set('status_column', activeClient.googleSheetsStatusColumn)
              }

              const sheetsResponse = await fetch(`/api/google-sheets/summary?${sheetsParams.toString()}`, {
                cache: 'no-store',
              })
              const sheetsData = await sheetsResponse.json()

              if (!sheetsResponse.ok) {
                throw new Error(sheetsData.error || 'Não foi possível carregar os dados do Google Sheets.')
              }

              if (!cancelled) {
                lastGoogleSheetsFetchKeyRef.current = sheetsFetchKey
                setGoogleSheetsSummary(sheetsData || null)
                setGoogleSheetsError('')
              }
            } catch (error) {
              sheetsError = error.message || 'Não foi possível carregar os dados do Google Sheets.'
              if (!cancelled) {
                lastGoogleSheetsFetchKeyRef.current = ''
                setGoogleSheetsSummary(null)
                setGoogleSheetsError(sheetsError)
              }
            }
          }
        } else if (!cancelled) {
          lastGoogleSheetsFetchKeyRef.current = ''
          setGoogleSheetsSummary(null)
          setGoogleSheetsError('')
        }

        if (shouldFetchClickUpData && hasClickUpConfigured) {
          try {
            const clickUpParams = new URLSearchParams({
              list_ids: String(globalIntegrations.clickUpListIds || '').trim(),
            })
            const clickUpResponse = await fetch(`/api/clickup/summary?${clickUpParams.toString()}`, {
              headers: {
                'x-clickup-token': globalIntegrations.clickUpToken,
              },
              cache: 'no-store',
            })
            const clickUpData = await clickUpResponse.json()

            if (!clickUpResponse.ok) {
              throw new Error(clickUpData.error || 'Não foi possível carregar os dados do ClickUp.')
            }

            if (!cancelled) {
              setClickUpSummary(clickUpData || null)
              setClickUpError('')
            }
          } catch (error) {
            clickUpRequestError = error.message || 'Não foi possível carregar os dados do ClickUp.'
            if (!cancelled) {
              setClickUpSummary(null)
              setClickUpError(clickUpRequestError)
            }
          }
        } else if (!cancelled) {
          setClickUpSummary(null)
          setClickUpError('')
        }

        if (shouldFetchMondayData && hasMondayConfigured) {
          try {
            const mondayParams = new URLSearchParams({
              board_ids: String(globalIntegrations.mondayBoardIds || '').trim(),
            })
            const mondayWindow = resolveDateWindow(mondayDateRange, mondayCustomSince, mondayCustomUntil)
            if (mondayWindow?.start && mondayWindow?.end) {
              mondayParams.set('since', formatLocalDateInput(mondayWindow.start))
              mondayParams.set('until', formatLocalDateInput(mondayWindow.end))
            }
            if (shouldFetchMondayData && mondayOwnerFilter !== 'all') {
              mondayParams.set('owner', mondayOwnerFilter)
            }
            const mondayResponse = await fetch(`/api/monday/summary?${mondayParams.toString()}`, {
              headers: {
                'x-monday-token': globalIntegrations.mondayToken,
              },
              cache: 'no-store',
            })
            const mondayData = await mondayResponse.json()

            if (!mondayResponse.ok) {
              throw new Error(mondayData.error || 'Não foi possível carregar os dados do Monday.')
            }

            if (!cancelled) {
              setMondaySummary(mondayData || null)
              setMondayError('')
            }
          } catch (error) {
            mondayRequestError = error.message || 'Não foi possível carregar os dados do Monday.'
            if (!cancelled) {
              setMondaySummary(null)
              setMondayError(mondayRequestError)
            }
          }
        } else if (!cancelled) {
          setMondaySummary(null)
          setMondayError('')
        }

        if (!cancelled) {
          setErrorMessage(metaError || rdError || sheetsError || clickUpRequestError || mondayRequestError)
        }
      } catch (error) {
        if (!cancelled) {
          lastGoogleSheetsFetchKeyRef.current = ''
          setInsights(null)
          setPreviousInsights(null)
          setDailyData([])
          setDailyCampaignData([])
          setBreakdowns(EMPTY_META_BREAKDOWNS)
          setRdSummary(null)
          setPreviousRdSummary(null)
          setGoogleSheetsSummary(null)
          setGoogleSheetsError('')
          setClickUpSummary(null)
          setClickUpError('')
          setMondaySummary(null)
          setMondayError('')
          setErrorMessage(error.message || 'Falha ao puxar os dados da integração.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchDashboardData()

    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    mondayDateRange,
    mondayCustomSince,
    mondayCustomUntil,
    hasMetaConfigured,
    hasRdConfigured,
    hasSheetsConfigured,
    hasClickUpConfigured,
    hasMondayConfigured,
    rdPipelineFilter,
    rdSellerFilter,
    rdLeadSourceFiltersKey,
    selectedQualifiedStagesKey,
    metaResultFilters,
    metaFilteredCampaignIdsKey,
    metaFilteredAdIdsKey,
    mondayOwnerFilter,
    metaFilteredAdsetIdsKey,
    hasActiveMetaCampaignNarrowing,
    hasActiveMetaAdsetNarrowing,
    hasActiveMetaAdNarrowing,
    isMetaStructureReady,
    metaCredentialSignature,
    metaRequestHeaders,
    activeIntegrations.rdStationToken,
    activeClient?.googleSheetsUrl,
    activeClient?.googleSheetsHeaderRow,
    activeClient?.googleSheetsStatusColumn,
    globalIntegrations.clickUpToken,
    globalIntegrations.clickUpListIds,
    globalIntegrations.mondayToken,
    globalIntegrations.mondayBoardIds,
  ])

  useEffect(() => {
    if (activeTab !== 'apresentacao') {
      lastBreakdownsFetchKeyRef.current = ''
      return
    }

    if (!activeClientId || !hasMetaConfigured) {
      lastBreakdownsFetchKeyRef.current = ''
      setBreakdowns(EMPTY_META_BREAKDOWNS)
      setIsRankingsLoading(false)
      setRankingsError('')
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    if (!isMetaStructureReady) {
      return
    }

    const fetchRankings = async () => {
      const fetchKey = JSON.stringify({
        activeClientId,
        selectedAdAccount,
        dateRange,
        customSince,
        customUntil,
        hasMetaConfigured,
        metaFilteredCampaignIdsKey,
        metaFilteredAdsetIdsKey,
        metaFilteredAdIdsKey,
        hasActiveMetaCampaignNarrowing,
        hasActiveMetaAdsetNarrowing,
        hasActiveMetaAdNarrowing,
        isMetaStructureReady,
        metaCredentialSignature,
      })

      if (lastBreakdownsFetchKeyRef.current === fetchKey) {
        return
      }

      lastBreakdownsFetchKeyRef.current = fetchKey
      setIsRankingsLoading(true)
      setRankingsError('')

      try {
        const params = new URLSearchParams({
          ad_account_id: selectedAdAccount,
          date_preset: dateRange,
        })

        if (dateRange === 'custom') {
          params.set('since', customSince)
          params.set('until', customUntil)
        }

        const currentMetaFilteredCampaignIds = metaFilteredCampaignIdsRef.current
        const currentMetaFilteredAdsetIds = metaFilteredAdsetIdsRef.current
        const currentMetaFilteredAdIds = metaFilteredAdIdsRef.current

        if (currentMetaFilteredCampaignIds.length === 0) {
          params.set('campaign_ids', '__none__')
        } else if (hasActiveMetaCampaignNarrowing) {
          params.set('campaign_ids', currentMetaFilteredCampaignIds.join(','))
        }
        if (hasActiveMetaAdsetNarrowing && currentMetaFilteredAdsetIds.length > 0) {
          params.set('adset_ids', currentMetaFilteredAdsetIds.join(','))
        }
        if (hasActiveMetaAdNarrowing && currentMetaFilteredAdIds.length > 0) {
          params.set('ad_ids', currentMetaFilteredAdIds.join(','))
        }

        const response = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
          headers: metaRequestHeaders,
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Os rankings detalhados não responderam agora.')
        }

        setBreakdowns(data || EMPTY_META_BREAKDOWNS)
      } catch (error) {
        setBreakdowns(EMPTY_META_BREAKDOWNS)
        setRankingsError(error.message || 'Os rankings detalhados não responderam agora.')
      } finally {
        setIsRankingsLoading(false)
      }
    }

    fetchRankings()
  }, [
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    metaFilteredCampaignIdsKey,
    metaFilteredAdsetIdsKey,
    metaFilteredAdIdsKey,
    hasActiveMetaCampaignNarrowing,
    hasActiveMetaAdsetNarrowing,
    hasActiveMetaAdNarrowing,
    isMetaStructureReady,
    metaCredentialSignature,
    metaRequestHeaders,
    activeTab,
  ])

  const handleSaveIntegrations = async (event) => {
    event.preventDefault()
    setIsSavingIntegrations(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    setIsSavingIntegrations(false)
    alert(`Cliente ${activeClient?.name || ''} salvo neste navegador.`)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const exportPDF = async () => {
    if (!dashboardRef.current) return

    try {
      setIsExporting(true)
      const element = dashboardRef.current
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b0f19',
        scrollY: -window.scrollY,
        windowWidth: Math.max(element.scrollWidth, element.clientWidth, window.innerWidth),
        windowHeight: Math.max(element.scrollHeight, element.clientHeight),
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfPageHeight = pdf.internal.pageSize.getHeight()
      const scaledImageHeight = (canvas.height * pdfWidth) / canvas.width

      let remainingHeight = scaledImageHeight
      let currentOffset = 0

      pdf.addImage(imgData, 'PNG', 0, currentOffset, pdfWidth, scaledImageHeight)
      remainingHeight -= pdfPageHeight

      while (remainingHeight > 0) {
        currentOffset = remainingHeight - scaledImageHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, currentOffset, pdfWidth, scaledImageHeight)
        remainingHeight -= pdfPageHeight
      }

      pdf.save(`dashboard-${activeClient?.name || 'cliente'}.pdf`)
    } catch (error) {
      console.error('Erro ao exportar PDF:', error)
      alert('Não foi possível gerar o PDF agora.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleGenerateAiInsights = async () => {
    if (!isAiInsightsConfigured) {
      setAiInsightsError('Configure provider, chave, endpoint e modelo na aba IA antes de gerar insights.')
      setAiInsightsResult(null)
      setIsAiInsightsModalOpen(true)
      return
    }

    try {
      setIsAiInsightsModalOpen(true)
      setIsAiInsightsLoading(true)
      setAiInsightsError('')
      setAiInsightsResult(null)

      const response = await fetch('/api/ai/dashboard-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dashboardAiInsightsPayload),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível gerar os insights da dashboard agora.')
      }

      setAiInsightsResult(data)
    } catch (error) {
      setAiInsightsError(error.message || 'Não foi possível gerar os insights da dashboard agora.')
    } finally {
      setIsAiInsightsLoading(false)
    }
  }

  const replaceDraftFunnelSteps = (steps) => {
    setDraftFunnelSteps(steps)
  }

  const handleFunnelDragStart = (metricKey, sourceIndex = null) => {
    setDragMetricKey(metricKey)
    setDragSourceIndex(sourceIndex)
  }

  const handleFunnelDrop = (targetIndex = activeDraftFunnelSteps.length) => {
    if (!dragMetricKey) return

    const currentSteps = [...activeDraftFunnelSteps]

    if (dragSourceIndex !== null) {
      const [movedStep] = currentSteps.splice(dragSourceIndex, 1)
      const adjustedIndex = dragSourceIndex < targetIndex ? targetIndex - 1 : targetIndex
      currentSteps.splice(adjustedIndex, 0, movedStep)
      replaceDraftFunnelSteps(currentSteps)
    } else if (!currentSteps.includes(dragMetricKey)) {
      currentSteps.splice(targetIndex, 0, dragMetricKey)
      replaceDraftFunnelSteps(currentSteps)
    }

    setDragMetricKey('')
    setDragSourceIndex(null)
  }

  const handleRemoveFunnelStep = (metricKey) => {
    replaceDraftFunnelSteps(activeDraftFunnelSteps.filter((step) => step !== metricKey))
  }

  const customMetrics = useMemo(() => insights?.custom_metrics || {}, [insights])
  const previousCustomMetrics = useMemo(() => previousInsights?.custom_metrics || {}, [previousInsights])
  const filledMetaDailyData = useMemo(() => {
    if (!currentMetaResultWindow?.start || !currentMetaResultWindow?.end) return dailyData

    const points = new Map(
      (dailyData || [])
        .map((day) => {
          const parsedDate = parseMetaSeriesDate(day.date_start)
          if (!parsedDate) return null

          return [
            formatLocalDateInput(parsedDate),
            day,
          ]
        })
        .filter(Boolean)
    )

    const filledSeries = []
    const cursor = new Date(currentMetaResultWindow.start.getFullYear(), currentMetaResultWindow.start.getMonth(), currentMetaResultWindow.start.getDate())
    const end = new Date(currentMetaResultWindow.end.getFullYear(), currentMetaResultWindow.end.getMonth(), currentMetaResultWindow.end.getDate())

    while (cursor <= end) {
      const key = formatLocalDateInput(cursor)
      const existingPoint = points.get(key)

      if (existingPoint) {
        filledSeries.push(existingPoint)
      } else {
        filledSeries.push({
          date_start: key,
          date_stop: key,
          spend: '0',
          reach: '0',
          impressions: '0',
          clicks: '0',
          cpc: '0',
          ctr: '0',
          custom_metrics: {
            landingPageViews: 0,
            cpm: 0,
            frequency: 0,
            totalConversions: 0,
            conversionRate: 0,
            purchaseValue: 0,
            purchases: 0,
            leads: 0,
            messages: 0,
            videoViews: 0,
            videoViewRate: 0,
            thruplay: 0,
            hookRate: 0,
            cpa: 0,
            roas: 0,
          },
        })
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    return filledSeries
  }, [currentMetaResultWindow, dailyData])

  const labels = filledMetaDailyData.map((day) => {
    const date = new Date(day.date_start)
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  })

  const lineChartData = {
    labels: labels.length > 0 ? labels : ['Sem dados'],
    datasets: [
      {
        label: METRIC_OPTIONS[metric1].label,
        data: filledMetaDailyData.length > 0 ? filledMetaDailyData.map((day) => getMetricData(metric1, day)) : [0],
        borderColor: currentTheme.main,
        backgroundColor: currentTheme.glow,
        borderWidth: 3,
        pointBackgroundColor: '#0b0f19',
        pointBorderColor: currentTheme.main,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
        yAxisID: 'y',
      },
      {
        label: METRIC_OPTIONS[metric2].label,
        data: filledMetaDailyData.length > 0 ? filledMetaDailyData.map((day) => getMetricData(metric2, day)) : [0],
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 3,
        borderDash: [7, 5],
        pointBackgroundColor: '#0b0f19',
        pointBorderColor: '#10b981',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        yAxisID: 'y1',
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.94)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${formatMetricValue(context.parsed.y, context.dataset.yAxisID === 'y' ? metric1 : metric2)}`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          callback(value) {
            return formatChartAxis(value, metric1)
          },
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { display: false },
        ticks: {
          callback(value) {
            return formatChartAxis(value, metric2)
          },
        },
      },
    },
  }

  const selectedMetaCampaignTableColumns = useMemo(
    () =>
      draftMetaCampaignTableColumnKeys
        .map((columnKey) => ({
          key: columnKey,
          ...META_CAMPAIGN_TABLE_COLUMN_OPTIONS[columnKey],
        }))
        .filter((column) => column.label),
    [draftMetaCampaignTableColumnKeys]
  )

  const campaignSortOptions = useMemo(() => {
    const baseOptions = [
      { value: 'spend', label: 'Maior investimento' },
      { value: 'totalConversions', label: 'Mais conversões' },
      { value: 'roas', label: 'Maior ROAS' },
    ]

    const appendedOptions = selectedMetaCampaignTableColumns
      .filter((column) => !baseOptions.some((option) => option.value === column.key))
      .map((column) => ({
        value: column.key,
        label: column.type === 'currency' || column.type === 'multiplier' || column.type === 'percent' || column.type === 'decimal'
          ? `Maior ${column.label}`
          : `Mais ${column.label.toLowerCase()}`,
      }))

    return [...baseOptions, ...appendedOptions]
  }, [selectedMetaCampaignTableColumns])

  const getCampaignMetricValue = useCallback((campaign, metricKey) => {
    const metrics = extractMetaCampaignMetrics(campaign)

    switch (metricKey) {
      case 'spend':
        return metrics.spend
      case 'totalConversions':
        return metrics.totalConversions
      case 'purchases':
        return metrics.purchases
      case 'leads':
        return metrics.leads
      case 'messages':
        return metrics.messages
      case 'cpa':
        return metrics.cpa
      case 'roas':
        return metrics.roas
      case 'purchaseValue':
        return metrics.purchaseValue
      case 'clicks':
        return metrics.clicks
      case 'impressions':
        return metrics.impressions
      case 'reach':
        return metrics.reach
      case 'ctr':
        return metrics.ctr
      case 'cpc':
        return metrics.cpc
      case 'cpm':
        return metrics.cpm
      case 'frequency':
        return metrics.frequency
      case 'conversionRate':
        return metrics.conversionRate
      default:
        return 0
    }
  }, [])

  const formatCampaignMetricValue = useCallback((metricKey, metricValue) => {
    const metric = META_CAMPAIGN_TABLE_COLUMN_OPTIONS[metricKey]
    if (!metric) return String(metricValue ?? '-')
    return formatDashboardMetricValue(metricValue, metric.type)
  }, [])

  const filteredCampaigns = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase()
    const filtered = campaigns.filter((campaign) => {
      const hasSpendInSelectedPeriod = Number(campaign?.spend || 0) > 0
      const matchesSearch = !term || campaign.name?.toLowerCase().includes(term)
      const matchesStatus = campaignStatusFilter === 'all' || campaign.status === campaignStatusFilter
      const matchesResultType = campaignMatchesMetaResultFilters(campaign, normalizedMetaResultFilters, availableMetaResultFilters.map((item) => item.key))
      const matchesCampaignFilter = activeMetaCampaignIds.length === 0 || activeMetaCampaignIds.includes(campaign.id)
      return hasSpendInSelectedPeriod && matchesSearch && matchesStatus && matchesResultType && matchesCampaignFilter
    })

    return filtered.sort((campaignA, campaignB) => {
      const valueA = getCampaignMetricValue(campaignA, campaignSortBy === 'conversions' ? 'totalConversions' : campaignSortBy)
      const valueB = getCampaignMetricValue(campaignB, campaignSortBy === 'conversions' ? 'totalConversions' : campaignSortBy)
      return valueB - valueA
    })
  }, [campaigns, campaignSearch, campaignStatusFilter, campaignSortBy, normalizedMetaResultFilters, availableMetaResultFilters, activeMetaCampaignIds, getCampaignMetricValue])

  const campaignSummary = useMemo(() => {
    if (!filteredCampaigns.length) {
      return {
        spend: parseFloat(insights?.spend || 0),
        reach: parseInt(insights?.reach || 0, 10),
        impressions: parseInt(insights?.impressions || 0, 10),
        clicks: customMetrics.clicks || parseInt(insights?.clicks || 0, 10),
        cpc: customMetrics.cpc || parseFloat(insights?.cpc || 0),
        ctr: customMetrics.ctr || parseFloat(insights?.ctr || 0),
        cpm: customMetrics.cpm || 0,
        frequency: customMetrics.frequency || 0,
        conversionRate: customMetrics.conversionRate || 0,
        averageTicket: customMetrics.averageTicket || 0,
        purchases: customMetrics.purchases || 0,
        cost_per_purchase: customMetrics.cost_per_purchase || 0,
        leads: customMetrics.leads || 0,
        cost_per_lead: customMetrics.cost_per_lead || 0,
        messages: customMetrics.messages || 0,
        cost_per_message: customMetrics.cost_per_message || 0,
        reach_results: customMetrics.reach_results || 0,
        cost_per_reach: customMetrics.cost_per_reach || 0,
        thruplays: customMetrics.thruplays || 0,
        cost_per_thruplay: customMetrics.cost_per_thruplay || 0,
        totalConversions: customMetrics.totalConversions || 0,
        roas: customMetrics.roas || 0,
        purchase_roas: customMetrics.purchase_roas || 0,
        purchaseValue: customMetrics.purchaseValue || 0,
      }
    }

    const aggregated = buildMetaSummaryFromCampaigns(filteredCampaigns)
    const aggregatedCustomMetrics = aggregated.custom_metrics || {}

    return {
      spend: parseFloat(aggregated.spend || 0),
      reach: parseInt(aggregated.reach || 0, 10),
      impressions: parseInt(aggregated.impressions || 0, 10),
      clicks: aggregatedCustomMetrics.clicks || parseInt(aggregated.clicks || 0, 10),
      cpc: aggregatedCustomMetrics.cpc || parseFloat(aggregated.cpc || 0),
      ctr: aggregatedCustomMetrics.ctr || parseFloat(aggregated.ctr || 0),
      cpm: aggregatedCustomMetrics.cpm || 0,
      frequency: aggregatedCustomMetrics.frequency || 0,
      conversionRate: aggregatedCustomMetrics.conversionRate || 0,
      averageTicket: aggregatedCustomMetrics.averageTicket || 0,
      purchases: aggregatedCustomMetrics.purchases || 0,
      cost_per_purchase: aggregatedCustomMetrics.cost_per_purchase || 0,
      leads: aggregatedCustomMetrics.leads || 0,
      cost_per_lead: aggregatedCustomMetrics.cost_per_lead || 0,
      messages: aggregatedCustomMetrics.messages || 0,
      cost_per_message: aggregatedCustomMetrics.cost_per_message || 0,
      reach_results: aggregatedCustomMetrics.reach_results || 0,
      cost_per_reach: aggregatedCustomMetrics.cost_per_reach || 0,
      thruplays: aggregatedCustomMetrics.thruplays || 0,
      cost_per_thruplay: aggregatedCustomMetrics.cost_per_thruplay || 0,
      totalConversions: aggregatedCustomMetrics.totalConversions || 0,
      roas: aggregatedCustomMetrics.roas || 0,
      purchase_roas: aggregatedCustomMetrics.purchase_roas || 0,
      purchaseValue: aggregatedCustomMetrics.purchaseValue || 0,
    }
  }, [filteredCampaigns, insights, customMetrics])

  const spend = campaignSummary.spend || 0
  const reach = campaignSummary.reach || 0
  const impressions = campaignSummary.impressions || 0
  const clicks = campaignSummary.clicks || 0
  const cpc = campaignSummary.cpc || 0
  const cpm = campaignSummary.cpm || 0
  const frequency = campaignSummary.frequency || 0
  const ctr = campaignSummary.ctr || 0
  const conversionRate = campaignSummary.conversionRate || 0
  const averageTicket = campaignSummary.averageTicket || 0
  const purchases = campaignSummary.purchases || 0
  const costPerPurchase = campaignSummary.cost_per_purchase || 0
  const leads = campaignSummary.leads || 0
  const costPerLead = campaignSummary.cost_per_lead || 0
  const messages = campaignSummary.messages || 0
  const costPerMessage = campaignSummary.cost_per_message || 0
  const reachResults = campaignSummary.reach_results || 0
  const costPerReach = campaignSummary.cost_per_reach || 0
  const thruplays = campaignSummary.thruplays || 0
  const costPerTruplay = campaignSummary.cost_per_thruplay || 0
  const totalConversions = campaignSummary.totalConversions || 0
  const roas = campaignSummary.roas || 0
  const purchaseRoas = campaignSummary.purchase_roas || 0
  const purchaseValue = campaignSummary.purchaseValue || 0
  const activeMetaRankingResultKeys = useMemo(() => {
    const availableKeys = normalizedMetaResultFilters.filter((filterKey) => META_RESULT_COMPARISON_OPTIONS[filterKey])
    return availableKeys.length ? availableKeys : ['purchases']
  }, [normalizedMetaResultFilters])
  const activeMetaRankingResultKey = activeMetaRankingResultKeys[0] || 'purchases'
  const activeMetaRankingResultConfig = META_RESULT_COMPARISON_OPTIONS[activeMetaRankingResultKey] || META_RESULT_COMPARISON_OPTIONS.purchases
  const metaSecondaryResultInsights = useMemo(() => {
    const buckets = {
      purchases: {
        campaignCount: 0,
        extras: { leads: 0, messages: 0 },
      },
      leads: {
        campaignCount: 0,
        extras: { purchases: 0, messages: 0 },
      },
      messages: {
        campaignCount: 0,
        extras: { purchases: 0, leads: 0 },
      },
    }

    filteredCampaigns.forEach((campaign) => {
      const metrics = extractMetaCampaignMetrics(campaign)
      const primaryResultKey = resolveMetaPrimaryResultKey(campaign, metrics)

      if (!buckets[primaryResultKey]) return

      buckets[primaryResultKey].campaignCount += 1

      Object.keys(buckets[primaryResultKey].extras).forEach((extraKey) => {
        buckets[primaryResultKey].extras[extraKey] += Number(metrics[extraKey] || 0)
      })
    })

    return Object.fromEntries(
      Object.entries(buckets).map(([key, value]) => {
        const items = Object.entries(value.extras)
          .filter(([, amount]) => amount > 0)
          .map(([extraKey, amount]) => ({
            key: extraKey,
            label:
              extraKey === 'purchases'
                ? 'Compras'
                : extraKey === 'leads'
                  ? 'Cadastros'
                  : 'Mensagens iniciadas',
            value: amount,
          }))

        return [key, {
          campaignCount: value.campaignCount,
          items,
          totalExtraResults: items.reduce((sum, item) => sum + item.value, 0),
        }]
      })
    )
  }, [filteredCampaigns])
  const doughnutChartData = {
    labels: ['Compras', 'Leads', 'Mensagens', 'Cliques sem conversão'],
    datasets: [
      {
        data: [purchases, leads, messages, Math.max(clicks - totalConversions, 0)],
        backgroundColor: [currentTheme.main, '#10b981', '#f59e0b', '#334155'],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  }

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#cbd5e1',
          padding: 18,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            return `${context.label}: ${formatNumber(context.parsed)}`
          },
        },
      },
    },
  }

  const availableFunnelMetrics = useMemo(
    () =>
      Object.entries(METRIC_OPTIONS).filter(
        ([key]) => !activeDraftFunnelSteps.includes(key) && !FUNNEL_LIBRARY_EXCLUDED_KEYS.has(key)
      ),
    [activeDraftFunnelSteps]
  )

  const funnelCards = useMemo(
    () =>
      activeDraftFunnelSteps.map((metricKey, index) => {
        const value = getSummaryMetricValue(metricKey, insights, customMetrics)
        const previousKey = activeDraftFunnelSteps[index - 1]
        const previousValue = previousKey ? getSummaryMetricValue(previousKey, insights, customMetrics) : 0

        return {
          key: metricKey,
          label: METRIC_OPTIONS[metricKey]?.label || metricKey,
          formattedValue: formatMetricValue(value, metricKey),
          conversionRate: index === 0 || previousValue <= 0 ? null : (value / previousValue) * 100,
        }
      }),
    [activeDraftFunnelSteps, insights, customMetrics]
  )

  const rdDiagnosticsSummary = useMemo(() => {
    if (!rdSummary?.diagnostics) return 'Aguardando leitura técnica das negociações do RD.'

    const allWonInRange = rdSummary.diagnostics.allDeals?.wonClosedInRange || 0
    const pipelineWonInRange = rdSummary.diagnostics.pipelineDeals?.wonClosedInRange || 0
    const filteredWonInRange = rdSummary.diagnostics.filteredDeals?.wonClosedInRange || 0

    if (rdSummary.diagnostics.pipelineFilterApplied && rdSummary.diagnostics.sellerFilterApplied) {
      return `${formatNumber(filteredWonInRange)} negociações no período após funil e vendedor.`
    }

    if (rdSummary.diagnostics.pipelineFilterApplied) {
      return `${formatNumber(pipelineWonInRange)} negociações ganhas no período dentro do funil selecionado.`
    }

    if (rdSummary.diagnostics.sellerFilterApplied) {
      return `${formatNumber(filteredWonInRange)} negociações no período após o filtro atual de vendedor.`
    }

    return `${formatNumber(allWonInRange)} negociações ganhas reconhecidas no período selecionado.`
  }, [rdSummary])
  const rdFinalSalesCount = (rdSummary?.wonOpportunityCount || 0) + (rdSummary?.wonDealsFromPreviousCohorts || 0)
  const rdFinalRevenue = (rdSummary?.wonOpportunityRevenue || 0) + (rdSummary?.wonRevenueFromPreviousCohorts || 0)
  const rdFinalAvgTicket = rdFinalSalesCount > 0 ? rdFinalRevenue / rdFinalSalesCount : 0
  const metaGeoRankingTitle = breakdowns.geoScope === 'country'
    ? 'países'
    : breakdowns.geoScope === 'region'
      ? 'regiões'
      : 'cidades'
  const metaGeoRankingDescription = breakdowns.geoScope === 'country'
    ? 'Ranking territorial com base no resultado por país da conta Meta.'
    : breakdowns.geoScope === 'region'
      ? 'Ranking territorial com base no resultado por região da conta Meta.'
      : 'Ranking territorial com base no resultado da conta Meta do cliente.'
  const metaRankingLayers = useMemo(
    () =>
      activeMetaRankingResultKeys.map((resultKey) => {
        const resultConfig = META_RESULT_COMPARISON_OPTIONS[resultKey] || META_RESULT_COMPARISON_OPTIONS.purchases
        const resultLabel = formatMetaRankingResultLabel(resultConfig.resultLabel)

        const stateItems = (breakdowns.states || [])
          .map((item) => {
            const stateMeta = resolveBrazilStateMeta(item.label)
            if (!stateMeta) return null

            return {
              ...item,
              ...stateMeta,
              conversions: getMetaBreakdownResultValue(item, resultConfig.resultMetricKey),
              averageCost: getMetaBreakdownAverageCost(item, resultConfig.resultMetricKey),
            }
          })
          .filter(Boolean)
          .filter((item) => item.conversions > 0)
          .sort((left, right) => right.conversions - left.conversions)

        const cityItems = (breakdowns.cities || [])
          .map((item) => {
            const cityMeta = resolveBrazilCityMeta(item)
            if (!cityMeta) return null

            return {
              ...item,
              ...cityMeta,
              conversions: getMetaBreakdownResultValue(item, resultConfig.resultMetricKey),
              averageCost: getMetaBreakdownAverageCost(item, resultConfig.resultMetricKey),
            }
          })
          .filter(Boolean)
          .filter((item) => item.conversions > 0)
          .sort((left, right) => right.conversions - left.conversions)

        const creativeItems = (breakdowns.creatives || [])
          .map((item) => ({
            ...item,
            conversions: getMetaBreakdownResultValue(item, resultConfig.resultMetricKey),
            averageCost: getMetaBreakdownAverageCost(item, resultConfig.resultMetricKey),
          }))
          .filter((item) => item.conversions > 0)
          .sort((left, right) => right.conversions - left.conversions)
          .slice(0, 5)

        const ageItemsRaw = (breakdowns.ages || [])
          .map((item) => {
            const conversions = getMetaBreakdownResultValue(item, resultConfig.resultMetricKey)
            const averageCost = getMetaBreakdownAverageCost(item, resultConfig.resultMetricKey)
            const conversionRateValue = getMetaBreakdownConversionRate(item, resultConfig.resultMetricKey)

            return {
              ...item,
              conversions,
              averageCost,
              conversionRateValue,
            }
          })
          .filter((item) => item.conversions > 0)
          .sort((left, right) => right.conversions - left.conversions)
          .slice(0, 5)

        const ageMaxConversions = Math.max(...ageItemsRaw.map((item) => item.conversions || 0), 1)
        const ageItems = ageItemsRaw.map((item, index) => {
          let performanceLabel = 'Em observação'
          if (index === 0) performanceLabel = 'Melhor faixa'
          else if (item.conversionRateValue >= 10 || item.conversions >= ageMaxConversions * 0.7) performanceLabel = 'Boa resposta'

          return {
            ...item,
            intensity: Math.max(0.12, item.conversions / ageMaxConversions),
            performanceLabel,
          }
        })

        const topStateItem = stateItems[0] || null
        const topStateItems = stateItems.slice(0, 5)
        const topCityItems = cityItems.slice(0, 5)
        const maxMapConversions = Math.max(
          ...stateItems.map((item) => item.conversions || 0),
          ...topCityItems.map((item) => item.conversions || 0),
          1
        )

        return {
          resultKey,
          resultConfig,
          resultLabel,
          cities: {
            key: 'cities',
            title: `Top 5 por ${metaGeoRankingTitle} de ${resultLabel}`,
            description: `${metaGeoRankingDescription} na leitura de ${resultLabel}.`,
            emptyMessage: `Sem dados geográficos de ${resultLabel} para o período.`,
            resultLabel: resultConfig.resultLabel,
            costLabel: resultConfig.costLabel,
            resultMetricKey: resultConfig.resultMetricKey,
            accent: '#38bdf8',
            resultTone: '#22c55e',
            costTone: '#f59e0b',
            previewKicker: breakdowns.geoScope === 'country'
              ? 'País'
              : breakdowns.geoScope === 'region'
                ? 'Região'
                : 'Cidade',
            detailDescription: `Compare o território selecionado com foco em ${resultLabel} para entender volume, eficiência e investimento.`,
            items: topCityItems,
          },
          creatives: {
            key: 'creatives',
            title: `Top 5 por criativos de ${resultLabel}`,
            description: `Os criativos com melhor resultado de ${resultLabel} dentro do período selecionado.`,
            emptyMessage: `Sem dados por criativo de ${resultLabel} para o período.`,
            resultLabel: resultConfig.resultLabel,
            costLabel: resultConfig.costLabel,
            resultMetricKey: resultConfig.resultMetricKey,
            accent: '#3b82f6',
            resultTone: '#10b981',
            costTone: '#fbbf24',
            previewKicker: 'Criativo',
            detailDescription: `Veja o resultado de ${resultLabel} que o criativo selecionado gerou dentro do período filtrado, com leitura de volume, custo e investimento.`,
            items: creativeItems,
          },
          ages: {
            key: 'ages',
            title: `Resultado por idade de ${resultLabel}`,
            description: `Faixas etárias com melhor performance em ${resultLabel} no período.`,
            emptyMessage: `Sem dados por idade de ${resultLabel} para o período.`,
            resultLabel: resultConfig.resultLabel,
            costLabel: resultConfig.costLabel,
            resultMetricKey: resultConfig.resultMetricKey,
            accent: '#a855f7',
            resultTone: '#38bdf8',
            costTone: '#f59e0b',
            previewKicker: 'Faixa etária',
            detailDescription: `Compare a faixa etária selecionada com foco em ${resultLabel} para identificar volume, eficiência e investimento.`,
            items: ageItems,
          },
          map: {
            stateItems,
            topStateItem,
            topStateItems,
            cityItems: topCityItems,
            maxConversions: maxMapConversions,
          },
        }
      }),
    [activeMetaRankingResultKeys, breakdowns.ages, breakdowns.cities, breakdowns.creatives, breakdowns.geoScope, breakdowns.states, metaGeoRankingDescription, metaGeoRankingTitle]
  )
  const dashboardAiInsightsPayload = useMemo(() => {
    const selectedResultLabels = availableMetaResultFilters
      .filter((item) => normalizedMetaResultFilters.includes(item.key))
      .map((item) => item.label)

    const selectedCampaignLabels = availableMetaCampaignOptions
      .filter((campaign) => activeMetaCampaignIds.includes(campaign.id))
      .map((campaign) => campaign.name)

    return {
      source: 'meta_dashboard',
      dashboardName: activeDashboardTemplate?.name || 'Dashboard principal',
      clientName: activeClient?.name || '',
      adAccountId: selectedAdAccount || '',
      period: {
        preset: DATE_PRESETS.find((preset) => preset.value === dateRange)?.label || dateRange,
        since: currentMetaResultWindow?.start ? formatLocalDateInput(currentMetaResultWindow.start) : '',
        until: currentMetaResultWindow?.end ? formatLocalDateInput(currentMetaResultWindow.end) : '',
      },
      filters: {
        resultKeys: normalizedMetaResultFilters,
        resultLabels: selectedResultLabels,
        campaignIds: activeMetaCampaignIds,
        campaignNames: selectedCampaignLabels,
        adsetIds: activeMetaAdsetIds,
        adIds: activeMetaAdIds,
      },
      summary: {
        spend,
        impressions,
        reach,
        clicks,
        cpc,
        cpm,
        ctr,
        frequency,
        totalConversions,
        conversionRate,
        purchaseValue,
        purchases,
        costPerPurchase,
        leads,
        costPerLead,
        messages,
        costPerMessage,
        reachResults,
        costPerReach,
        thruplays,
        costPerTruplay,
        roas,
        purchaseRoas,
      },
      previousSummary: {
        spend: parseFloat(previousInsights?.spend || 0),
        impressions: parseInt(previousInsights?.impressions || 0, 10),
        clicks: previousCustomMetrics.clicks || parseInt(previousInsights?.clicks || 0, 10),
        cpc: previousCustomMetrics.cpc || parseFloat(previousInsights?.cpc || 0),
        cpm: previousCustomMetrics.cpm || 0,
        ctr: previousCustomMetrics.ctr || parseFloat(previousInsights?.ctr || 0),
        frequency: previousCustomMetrics.frequency || 0,
        reach: parseInt(previousInsights?.reach || 0, 10),
        totalConversions: previousCustomMetrics.totalConversions || 0,
        conversionRate: previousCustomMetrics.conversionRate || 0,
        purchases: previousCustomMetrics.purchases || 0,
        costPerPurchase: previousCustomMetrics.cost_per_purchase || 0,
        purchaseValue: previousCustomMetrics.purchaseValue || 0,
        leads: previousCustomMetrics.leads || 0,
        costPerLead: previousCustomMetrics.cost_per_lead || 0,
        messages: previousCustomMetrics.messages || 0,
        costPerMessage: previousCustomMetrics.cost_per_message || 0,
        reachResults: previousCustomMetrics.reach_results || 0,
        costPerReach: previousCustomMetrics.cost_per_reach || 0,
        thruplays: previousCustomMetrics.thruplays || 0,
        costPerTruplay: previousCustomMetrics.cost_per_thruplay || 0,
        roas: previousCustomMetrics.roas || 0,
      },
      daily: filledMetaDailyData.map((day) => ({
        date: day.date_start,
        spend: parseFloat(day.spend || 0),
        impressions: parseInt(day.impressions || 0, 10),
        reach: parseInt(day.reach || 0, 10),
        clicks: parseInt(day.clicks || 0, 10),
        purchases: day.custom_metrics?.purchases || 0,
        leads: day.custom_metrics?.leads || 0,
        messages: day.custom_metrics?.messages || 0,
        reachResults: day.custom_metrics?.reach_results || 0,
        thruplays: day.custom_metrics?.thruplays || 0,
        purchaseValue: day.custom_metrics?.purchaseValue || 0,
        cpa: day.custom_metrics?.cpa || 0,
        roas: day.custom_metrics?.roas || 0,
      })),
      topCampaigns: filteredCampaigns.slice(0, 10).map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective || '',
        status: campaign.status || '',
        spend: Number(campaign.spend || 0),
        purchases: campaign.custom_metrics?.purchases || 0,
        costPerPurchase: campaign.custom_metrics?.cost_per_purchase || 0,
        leads: campaign.custom_metrics?.leads || 0,
        costPerLead: campaign.custom_metrics?.cost_per_lead || 0,
        messages: campaign.custom_metrics?.messages || 0,
        costPerMessage: campaign.custom_metrics?.cost_per_message || 0,
        roas: campaign.custom_metrics?.roas || 0,
      })),
      rankingLayers: metaRankingLayers.map((layer) => ({
        resultKey: layer.resultKey,
        resultLabel: layer.resultLabel,
        creatives: layer.creatives.items.slice(0, 5).map((item) => ({
          label: item.label,
          conversions: item.conversions,
          averageCost: item.averageCost,
          spend: item.spend || 0,
        })),
        ages: layer.ages.items.slice(0, 5).map((item) => ({
          label: item.label,
          conversions: item.conversions,
          averageCost: item.averageCost,
          conversionRate: item.conversionRateValue || 0,
        })),
        states: layer.map.topStateItems.slice(0, 5).map((item) => ({
          label: item.name,
          conversions: item.conversions,
          averageCost: item.averageCost,
        })),
        cities: layer.cities.items.slice(0, 5).map((item) => ({
          label: item.label,
          conversions: item.conversions,
          averageCost: item.averageCost,
        })),
      })),
    }
  }, [
    activeDashboardTemplate,
    activeClient,
    selectedAdAccount,
    dateRange,
    currentMetaResultWindow,
    normalizedMetaResultFilters,
    availableMetaResultFilters,
    activeMetaCampaignIds,
    availableMetaCampaignOptions,
    activeMetaAdsetIds,
    activeMetaAdIds,
    spend,
    impressions,
    reach,
    clicks,
    cpc,
    cpm,
    ctr,
    frequency,
    totalConversions,
    conversionRate,
    purchaseValue,
    purchases,
    costPerPurchase,
    leads,
    costPerLead,
    messages,
    costPerMessage,
    reachResults,
    costPerReach,
    thruplays,
    costPerTruplay,
    roas,
    purchaseRoas,
    filledMetaDailyData,
    filteredCampaigns,
    metaRankingLayers,
    previousInsights,
    previousCustomMetrics,
  ])
  const aiInsightsDateLabel = `${dashboardAiInsightsPayload.period?.since || '--'} ate ${dashboardAiInsightsPayload.period?.until || '--'}`
  const aiInsightsFilterLabel = (dashboardAiInsightsPayload.filters?.resultLabels || []).join(', ') || 'Todos os resultados'
  const aiHighlights = useMemo(
    () => [
      {
        label: 'Leituras',
        value: totalAiInsights,
        tone: 'neutral',
      },
      {
        label: 'Alertas',
        value: aiInsightGroups.find((group) => group.key === 'alert')?.items.length || 0,
        tone: 'alert',
      },
      {
        label: 'Oportunidades',
        value: aiInsightGroups.find((group) => group.key === 'opportunity')?.items.length || 0,
        tone: 'opportunity',
      },
      {
        label: 'Próximos passos',
        value: Array.isArray(aiInsightsResult?.structured?.nextActions) ? aiInsightsResult.structured.nextActions.length : 0,
        tone: 'info',
      },
    ],
    [aiInsightGroups, aiInsightsResult, totalAiInsights]
  )
  const activeMetaRankingDrilldownConfig = useMemo(() => {
    if (!metaRankingDrilldown) return null
    const activeLayer = metaRankingLayers.find((layer) => layer.resultKey === metaRankingDrilldown.resultKey) || null
    if (!activeLayer) return null
    return activeLayer[metaRankingDrilldown.type] || null
  }, [metaRankingDrilldown, metaRankingLayers])
  const isCreativeRankingDrilldown = metaRankingDrilldown?.type === 'creatives'
  const activeMetaRankingDrilldownItem = metaRankingDrilldown?.item || null
  useEffect(() => {
    if (!metaRankingDrilldown?.type || !activeMetaRankingDrilldownItem || !selectedAdAccount || !hasMetaConfigured) {
      setMetaRankingDetailDailyData([])
      setMetaRankingDetailDailyError('')
      setMetaRankingDetailDailyLoading(false)
      return
    }

    let cancelled = false

    const fetchDetailDailySeries = async () => {
      try {
        setMetaRankingDetailDailyLoading(true)
        setMetaRankingDetailDailyError('')

        let response

        if (metaRankingDrilldown.type === 'creatives' && activeMetaRankingDrilldownItem.adId) {
          const params = new URLSearchParams({
            ad_account_id: selectedAdAccount,
            date_preset: dateRange,
            ad_ids: activeMetaRankingDrilldownItem.adId,
          })

          if (dateRange === 'custom') {
            params.set('since', customSince)
            params.set('until', customUntil)
          }

          if (hasActiveMetaCampaignNarrowing && metaFilteredCampaignIds.length > 0) {
            params.set('campaign_ids', metaFilteredCampaignIds.join(','))
          }
          if (hasActiveMetaAdsetNarrowing && activeMetaAdsetIds.length > 0) {
            params.set('adset_ids', activeMetaAdsetIds.join(','))
          }

          response = await fetch(`/api/meta/insights?${params.toString()}`, { headers: metaRequestHeaders })
        } else {
          const detailScope = metaRankingDrilldown.type === 'cities'
            ? (breakdowns.geoScope === 'region' ? 'region' : breakdowns.geoScope === 'country' ? 'country' : 'city')
            : metaRankingDrilldown.type === 'ages'
              ? 'age'
              : metaRankingDrilldown.type === 'states'
                ? 'region'
                : ''

          const params = new URLSearchParams({
            ad_account_id: selectedAdAccount,
            date_preset: dateRange,
            detail_type: metaRankingDrilldown.type,
            detail_value: activeMetaRankingDrilldownItem.label,
          })

          if (detailScope) {
            params.set('detail_scope', detailScope)
          }

          if (dateRange === 'custom') {
            params.set('since', customSince)
            params.set('until', customUntil)
          }

          if (hasActiveMetaCampaignNarrowing && metaFilteredCampaignIds.length > 0) {
            params.set('campaign_ids', metaFilteredCampaignIds.join(','))
          }
          if (hasActiveMetaAdsetNarrowing && activeMetaAdsetIds.length > 0) {
            params.set('adset_ids', activeMetaAdsetIds.join(','))
          }
          if (hasActiveMetaAdNarrowing && activeMetaAdIds.length > 0) {
            params.set('ad_ids', activeMetaAdIds.join(','))
          }

          response = await fetch(`/api/meta/breakdowns?${params.toString()}`, { headers: metaRequestHeaders })
        }

        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível carregar a evolução detalhada desse item.')
        }

        if (cancelled) return
        setMetaRankingDetailDailyData(metaRankingDrilldown.type === 'creatives' ? (data?.daily || []) : (data?.detail_daily || []))
      } catch (error) {
        if (cancelled) return
        setMetaRankingDetailDailyData([])
        setMetaRankingDetailDailyError(error.message || 'Não foi possível carregar a evolução detalhada desse item.')
      } finally {
        if (!cancelled) {
          setMetaRankingDetailDailyLoading(false)
        }
      }
    }

    fetchDetailDailySeries()

    return () => {
      cancelled = true
    }
  }, [
    metaRankingDrilldown,
    activeMetaRankingDrilldownItem,
    selectedAdAccount,
    hasMetaConfigured,
    dateRange,
    customSince,
    customUntil,
    hasActiveMetaCampaignNarrowing,
    hasActiveMetaAdsetNarrowing,
    hasActiveMetaAdNarrowing,
    metaFilteredCampaignIds,
    activeMetaAdsetIds,
    activeMetaAdIds,
    metaRequestHeaders,
  ])
  const metaRankingDetailDailySeries = useMemo(
    () => buildMetaDetailDailySeries(
      metaRankingDetailDailyData.map((item) => ({
        ...item,
        resultMetricKey: activeMetaRankingDrilldownConfig?.resultMetricKey || 'totalConversions',
      })),
      currentMetaResultWindow
    ),
    [activeMetaRankingDrilldownConfig?.resultMetricKey, metaRankingDetailDailyData, currentMetaResultWindow]
  )
  const metaRankingComparisonChartData = useMemo(() => {
    if (!activeMetaRankingDrilldownConfig?.items?.length || !activeMetaRankingDrilldownItem) return null

    if (!metaRankingDetailDailySeries.length) {
      return null
    }

    return {
      labels: metaRankingDetailDailySeries.map((item) => item.label),
      datasets: [
        {
          type: 'bar',
          label: activeMetaRankingDrilldownConfig.resultLabel,
          data: metaRankingDetailDailySeries.map((item) => item.results),
          backgroundColor: `${activeMetaRankingDrilldownConfig.resultTone}66`,
          borderColor: activeMetaRankingDrilldownConfig.resultTone,
          borderWidth: 1,
          borderRadius: 10,
          maxBarThickness: 36,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: isCreativeRankingDrilldown ? 'Custo por conversão' : activeMetaRankingDrilldownConfig.costLabel,
          data: metaRankingDetailDailySeries.map((item) => item.cost),
          borderColor: activeMetaRankingDrilldownConfig.costTone,
          backgroundColor: `${activeMetaRankingDrilldownConfig.costTone}22`,
          borderWidth: 3,
          borderDash: [7, 5],
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: activeMetaRankingDrilldownConfig.costTone,
          pointBorderWidth: 2,
          tension: 0.34,
          yAxisID: 'y1',
        },
      ],
    }
  }, [activeMetaRankingDrilldownConfig, activeMetaRankingDrilldownItem, isCreativeRankingDrilldown, metaRankingDetailDailySeries, metaRankingDrilldown])
  const metaRankingComparisonChartOptions = useMemo(() => {
    if (!activeMetaRankingDrilldownConfig) return null

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.dataset.yAxisID === 'y'
                ? formatNumber(context.parsed.y)
                : formatCurrency(context.parsed.y)}`
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: {
              size: 11,
              weight: 600,
            },
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
          ticks: {
            color: '#94a3b8',
            precision: 0,
            callback(value) {
              return formatNumber(value)
            },
          },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            callback(value) {
              return formatCurrency(value)
            },
          },
        },
      },
    }
  }, [activeMetaRankingDrilldownConfig])
  const metaRankingDrilldownSummary = useMemo(() => {
    if (!activeMetaRankingDrilldownItem || !activeMetaRankingDrilldownConfig) return null

    const conversions = getMetaBreakdownResultValue(activeMetaRankingDrilldownItem, activeMetaRankingDrilldownConfig.resultMetricKey)
    const spendValue = Number(activeMetaRankingDrilldownItem.spend || 0)
    const avgCost = getMetaBreakdownAverageCost(activeMetaRankingDrilldownItem, activeMetaRankingDrilldownConfig.resultMetricKey)
    const clicksValue = Number(activeMetaRankingDrilldownItem.clicks || 0)
    const impressionsValue = Number(activeMetaRankingDrilldownItem.impressions || 0)
    const conversionRateValue = getMetaBreakdownConversionRate(activeMetaRankingDrilldownItem, activeMetaRankingDrilldownConfig.resultMetricKey)

    return {
      conversions,
      spendValue,
      avgCost,
      clicksValue,
      impressionsValue,
      conversionRateValue,
    }
  }, [activeMetaRankingDrilldownConfig, activeMetaRankingDrilldownItem])
  const metaDashboardMetricValues = useMemo(
    () => ({
      spend,
      impressions,
      clicks,
      cpc,
      ctr,
      totalConversions,
      reach,
      cpm,
      frequency,
      conversionRate,
      videoViews: customMetrics.videoViews || 0,
      videoViewRate: customMetrics.videoViewRate || 0,
      thruplay: customMetrics.thruplay || 0,
      hookRate: customMetrics.hookRate || 0,
      averageTicket,
      purchaseValue,
      purchases,
      costPerPurchase,
      leads,
      costPerLead,
      messages,
      costPerMessage,
      reachResults,
      costPerReach,
      thruplays,
      costPerTruplay,
      clicksWithoutConversion: Math.max(clicks - totalConversions, 0),
      roas,
    }),
    [spend, impressions, clicks, cpc, ctr, totalConversions, reach, cpm, frequency, conversionRate, customMetrics.videoViews, customMetrics.videoViewRate, customMetrics.thruplay, customMetrics.hookRate, averageTicket, purchaseValue, purchases, costPerPurchase, leads, costPerLead, messages, costPerMessage, reachResults, costPerReach, thruplays, costPerTruplay, roas]
  )
  const previousMetaDashboardMetricValues = useMemo(
    () => ({
      spend: parseFloat(previousInsights?.spend || 0),
      impressions: parseInt(previousInsights?.impressions || 0, 10),
      clicks: previousCustomMetrics.clicks || parseInt(previousInsights?.clicks || 0, 10),
      cpc: previousCustomMetrics.cpc || parseFloat(previousInsights?.cpc || 0),
      ctr: previousCustomMetrics.ctr || parseFloat(previousInsights?.ctr || 0),
      totalConversions: previousCustomMetrics.totalConversions || 0,
      reach: parseInt(previousInsights?.reach || 0, 10),
      cpm: previousCustomMetrics.cpm || 0,
      frequency: previousCustomMetrics.frequency || 0,
      conversionRate: previousCustomMetrics.conversionRate || 0,
      videoViews: previousCustomMetrics.videoViews || 0,
      videoViewRate: previousCustomMetrics.videoViewRate || 0,
      thruplay: previousCustomMetrics.thruplay || 0,
      hookRate: previousCustomMetrics.hookRate || 0,
      averageTicket: previousCustomMetrics.averageTicket || 0,
      purchaseValue: previousCustomMetrics.purchaseValue || 0,
      purchases: previousCustomMetrics.purchases || 0,
      costPerPurchase: previousCustomMetrics.cost_per_purchase || 0,
      leads: previousCustomMetrics.leads || 0,
      costPerLead: previousCustomMetrics.cost_per_lead || 0,
      messages: previousCustomMetrics.messages || 0,
      costPerMessage: previousCustomMetrics.cost_per_message || 0,
      reachResults: previousCustomMetrics.reach_results || 0,
      costPerReach: previousCustomMetrics.cost_per_reach || 0,
      thruplays: previousCustomMetrics.thruplays || 0,
      costPerTruplay: previousCustomMetrics.cost_per_thruplay || 0,
      clicksWithoutConversion: Math.max((previousCustomMetrics.clicks || parseInt(previousInsights?.clicks || 0, 10)) - (previousCustomMetrics.totalConversions || 0), 0),
      roas: previousCustomMetrics.roas || 0,
    }),
    [previousInsights, previousCustomMetrics]
  )
  const metaDashboardMetricCards = useMemo(
    () =>
      draftMetaDashboardMetricLayouts
        .map((layoutItem) => {
          const metric = META_TEMPLATE_METRIC_OPTIONS[layoutItem.metricKey]
          if (!metric) return null

          return {
            id: layoutItem.id,
            key: layoutItem.metricKey,
            size: layoutItem.size,
            title: metric.label,
            description: metric.description,
            icon: metric.icon,
            tone: metric.tone,
            value: formatDashboardMetricValue(metaDashboardMetricValues[layoutItem.metricKey], metric.type),
            trend: buildMetricTrend(
              layoutItem.metricKey,
              metaDashboardMetricValues[layoutItem.metricKey],
              previousMetaDashboardMetricValues[layoutItem.metricKey],
              metric.type
            ),
          }
        })
        .filter(Boolean),
    [draftMetaDashboardMetricLayouts, metaDashboardMetricValues, previousMetaDashboardMetricValues]
  )
  const metaExtraDashboardMetricCards = useMemo(
    () => metaDashboardMetricCards.filter((card) => !FIXED_META_METRIC_KEYS.has(card.key)),
    [metaDashboardMetricCards]
  )
  const availableMetaDashboardMetricOptions = useMemo(
    () =>
      Object.entries(META_TEMPLATE_METRIC_OPTIONS).filter(
        ([metricKey]) =>
          !FIXED_META_METRIC_KEYS.has(metricKey)
          && !draftMetaDashboardMetricLayouts.some((item) => item.metricKey === metricKey)
      ),
    [draftMetaDashboardMetricLayouts]
  )
  const rdDashboardMetricValues = useMemo(
    () => ({
      opportunityCount: rdSummary?.opportunityCount || 0,
      qualifiedOpportunityCount: rdSummary?.qualifiedOpportunityCount || 0,
      wonOpportunityCount: rdSummary?.wonOpportunityCount || 0,
      wonOpportunityRevenue: rdSummary?.wonOpportunityRevenue || 0,
      avgTicketWonByCreation: rdSummary?.avgTicketWonByCreation || 0,
      leadToQualifiedRate: rdSummary?.leadToQualifiedRate || 0,
      qualifiedToWonRate: rdSummary?.qualifiedToWonRate || 0,
      leadToWonRate: rdSummary?.leadToWonRate || 0,
      lostOpportunityCount: rdSummary?.lostOpportunityCount || 0,
      wonDeals: rdSummary?.wonDeals || 0,
      wonDealsFromPreviousCohorts: rdSummary?.wonDealsFromPreviousCohorts || 0,
      wonRevenue: rdSummary?.wonRevenue || 0,
      avgTicketWon: rdSummary?.avgTicketWon || 0,
      wonRevenueFromPreviousCohorts: rdSummary?.wonRevenueFromPreviousCohorts || 0,
      avgTicketWonPreviousCohorts: rdSummary?.avgTicketWonPreviousCohorts || 0,
      rdFinalSalesCount,
      rdFinalRevenue,
      rdFinalAvgTicket,
      contacts: rdSummary?.contacts || 0,
      contactsInPeriod: rdSummary?.contactsInPeriod || 0,
      contactsMoved: rdSummary?.contactsMoved || 0,
      qualifiedDeals: rdSummary?.qualifiedDeals || 0,
      qualifiedContacts: rdSummary?.qualifiedContacts || 0,
      closeRate: rdSummary?.closeRate || 0,
      dealToWonRate: rdSummary?.dealToWonRate || 0,
      leadToDealRate: rdSummary?.leadToDealRate || 0,
      sourceConversionRate: rdSummary?.sourceConversionRate || 0,
      avgLeadToWonDays: rdSummary?.avgLeadToWonDays || 0,
      avgDealToWonDays: rdSummary?.avgDealToWonDays || 0,
      avgLeadToWonDaysFiltered: rdSummary?.avgLeadToWonDaysFiltered || 0,
      avgDealToWonDaysFiltered: rdSummary?.avgDealToWonDaysFiltered || 0,
      contactsWithDeals: rdSummary?.contactsWithDeals || 0,
      contactsWithWonDeals: rdSummary?.contactsWithWonDeals || 0,
      lostContacts: rdSummary?.lostContacts || 0,
    }),
    [rdSummary, rdFinalSalesCount, rdFinalRevenue, rdFinalAvgTicket]
  )
  const previousRdFinalSalesCount = (previousRdSummary?.wonOpportunityCount || 0) + (previousRdSummary?.wonDealsFromPreviousCohorts || 0)
  const previousRdFinalRevenue = (previousRdSummary?.wonOpportunityRevenue || 0) + (previousRdSummary?.wonRevenueFromPreviousCohorts || 0)
  const previousRdFinalAvgTicket = previousRdFinalSalesCount > 0 ? previousRdFinalRevenue / previousRdFinalSalesCount : 0
  const previousRdDashboardMetricValues = useMemo(
    () => ({
      opportunityCount: previousRdSummary?.opportunityCount || 0,
      qualifiedOpportunityCount: previousRdSummary?.qualifiedOpportunityCount || 0,
      wonOpportunityCount: previousRdSummary?.wonOpportunityCount || 0,
      wonOpportunityRevenue: previousRdSummary?.wonOpportunityRevenue || 0,
      avgTicketWonByCreation: previousRdSummary?.avgTicketWonByCreation || 0,
      leadToQualifiedRate: previousRdSummary?.leadToQualifiedRate || 0,
      qualifiedToWonRate: previousRdSummary?.qualifiedToWonRate || 0,
      leadToWonRate: previousRdSummary?.leadToWonRate || 0,
      lostOpportunityCount: previousRdSummary?.lostOpportunityCount || 0,
      wonDeals: previousRdSummary?.wonDeals || 0,
      wonDealsFromPreviousCohorts: previousRdSummary?.wonDealsFromPreviousCohorts || 0,
      wonRevenue: previousRdSummary?.wonRevenue || 0,
      avgTicketWon: previousRdSummary?.avgTicketWon || 0,
      wonRevenueFromPreviousCohorts: previousRdSummary?.wonRevenueFromPreviousCohorts || 0,
      avgTicketWonPreviousCohorts: previousRdSummary?.avgTicketWonPreviousCohorts || 0,
      rdFinalSalesCount: previousRdFinalSalesCount,
      rdFinalRevenue: previousRdFinalRevenue,
      rdFinalAvgTicket: previousRdFinalAvgTicket,
      contacts: previousRdSummary?.contacts || 0,
      contactsInPeriod: previousRdSummary?.contactsInPeriod || 0,
      contactsMoved: previousRdSummary?.contactsMoved || 0,
      qualifiedDeals: previousRdSummary?.qualifiedDeals || 0,
      qualifiedContacts: previousRdSummary?.qualifiedContacts || 0,
      closeRate: previousRdSummary?.closeRate || 0,
      dealToWonRate: previousRdSummary?.dealToWonRate || 0,
      leadToDealRate: previousRdSummary?.leadToDealRate || 0,
      sourceConversionRate: previousRdSummary?.sourceConversionRate || 0,
      avgLeadToWonDays: previousRdSummary?.avgLeadToWonDays || 0,
      avgDealToWonDays: previousRdSummary?.avgDealToWonDays || 0,
      avgLeadToWonDaysFiltered: previousRdSummary?.avgLeadToWonDaysFiltered || 0,
      avgDealToWonDaysFiltered: previousRdSummary?.avgDealToWonDaysFiltered || 0,
      contactsWithDeals: previousRdSummary?.contactsWithDeals || 0,
      contactsWithWonDeals: previousRdSummary?.contactsWithWonDeals || 0,
      lostContacts: previousRdSummary?.lostContacts || 0,
    }),
    [previousRdSummary, previousRdFinalSalesCount, previousRdFinalRevenue, previousRdFinalAvgTicket]
  )
  const rdDashboardMetricCards = useMemo(
    () =>
      draftRdDashboardMetricLayouts
        .map((layoutItem) => {
          const metric = RD_TEMPLATE_METRIC_OPTIONS[layoutItem.metricKey]
          if (!metric) return null

          return {
            id: layoutItem.id,
            key: layoutItem.metricKey,
            size: layoutItem.size,
            title: metric.label,
            description: metric.description,
            icon: metric.icon,
            tone: metric.tone,
            value: formatDashboardMetricValue(rdDashboardMetricValues[layoutItem.metricKey], metric.type),
            trend: buildMetricTrend(
              layoutItem.metricKey,
              rdDashboardMetricValues[layoutItem.metricKey],
              previousRdDashboardMetricValues[layoutItem.metricKey],
              metric.type
            ),
          }
        })
        .filter(Boolean),
    [draftRdDashboardMetricLayouts, rdDashboardMetricValues, previousRdDashboardMetricValues]
  )
  const rdExtraDashboardMetricCards = useMemo(
    () => rdDashboardMetricCards.filter((card) => !FIXED_RD_METRIC_KEYS.has(card.key)),
    [rdDashboardMetricCards]
  )
  const availableRdDashboardMetricOptions = useMemo(
    () =>
      Object.entries(RD_TEMPLATE_METRIC_OPTIONS).filter(
        ([metricKey]) =>
          !FIXED_RD_METRIC_KEYS.has(metricKey)
          && !draftRdDashboardMetricLayouts.some((item) => item.metricKey === metricKey)
      ),
    [draftRdDashboardMetricLayouts]
  )
  const googleSheetsMetricOptions = useMemo(
    () => {
      const baseOptions = {}

      if (googleSheetsSummary?.rowMetric) {
        baseOptions[googleSheetsSummary.rowMetric.id] = {
          label: googleSheetsSummary.rowMetric.label,
          type: googleSheetsSummary.rowMetric.type || 'number',
          icon: 'bx-table',
          tone: 'blue',
          description: 'Quantidade total de linhas válidas importadas da planilha.',
        }
      }

      ;(googleSheetsSummary?.statusSummary?.counts || []).forEach((status) => {
        baseOptions[status.id] = {
          label: status.label,
          type: 'number',
          icon: 'bx-git-branch',
          tone: 'emerald',
          description: `Quantidade de registros atualmente em ${status.label}.`,
        }
      })

      return (googleSheetsSummary?.numericColumns || []).reduce((accumulator, column) => {
        accumulator[column.id] = {
          label: column.header,
          type: column.type || 'number',
          icon: 'bx-spreadsheet',
          tone: 'emerald',
          description: `Soma consolidada da coluna ${column.header} na planilha vinculada.`,
        }
        return accumulator
      }, baseOptions)
    },
    [googleSheetsSummary]
  )
  const googleSheetsMetricValues = useMemo(
    () => {
      const baseValues = {}

      if (googleSheetsSummary?.rowMetric) {
        baseValues[googleSheetsSummary.rowMetric.id] = googleSheetsSummary.rowMetric.value || 0
      }

      ;(googleSheetsSummary?.statusSummary?.counts || []).forEach((status) => {
        baseValues[status.id] = status.count || 0
      })

      return (googleSheetsSummary?.numericColumns || []).reduce((accumulator, column) => {
        accumulator[column.id] = column.sum || 0
        return accumulator
      }, baseValues)
    },
    [googleSheetsSummary]
  )
  const googleSheetsDashboardMetricCards = useMemo(
    () =>
      draftSheetsDashboardMetricLayouts
        .map((layoutItem) => {
          const metric = googleSheetsMetricOptions[layoutItem.metricKey]
          if (!metric) return null

          return {
            id: layoutItem.id,
            key: layoutItem.metricKey,
            size: layoutItem.size,
            title: metric.label,
            description: metric.description,
            icon: metric.icon,
            tone: metric.tone,
            value: formatDashboardMetricValue(googleSheetsMetricValues[layoutItem.metricKey], metric.type),
          }
        })
        .filter(Boolean),
    [draftSheetsDashboardMetricLayouts, googleSheetsMetricOptions, googleSheetsMetricValues]
  )
  const availableGoogleSheetsMetricOptions = useMemo(
    () =>
      Object.entries(googleSheetsMetricOptions).filter(
        ([metricKey]) => !draftSheetsDashboardMetricLayouts.some((item) => item.metricKey === metricKey)
      ),
    [googleSheetsMetricOptions, draftSheetsDashboardMetricLayouts]
  )
  const defaultGoogleSheetsKpis = useMemo(
    () => {
      const defaultItems = []

      if (googleSheetsSummary?.rowMetric) {
        defaultItems.push({
          key: googleSheetsSummary.rowMetric.id,
          title: googleSheetsSummary.rowMetric.label,
          value: formatDashboardMetricValue(googleSheetsSummary.rowMetric.value || 0, googleSheetsSummary.rowMetric.type || 'number'),
          icon: 'bx-table',
          tone: 'blue',
        })
      }

      ;(googleSheetsSummary?.statusSummary?.counts || []).slice(0, 5).forEach((status) => {
        defaultItems.push({
          key: status.id,
          title: status.label,
          value: formatNumber(status.count || 0),
          icon: 'bx-git-branch',
          tone: 'emerald',
        })
      })

      if (defaultItems.length > 0) return defaultItems

      return (googleSheetsSummary?.numericColumns || []).slice(0, 4).map((column) => ({
        key: column.id,
        title: column.header,
        value: formatDashboardMetricValue(column.sum || 0, column.type || 'number'),
        icon: 'bx-spreadsheet',
        tone: 'emerald',
      }))
    },
    [googleSheetsSummary]
  )
  const clickUpKpis = [
    { key: 'totalTasks', title: 'Tarefas totais', value: formatNumber(clickUpSummary?.totalTasks || 0), icon: 'bx-task', tone: 'purple' },
    { key: 'openTasks', title: 'Em aberto', value: formatNumber(clickUpSummary?.openTasks || 0), icon: 'bx-loader-circle', tone: 'blue' },
    { key: 'inProgressTasks', title: 'Em andamento', value: formatNumber(clickUpSummary?.inProgressTasks || 0), icon: 'bx-run', tone: 'cyan' },
    { key: 'completedTasks', title: 'Concluídas', value: formatNumber(clickUpSummary?.completedTasks || 0), icon: 'bx-check-circle', tone: 'emerald' },
    { key: 'blockedTasks', title: 'Bloqueadas', value: formatNumber(clickUpSummary?.blockedTasks || 0), icon: 'bx-block', tone: 'pink' },
    { key: 'overdueTasks', title: 'Atrasadas', value: formatNumber(clickUpSummary?.overdueTasks || 0), icon: 'bx-time-five', tone: 'orange' },
  ]
  const mondayPeriodLabel = getDatePresetLabel(mondayDateRange, mondayCustomSince, mondayCustomUntil)
  const mondayOwnerOptions = mondaySummary?.availableOwners || []
  const selectedMondayOwnerLabel = mondayOwnerFilter === 'all'
    ? 'Todos os usuários'
    : (mondayOwnerOptions.find((item) => item.id === mondayOwnerFilter)?.label || mondayOwnerFilter)
  const mondayDrilldownOwnerGroups = useMemo(
    () => buildMondayDrilldownOwnerGroups(mondayMetricDrilldown?.items || [], mondayOwnerFilter, selectedMondayOwnerLabel),
    [mondayMetricDrilldown, mondayOwnerFilter, selectedMondayOwnerLabel]
  )
  const mondayKpis = [
    { key: 'totalItems', title: 'Itens no recorte', value: formatNumber(mondaySummary?.totalItems || 0), icon: 'bx-columns', tone: 'gold' },
    { key: 'activeItems', title: 'Em andamento', value: formatNumber(mondaySummary?.activeItems || 0), icon: 'bx-loader-circle', tone: 'blue' },
    { key: 'overdueItems', title: 'Atrasados', value: formatNumber(mondaySummary?.overdueItems || 0), icon: 'bx-time-five', tone: 'orange' },
    { key: 'blockedItems', title: 'Bloqueados', value: formatNumber(mondaySummary?.blockedItems || 0), icon: 'bx-block', tone: 'pink' },
    { key: 'dueSoonItems', title: 'Vencem em 7 dias', value: formatNumber(mondaySummary?.dueSoonItems || 0), icon: 'bx-alarm-exclamation', tone: 'purple' },
    { key: 'unassignedItems', title: 'Sem responsável', value: formatNumber(mondaySummary?.unassignedItems || 0), icon: 'bx-user-x', tone: 'cyan' },
  ]
  const metaMediaKpis = [
    { key: 'spend', title: 'Investimento', value: formatCurrency(spend), rawValue: spend, type: 'currency', icon: 'bx-wallet-alt', tone: 'blue' },
    { key: 'impressions', title: 'Impressões', value: formatNumber(impressions), rawValue: impressions, type: 'number', icon: 'bx-show', tone: 'purple' },
    { key: 'cpm', title: 'CPM', value: formatCurrency(cpm), rawValue: cpm, type: 'currency', icon: 'bx-bar-chart-alt-2', tone: 'purple' },
    { key: 'reach', title: 'Alcance', value: formatNumber(reach), rawValue: reach, type: 'number', icon: 'bx-radar', tone: 'blue' },
    { key: 'frequency', title: 'Frequência', value: formatDashboardMetricValue(frequency, 'decimal'), rawValue: frequency, type: 'decimal', icon: 'bx-repeat', tone: 'gold' },
    { key: 'clicks', title: 'Cliques no link', value: formatNumber(clicks), rawValue: clicks, type: 'number', icon: 'bx-pointer', tone: 'cyan' },
    { key: 'cpc', title: 'CPC', value: formatCurrency(cpc), rawValue: cpc, type: 'currency', icon: 'bx-purchase-tag', tone: 'orange' },
    { key: 'ctr', title: 'CTR', value: formatPercent(ctr), rawValue: ctr, type: 'percent', icon: 'bx-mouse', tone: 'pink' },
    { key: 'totalConversions', title: 'Conversões totais', value: formatNumber(totalConversions), rawValue: totalConversions, type: 'number', icon: 'bx-line-chart', tone: 'gold' },
    { key: 'conversionRate', title: 'Taxa de conversão clique -> conversão', value: formatPercent(conversionRate), rawValue: conversionRate, type: 'percent', icon: 'bx-git-compare', tone: 'emerald' },
    { key: 'purchaseValue', title: 'Faturamento', value: formatCurrency(purchaseValue), rawValue: purchaseValue, type: 'currency', icon: 'bx-money', tone: 'emerald' },
  ]
  const metaConversionGroups = [
    {
      key: 'purchases',
      title: 'Compras',
      description: 'Resultado de vendas atribuídas no período',
      icon: 'bx-cart',
      tone: 'emerald',
      resultValue: purchases,
      secondaryInsights: metaSecondaryResultInsights.purchases,
      stats: [
        { label: 'Compras', value: formatNumber(purchases) },
        { label: 'Custo por compra', value: formatCurrency(costPerPurchase) },
        { label: 'ROAS da compra', value: formatMultiplier(purchaseRoas) },
      ],
    },
    {
      key: 'leads',
      title: 'Cadastros',
      description: 'Conversões em leads atribuídas no período',
      icon: 'bx-user-plus',
      tone: 'gold',
      resultValue: leads,
      secondaryInsights: metaSecondaryResultInsights.leads,
      stats: [
        { label: 'Cadastros', value: formatNumber(leads) },
        { label: 'Custo por cadastro', value: formatCurrency(costPerLead) },
      ],
    },
    {
      key: 'messages',
      title: 'Mensagens iniciadas',
      description: 'Conversas iniciadas em canais de mensagem',
      icon: 'bx-message-rounded-dots',
      tone: 'blue',
      resultValue: messages,
      secondaryInsights: metaSecondaryResultInsights.messages,
      stats: [
        { label: 'Mensagens iniciadas', value: formatNumber(messages) },
        { label: 'Custo por mensagem iniciada', value: formatCurrency(costPerMessage) },
      ],
    },
    {
      key: 'reach',
      title: 'Alcance',
      description: 'Entrega das campanhas classificadas como alcance',
      icon: 'bx-radar',
      tone: 'cyan',
      resultValue: reachResults,
      stats: [
        { label: 'Pessoas alcançadas', value: formatNumber(reachResults) },
        { label: 'Custo por alcance', value: formatCurrency(costPerReach) },
      ],
    },
    {
      key: 'truplays',
      title: 'TruPlays',
      description: 'Resultados das campanhas de vídeo no período',
      icon: 'bx-play-circle',
      tone: 'purple',
      resultValue: thruplays,
      stats: [
        { label: 'TruPlays', value: formatNumber(thruplays) },
        { label: 'Custo por TruPlay', value: formatCurrency(costPerTruplay) },
      ],
    },
  ]
  const activeMetaComparisonGroups = useMemo(
    () => metaConversionGroups.filter((group) => normalizedMetaResultFilters.includes(group.key)),
    [metaConversionGroups, normalizedMetaResultFilters]
  )
  useEffect(() => {
    const rankedOptions = activeMetaComparisonGroups
      .map((group) => ({ key: group.key, value: group.resultValue || 0 }))
      .sort((left, right) => right.value - left.value)

    if (!rankedOptions.length) return
    if (!rankedOptions.some((item) => item.key === metaResultPreviewKey)) {
      setMetaResultPreviewKey(rankedOptions[0].key)
      return
    }
    if ((rankedOptions[0]?.value || 0) <= 0) return
    if ((rankedOptions.find((item) => item.key === metaResultPreviewKey)?.value || 0) > 0) return

    setMetaResultPreviewKey(rankedOptions[0].key)
  }, [activeMetaComparisonGroups, metaResultPreviewKey])
  const activeMetaSecondaryResultGroup = metaConversionGroups.find((group) => group.key === metaSecondaryResultDrilldown) || null
  const activeMetaSecondaryResultInsights = activeMetaSecondaryResultGroup?.secondaryInsights || null
  const activeMetaResultPreviewConfig = META_RESULT_COMPARISON_OPTIONS[metaResultPreviewKey] || META_RESULT_COMPARISON_OPTIONS.purchases
  const metaCampaignObjectiveMap = useMemo(
    () => Object.fromEntries(
      campaigns.map((campaign) => [String(campaign.id || '').trim(), campaign.objective || ''])
    ),
    [campaigns]
  )
  const metaResultPreviewSeries = useMemo(
    () => buildMetaResultComparisonSeries(dailyCampaignData, activeMetaResultPreviewConfig.resultMetricKey, metaResultGrouping, metaCampaignObjectiveMap, currentMetaResultWindow),
    [activeMetaResultPreviewConfig, dailyCampaignData, metaCampaignObjectiveMap, metaResultGrouping, currentMetaResultWindow]
  )
  const metaResultPreviewChartData = useMemo(
    () => ({
      labels: metaResultPreviewSeries.length ? metaResultPreviewSeries.map((bucket) => bucket.label) : ['Sem dados'],
      datasets: [
        {
          label: activeMetaResultPreviewConfig.resultLabel,
          data: metaResultPreviewSeries.length ? metaResultPreviewSeries.map((bucket) => bucket.results) : [0],
          borderColor: activeMetaResultPreviewConfig.resultTone,
          backgroundColor: `${activeMetaResultPreviewConfig.resultTone}22`,
          borderWidth: 3,
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: activeMetaResultPreviewConfig.resultTone,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.34,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: activeMetaResultPreviewConfig.costLabel,
          data: metaResultPreviewSeries.length ? metaResultPreviewSeries.map((bucket) => bucket.cost) : [0],
          borderColor: activeMetaResultPreviewConfig.costTone,
          backgroundColor: 'transparent',
          borderWidth: 3,
          borderDash: [7, 5],
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: activeMetaResultPreviewConfig.costTone,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.34,
          yAxisID: 'y1',
        },
      ],
    }),
    [activeMetaResultPreviewConfig, metaResultPreviewSeries]
  )
  const metaResultPreviewChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.dataset.yAxisID === 'y'
                ? formatNumber(context.parsed.y)
                : formatCurrency(context.parsed.y)}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 16 },
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#94a3b8',
            precision: 0,
            callback(value) {
              return formatChartAxis(value, activeMetaResultPreviewConfig.resultMetricKey)
            },
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            callback(value) {
              return formatCurrency(value)
            },
          },
        },
      },
    }),
    [activeMetaResultPreviewConfig]
  )
  const metaResultPreviewSummary = useMemo(() => {
    const totalResults = metaResultPreviewSeries.reduce((accumulator, bucket) => accumulator + bucket.results, 0)
    const totalSpend = metaResultPreviewSeries.reduce((accumulator, bucket) => accumulator + bucket.spend, 0)

    return {
      totalResults,
      totalSpend,
      averageCost: totalResults > 0 ? totalSpend / totalResults : 0,
      points: metaResultPreviewSeries.length,
    }
  }, [metaResultPreviewSeries])
  const activeMetaResultDrilldownConfig = metaResultDrilldown
    ? META_RESULT_COMPARISON_OPTIONS[metaResultDrilldown.key] || null
    : null
  const metaResultComparisonSeries = useMemo(
    () => (
      activeMetaResultDrilldownConfig
        ? buildMetaResultComparisonSeries(dailyCampaignData, activeMetaResultDrilldownConfig.resultMetricKey, metaResultGrouping, metaCampaignObjectiveMap, currentMetaResultWindow)
        : []
    ),
    [activeMetaResultDrilldownConfig, dailyCampaignData, metaCampaignObjectiveMap, metaResultGrouping, currentMetaResultWindow]
  )
  const metaResultComparisonChartData = useMemo(() => {
    if (!activeMetaResultDrilldownConfig) return null

    return {
      labels: metaResultComparisonSeries.length ? metaResultComparisonSeries.map((bucket) => bucket.label) : ['Sem dados'],
      datasets: [
        {
          label: activeMetaResultDrilldownConfig.resultLabel,
          data: metaResultComparisonSeries.length ? metaResultComparisonSeries.map((bucket) => bucket.results) : [0],
          borderColor: activeMetaResultDrilldownConfig.resultTone,
          backgroundColor: `${activeMetaResultDrilldownConfig.resultTone}22`,
          borderWidth: 3,
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: activeMetaResultDrilldownConfig.resultTone,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.34,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: activeMetaResultDrilldownConfig.costLabel,
          data: metaResultComparisonSeries.length ? metaResultComparisonSeries.map((bucket) => bucket.cost) : [0],
          borderColor: activeMetaResultDrilldownConfig.costTone,
          backgroundColor: 'transparent',
          borderWidth: 3,
          borderDash: [7, 5],
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: activeMetaResultDrilldownConfig.costTone,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.34,
          yAxisID: 'y1',
        },
      ],
    }
  }, [activeMetaResultDrilldownConfig, metaResultComparisonSeries])
  const metaResultComparisonChartOptions = useMemo(() => {
    if (!activeMetaResultDrilldownConfig) return null

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.dataset.yAxisID === 'y'
                ? formatNumber(context.parsed.y)
                : formatCurrency(context.parsed.y)}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 16 },
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#94a3b8',
            precision: 0,
            callback(value) {
              return formatChartAxis(value, activeMetaResultDrilldownConfig.resultMetricKey)
            },
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            callback(value) {
              return formatChartAxis(value, activeMetaResultDrilldownConfig.costMetricKey)
            },
          },
        },
      },
    }
  }, [activeMetaResultDrilldownConfig])
  const metaResultComparisonSummary = useMemo(() => {
    if (!activeMetaResultDrilldownConfig) return null

    const totalResults = metaResultComparisonSeries.reduce((accumulator, bucket) => accumulator + bucket.results, 0)
    const totalSpend = metaResultComparisonSeries.reduce((accumulator, bucket) => accumulator + bucket.spend, 0)
    const averageCost = totalResults > 0 ? totalSpend / totalResults : 0

    return {
      totalResults,
      totalSpend,
      averageCost,
      points: metaResultComparisonSeries.length,
    }
  }, [activeMetaResultDrilldownConfig, metaResultComparisonSeries])
  const rdQualificationKpis = [
    { key: 'opportunityCount', title: 'Oportunidades', value: formatNumber(rdSummary?.opportunityCount || 0), rawValue: rdSummary?.opportunityCount || 0, type: 'number', icon: 'bx-bulb', tone: 'blue' },
    { key: 'qualifiedOpportunityCount', title: 'Qualificados', value: formatNumber(rdSummary?.qualifiedOpportunityCount || 0), rawValue: rdSummary?.qualifiedOpportunityCount || 0, type: 'number', icon: 'bx-filter-alt', tone: 'emerald' },
    { key: 'wonOpportunityCount', title: 'Vendas da safra criada e fechada no período', value: formatNumber(rdSummary?.wonOpportunityCount || 0), rawValue: rdSummary?.wonOpportunityCount || 0, type: 'number', icon: 'bx-badge-check', tone: 'emerald' },
    { key: 'wonOpportunityRevenue', title: 'Faturamento da safra criada e fechada', value: formatCurrency(rdSummary?.wonOpportunityRevenue || 0), rawValue: rdSummary?.wonOpportunityRevenue || 0, type: 'currency', icon: 'bx-wallet-alt', tone: 'orange' },
    { key: 'avgTicketWonByCreation', title: 'Ticket médio da safra criada e fechada', value: formatCurrency(rdSummary?.avgTicketWonByCreation || 0), rawValue: rdSummary?.avgTicketWonByCreation || 0, type: 'currency', icon: 'bx-receipt', tone: 'gold' },
    { key: 'leadToQualifiedRate', title: 'Taxa de oportunidade para qualificados', value: formatPercent(rdSummary?.leadToQualifiedRate || 0), rawValue: rdSummary?.leadToQualifiedRate || 0, type: 'percent', icon: 'bx-transfer-alt', tone: 'cyan' },
    { key: 'qualifiedToWonRate', title: 'Taxa de qualificados para venda', value: formatPercent(rdSummary?.qualifiedToWonRate || 0), rawValue: rdSummary?.qualifiedToWonRate || 0, type: 'percent', icon: 'bx-badge-check', tone: 'emerald' },
    { key: 'leadToWonRate', title: 'Taxa de oportunidade para venda', value: formatPercent(rdSummary?.leadToWonRate || 0), rawValue: rdSummary?.leadToWonRate || 0, type: 'percent', icon: 'bx-line-chart', tone: 'blue' },
    { key: 'lostOpportunityCount', title: 'Negócios perdidos', value: formatNumber(rdSummary?.lostOpportunityCount || 0), rawValue: rdSummary?.lostOpportunityCount || 0, type: 'number', icon: 'bx-x-circle', tone: 'pink' },
  ]
  const rdRevenueKpis = [
    { key: 'wonDeals', title: 'Negociações ganhas fechadas no período', value: formatNumber(rdSummary?.wonDeals || 0), rawValue: rdSummary?.wonDeals || 0, type: 'number', icon: 'bx-calendar-check', tone: 'emerald' },
    { key: 'wonDealsFromPreviousCohorts', title: 'Negociações ganhas de safras anteriores', value: formatNumber(rdSummary?.wonDealsFromPreviousCohorts || 0), rawValue: rdSummary?.wonDealsFromPreviousCohorts || 0, type: 'number', icon: 'bx-history', tone: 'blue' },
    { key: 'wonRevenue', title: 'Faturamento das negociações fechadas', value: formatCurrency(rdSummary?.wonRevenue || 0), rawValue: rdSummary?.wonRevenue || 0, type: 'currency', icon: 'bx-wallet-alt', tone: 'orange' },
    { key: 'avgTicketWon', title: 'Ticket médio das negociações fechadas', value: formatCurrency(rdSummary?.avgTicketWon || 0), rawValue: rdSummary?.avgTicketWon || 0, type: 'currency', icon: 'bx-receipt', tone: 'gold' },
    { key: 'wonRevenueFromPreviousCohorts', title: 'Faturamento de safras anteriores fechadas', value: formatCurrency(rdSummary?.wonRevenueFromPreviousCohorts || 0), rawValue: rdSummary?.wonRevenueFromPreviousCohorts || 0, type: 'currency', icon: 'bx-coin-stack', tone: 'orange' },
    { key: 'avgTicketWonPreviousCohorts', title: 'Ticket médio de safras anteriores fechadas', value: formatCurrency(rdSummary?.avgTicketWonPreviousCohorts || 0), rawValue: rdSummary?.avgTicketWonPreviousCohorts || 0, type: 'currency', icon: 'bx-spreadsheet', tone: 'gold' },
  ]
  const rdFinalKpis = [
    { key: 'rdFinalSalesCount', title: 'Vendas totais do resultado final', value: formatNumber(rdFinalSalesCount), rawValue: rdFinalSalesCount, type: 'number', icon: 'bx-trophy', tone: 'emerald' },
    { key: 'rdFinalRevenue', title: 'Faturamento total do resultado final', value: formatCurrency(rdFinalRevenue), rawValue: rdFinalRevenue, type: 'currency', icon: 'bx-wallet-alt', tone: 'orange' },
    { key: 'rdFinalAvgTicket', title: 'Ticket médio do resultado final', value: formatCurrency(rdFinalAvgTicket), rawValue: rdFinalAvgTicket, type: 'currency', icon: 'bx-receipt', tone: 'gold' },
  ]
  const metaMediaKpisWithTrend = metaMediaKpis.map((metric) => ({
    ...metric,
    trend: buildMetricTrend(metric.key, metric.rawValue, previousMetaDashboardMetricValues[metric.key], metric.type),
  }))
  const metaFixedDashboardMetricCards = useMemo(
    () =>
      metaMediaKpisWithTrend.map((metric) => ({
        id: `fixed-${metric.key}`,
        key: metric.key,
        title: metric.title,
        description: '',
        icon: metric.icon,
        tone: metric.tone,
        value: metric.value,
        trend: metric.trend,
        fixed: true,
      })),
    [metaMediaKpisWithTrend]
  )
  const metaSummaryDashboardMetricCards = useMemo(
    () => [...metaFixedDashboardMetricCards, ...metaExtraDashboardMetricCards],
    [metaExtraDashboardMetricCards, metaFixedDashboardMetricCards]
  )
  const rdQualificationKpisWithTrend = rdQualificationKpis.map((metric) => ({
    ...metric,
    trend: buildMetricTrend(metric.key, metric.rawValue, previousRdDashboardMetricValues[metric.key], metric.type),
  }))
  const rdRevenueKpisWithTrend = rdRevenueKpis.map((metric) => ({
    ...metric,
    trend: buildMetricTrend(metric.key, metric.rawValue, previousRdDashboardMetricValues[metric.key], metric.type),
  }))
  const rdFinalKpisWithTrend = rdFinalKpis.map((metric) => ({
    ...metric,
    trend: buildMetricTrend(metric.key, metric.rawValue, previousRdDashboardMetricValues[metric.key], metric.type),
  }))
  const userAvatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.user_metadata?.full_name || user?.email || 'Usuario')}&background=0D8ABC&color=fff`
  const userAvatarSrc = user?.user_metadata?.avatar_url || userAvatarFallback
  const userFirstName = (user?.user_metadata?.full_name || user?.email || 'por aí').split(' ')[0]
  const currentHour = new Date().getHours()
  const assistantGreeting =
    currentHour < 12
      ? `Bom dia, ${userFirstName}.`
      : currentHour < 18
        ? `Boa tarde, ${userFirstName}.`
        : `Boa noite, ${userFirstName}.`
  const assistantGreetingPrompt = 'O que vamos fazer hoje?'

  const renderDashboardMetricGrid = (cards, source) => {
    if (!cards.length) return null

    return (
      <div className="dashboard-metrics-grid">
        {cards.map((metric) => (
          <div
            key={metric.id}
            className={`kpi-card glass-panel template-metric-card dashboard-metric-card dashboard-metric-card-${metric.size}`}
          >
            <div className="kpi-header">
              <span className="kpi-title">{metric.title}</span>
              <div className="template-metric-actions">
                <div className={`icon-box ${metric.tone}`}>
                  <i className={`bx ${metric.icon}`}></i>
                </div>
                <button
                  type="button"
                  className="template-metric-remove"
                  onClick={() =>
                    source === 'meta'
                      ? handleRemoveMetaDashboardMetric(metric.id)
                      : source === 'rd'
                        ? handleRemoveRdDashboardMetric(metric.id)
                        : handleRemoveSheetsDashboardMetric(metric.id)
                  }
                  aria-label={`Remover ${metric.title}`}
                  title={`Remover ${metric.title}`}
                >
                  <i className="bx bx-x"></i>
                </button>
              </div>
            </div>
            <div className="kpi-value">{metric.value}</div>
            <div className={`kpi-trend ${metric.trend?.tone || 'neutral'}`}>
              <i className={`bx ${metric.trend?.icon || 'bx-check-circle'}`}></i>
              <span>{metric.trend?.label || metric.description}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderFixedKpiGrid = (items) => (
    <div className="kpi-grid compact-kpi-grid">
      {items.map((metric) => (
        <article key={metric.key} className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-title">{metric.title}</span>
            <div className={`icon-box ${metric.tone}`}>
              <i className={`bx ${metric.icon}`}></i>
            </div>
          </div>
          <div className="kpi-value">{metric.value}</div>
          <div className={`kpi-trend ${metric.trend?.tone || 'neutral'}`}>
            <i className={`bx ${metric.trend?.icon || 'bx-check-circle'}`}></i>
            <span>{metric.trend?.label || 'Atualizado conforme a integração configurada.'}</span>
          </div>
        </article>
      ))}
    </div>
  )

  const renderMetricLibraryGrid = (options, values, onSelectMetric, { compact = false } = {}) => {
    if (!options.length) {
      return <div className="metric-library-empty">Todas as métricas já estão visíveis neste modelo.</div>
    }

    return (
      <div className={`metric-library-grid ${compact ? 'metric-library-grid-compact' : ''}`}>
        {options.map(([metricKey, metric]) => (
          <button
            key={metricKey}
            type="button"
            className={`kpi-card glass-panel metric-library-card ${compact ? 'metric-library-card-compact' : ''}`}
            onClick={() => onSelectMetric(metricKey)}
          >
            <div className="kpi-header">
              <span className="kpi-title">{metric.label}</span>
              <div className="template-metric-actions">
                <div className={`icon-box ${metric.tone}`}>
                  <i className={`bx ${metric.icon}`}></i>
                </div>
                <span className="metric-library-add-icon" aria-hidden="true">
                  <i className="bx bx-plus"></i>
                </span>
              </div>
            </div>
            <div className="kpi-value">{formatDashboardMetricValue(values[metricKey] || 0, metric.type)}</div>
            <div className="kpi-trend neutral">
              <i className="bx bx-info-circle"></i>
              <span>{metric.description}</span>
            </div>
          </button>
        ))}
      </div>
    )
  }

  const renderMetaSummaryMetricGrid = (cards, canAddMore) => (
    <div className="kpi-grid compact-kpi-grid meta-summary-grid">
      {cards.map((metric) => (
        <article
          key={metric.id}
          className={`kpi-card glass-panel meta-summary-card ${metric.fixed ? 'meta-summary-card-fixed' : 'meta-summary-card-extra'}`}
        >
          <div className="kpi-header">
            <span className="kpi-title">{metric.title}</span>
            <div className="template-metric-actions">
              <div className={`icon-box ${metric.tone}`}>
                <i className={`bx ${metric.icon}`}></i>
              </div>
              {!metric.fixed ? (
                <button
                  type="button"
                  className="template-metric-remove"
                  onClick={() => handleRemoveMetaDashboardMetric(metric.id)}
                  aria-label={`Remover ${metric.title}`}
                  title={`Remover ${metric.title}`}
                >
                  <i className="bx bx-x"></i>
                </button>
              ) : null}
            </div>
          </div>
          <div className="kpi-value">{metric.value}</div>
          <div className={`kpi-trend ${metric.trend?.tone || 'neutral'}`}>
            <i className={`bx ${metric.trend?.icon || 'bx-check-circle'}`}></i>
            <span>{metric.trend?.label || 'Atualizado conforme a integração configurada.'}</span>
          </div>
        </article>
      ))}

      {activeDraftDashboardTemplate && canAddMore ? (
        <button
          type="button"
          className="kpi-card glass-panel meta-summary-add-card"
          onClick={() => setIsMetaMetricLibraryOpen((current) => !current)}
        >
          <div className="meta-summary-add-card-icon">
            <i className={`bx ${isMetaMetricLibraryOpen ? 'bx-x' : 'bx-plus'}`}></i>
          </div>
          <strong>{isMetaMetricLibraryOpen ? 'Fechar biblioteca' : 'Adicionar métrica'}</strong>
          <span>{isMetaMetricLibraryOpen ? 'Ocultar métricas disponíveis.' : 'Criar um novo card nessa sequência.'}</span>
        </button>
      ) : null}
    </div>
  )

  const renderHomeHub = () => {
    const reportsPreview = [
      {
        title: activeClient ? `Leitura executiva de ${activeClient.name}` : 'Leitura executiva da operação',
        time: 'Agora',
      },
      {
        title: clickUpListsConfigured ? `ClickUp com ${formatNumber(clickUpListsConfigured)} lista(s) ativa(s)` : 'ClickUp aguardando configuração',
        time: 'Sincronizado',
      },
      {
        title: mondayBoardsConfigured ? `Monday com ${formatNumber(mondayBoardsConfigured)} board(s) monitorado(s)` : 'Monday aguardando conexão',
        time: 'Operação',
      },
    ]
    const homeCards = [
      {
        key: 'assistente',
        title: 'AI Search',
        description: 'Entre no copiloto da operação para conversar sobre campanhas, clientes, gargalos e próximos passos.',
        icon: 'bx bx-bot',
        tone: 'blue',
        accent: 'blue',
        helper: activeClient ? `Fale sobre ${activeClient.name} ou use foco geral para cruzar o app inteiro.` : 'Use a IA como camada principal de leitura e direcionamento.',
        actionLabel: 'Semantic query',
        onClick: () => setActiveTab('assistant'),
      },
      {
        key: 'apresentacao',
        title: 'Pitch Deck',
        description: 'Abra a leitura executiva dos clientes com filtros, métricas e visual de resultado.',
        icon: 'bx bxs-dashboard',
        tone: 'blue',
        accent: 'blue',
        helper: activeClient ? `Cliente ativo: ${activeClient.name}` : 'Escolha um cliente para abrir a visão executiva.',
        actionLabel: 'Auto-gen',
        onClick: () => setActiveTab('apresentacao'),
      },
      {
        key: 'clickup',
        title: 'ClickUp',
        description: 'Entre na operação do ClickUp para entender fila, responsáveis e gargalos do time.',
        icon: 'bx bx-task',
        tone: 'purple',
        accent: 'purple',
        helper: clickUpListsConfigured ? `${formatNumber(clickUpListsConfigured)} lista(s) operacional(is) configurada(s).` : 'Configuração global pendente.',
        actionLabel: 'Workflow sync',
        onClick: () => setActiveTab('clickup'),
      },
      {
        key: 'monday',
        title: 'Monday',
        description: 'Acompanhe boards, prioridades, atrasos e capacidade em uma leitura operacional.',
        icon: 'bx bx-columns',
        tone: 'gold',
        accent: 'gold',
        helper: mondayBoardsConfigured ? `${formatNumber(mondayBoardsConfigured)} board(s) monitorado(s) na operação.` : 'Configuração global pendente.',
        actionLabel: 'Timeline api',
        onClick: () => setActiveTab('monday'),
      },
      {
        key: 'agenda',
        title: 'Agenda',
        description: 'Veja compromissos e a rotina operacional fora da leitura analítica.',
        icon: 'bx bx-calendar-event',
        tone: 'emerald',
        accent: 'emerald',
        helper: 'Acesso rápido ao calendário da operação.',
        actionLabel: 'Agenda viva',
        onClick: () => setActiveTab('calendar'),
      },
      {
        key: 'configuracoes',
        title: 'Synthesizer',
        description: 'Ajuste integrações, credenciais globais e preferências da plataforma.',
        icon: 'bx bx-cog',
        tone: 'cyan',
        accent: 'cyan',
        helper: 'Central de configuração e conexões.',
        actionLabel: 'Advanced BI',
        href: '/settings',
      },
    ]

    if (canManageClients) {
      homeCards.splice(3, 0, {
        key: 'clientes',
        title: 'Clients',
        description: 'Cadastre clientes, grupos e organize quem enxerga cada dashboard.',
        icon: 'bx bxs-buildings',
        tone: 'orange',
        accent: 'orange',
        helper: `${formatNumber(clients.length)} cliente(s) cadastrado(s) na base.`,
        actionLabel: 'Directory',
        onClick: () => setActiveTab('clientes'),
      })
    }

    if (canManageUsers) {
      homeCards.splice(canManageClients ? 4 : 3, 0, {
        key: 'usuarios',
        title: 'Users',
        description: 'Gerencie acessos, permissões e quais dashboards cada pessoa pode abrir.',
        icon: 'bx bxs-user-detail',
        tone: 'pink',
        accent: 'pink',
        helper: `${formatNumber(usersList.length || 0)} usuário(s) carregado(s) nesta operação.`,
        actionLabel: 'Access layer',
        onClick: () => setActiveTab('usuarios'),
      })
    }

    return (
      <section className="source-section">
        <section className="glass-panel home-hub-hero home-hub-hero-obsidian">
          <div className="home-hub-copy">
            <span className="home-hub-kicker">Systems online</span>
            <h2>Executive Dashboard</h2>
            <p>
              Use essa Home como centro operacional do produto. A partir daqui você cruza IA, clientes, boards e integrações
              sem perder a visão executiva do que precisa acontecer agora.
            </p>
          </div>

          <div className="home-hub-metrics home-hub-metrics-obsidian">
            <div className="home-hub-metric glass-item">
              <span>Total portfolio</span>
              <strong>{formatNumber(clients.length || 0)}</strong>
              <small>{canManageClients ? 'clientes ativos na base' : 'camada de operação conectada'}</small>
            </div>
            <div className="home-hub-metric glass-item">
              <span>Active groups</span>
              <strong>{formatNumber(clientGroups.length || 0)}</strong>
              <small>grupos operacionais em leitura</small>
            </div>
            <div className="home-hub-metric glass-item">
              <span>Operational boards</span>
              <strong>{formatNumber(mondayBoardsConfigured + clickUpListsConfigured)}</strong>
              <small>{mondayBoardsConfigured || clickUpListsConfigured ? 'fontes ativas de operação' : 'aguardando configuração'}</small>
            </div>
          </div>
        </section>

        <section className="home-hub-section-head">
          <h3>Tools & integrations</h3>
          <button type="button" className="home-hub-manage-link" onClick={() => setActiveTab('assistant')}>
            Ir para o copiloto
          </button>
        </section>

        <section className="home-hub-grid home-hub-grid-obsidian">
          {homeCards.map((card) => {
            const cardContent = (
              <>
                <div className="home-hub-card-top">
                  <div className={`icon-box ${card.tone}`}>
                    <i className={card.icon}></i>
                  </div>
                  <span className={`home-hub-card-pill ${card.accent}`}>{card.actionLabel}</span>
                </div>
                <div className="home-hub-card-copy">
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <div className="home-hub-card-footer">
                  <span>{card.helper}</span>
                  <strong>
                    Entrar
                    <i className="bx bx-right-arrow-alt"></i>
                  </strong>
                </div>
              </>
            )

            if (card.href) {
              return (
                <Link key={card.key} href={card.href} className="glass-panel home-hub-card">
                  {cardContent}
                </Link>
              )
            }

            return (
              <button key={card.key} type="button" className="glass-panel home-hub-card" onClick={card.onClick}>
                {cardContent}
              </button>
            )
          })}
        </section>

        <section className="home-hub-lower-grid">
          <article className="glass-panel home-hub-analytics-card">
            <div className="home-hub-analytics-head">
              <div>
                <span className="home-hub-kicker">Synthesis performance</span>
                <h3>Leitura consolidada da operação</h3>
                <p className="home-hub-analytics-copy">
                  A camada de síntese reúne sinais do app, leitura de operação e contexto ativo para priorizar onde agir primeiro.
                </p>
              </div>
              <div className="home-hub-analytics-badges">
                <span>AI enhanced</span>
                <span>Monthly</span>
              </div>
            </div>
            <div className="home-hub-analytics-metrics">
              <div className="home-hub-analytics-metric-card">
                <span>Sinal principal</span>
                <strong>{activeClient ? activeClient.name : 'Operação geral'}</strong>
                <small>Foco atual da leitura executiva.</small>
              </div>
              <div className="home-hub-analytics-metric-card">
                <span>Camadas conectadas</span>
                <strong>{`${clients.length} clientes · ${clientGroups.length} grupos`}</strong>
                <small>Base pronta para cruzamentos e priorização.</small>
              </div>
              <div className="home-hub-analytics-metric-card">
                <span>Ferramentas vivas</span>
                <strong>{`${clickUpListsConfigured + mondayBoardsConfigured} fontes`}</strong>
                <small>Operação, agenda e copiloto já entram no mesmo fluxo.</small>
              </div>
            </div>
          </article>

          <aside className="home-hub-side-stack">
            <div className="glass-panel home-hub-reports-card">
              <div className="home-hub-reports-head">
                <h3>Recent reports</h3>
                <button type="button" className="home-hub-manage-link" onClick={() => setActiveTab('assistant')}>
                  Ver tudo
                </button>
              </div>
              <div className="home-hub-reports-list">
                {reportsPreview.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="home-hub-report-item">
                    <span className={`home-hub-report-dot ${index === 1 ? 'success' : index === 2 ? 'muted' : 'primary'}`}></span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.time}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel home-hub-ai-note">
              <span className="home-hub-kicker home-hub-kicker-success">AI insight</span>
              <p>
                {activeClient
                  ? `${activeClient.name} segue como principal foco de leitura. O copiloto já consegue cruzar campanhas, operação e contexto do cliente.`
                  : 'O copiloto já consegue cruzar campanhas, operação e contexto interno para priorizar os próximos passos.'}
              </p>
            </div>
          </aside>
        </section>
      </section>
    )
  }

  const renderMondayInteractiveKpiGrid = (items) => (
    <div className="kpi-grid compact-kpi-grid">
      {items.map((metric) => {
        const hasTasks = (metric.tasks?.length || 0) > 0
        const previewTasks = hasTasks ? sortMondayTasksForDrilldown(metric.tasks).slice(0, 3) : []

        return (
          <button
            key={metric.key}
            type="button"
            className={`kpi-card glass-panel interactive-kpi-card ${hasTasks ? 'interactive-kpi-card-active' : 'interactive-kpi-card-disabled'}`}
            onClick={() => {
              if (!hasTasks) return
              setMondayMetricDrilldown({
                title: metric.drilldownTitle,
                description: metric.drilldownDescription,
                items: sortMondayTasksForDrilldown(metric.tasks),
              })
            }}
            disabled={!hasTasks}
          >
            <div className="kpi-header">
              <span className="kpi-title">{metric.title}</span>
              <div className={`icon-box ${metric.tone}`}>
                <i className={`bx ${metric.icon}`}></i>
              </div>
            </div>
            <div className="kpi-value">{metric.value}</div>
            <div className={`kpi-trend ${hasTasks ? 'info' : 'neutral'}`}>
              <i className={`bx ${hasTasks ? 'bx-search-alt-2' : 'bx-minus-circle'}`}></i>
              <span>{hasTasks ? `${formatNumber(metric.tasks.length)} tarefa(s) compõem essa métrica` : 'Sem demandas nesse recorte'}</span>
            </div>
            {hasTasks ? (
              <div className="interactive-kpi-preview">
                {previewTasks.map((task) => (
                  <span key={task.id} className="interactive-kpi-preview-item">
                    {task.name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="interactive-kpi-action">
              <span>{hasTasks ? 'Ver tarefas dessa métrica' : 'Sem tarefas para detalhar'}</span>
              <i className={`bx ${hasTasks ? 'bx-right-arrow-alt' : 'bx-lock-alt'}`}></i>
            </div>
          </button>
        )
      })}
    </div>
  )

  const renderClickUpOperationalPanel = () => (
    <section className="source-section">
      <div className="source-section-header">
        <div className="source-section-badge" style={{ color: '#8b5cf6', borderColor: '#8b5cf6' }}>
          <i className="bx bx-task"></i>
          <span>ClickUp</span>
        </div>
        <p className="source-section-copy">Leitura operacional interna das listas configuradas globalmente para acompanhar a execução do time.</p>
      </div>

      <section className="glass-panel grouped-results">
        <div className="section-header section-header-stack section-header-with-action">
          <div>
            <h2>Operação em tarefas</h2>
            <p className="chart-subtitle">Resumo global de tarefas, andamento, atrasos e gargalos do time sem depender de vínculo com clientes.</p>
          </div>
        </div>

        {!hasClickUpConfigured && (
          <div className="settings-alert error">
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <span>
                {canEditIntegrations
                  ? 'O ClickUp ainda não foi configurado na operação. Faça isso em Configurações > Operação para liberar essa leitura.'
                  : 'O ClickUp ainda não foi configurado nesta operação. Peça ao master para ajustar em Configurações > Operação.'}
              </span>
              {canEditIntegrations && (
                <div>
                  <Link href="/settings?tab=operation" className="btn btn-secondary">
                    <i className="bx bx-cog"></i>
                    Abrir Configurações
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {clickUpError ? (
          <div className="settings-alert error">{clickUpError}</div>
        ) : hasClickUpConfigured ? (
          <>
            {renderFixedKpiGrid(clickUpKpis)}
            <section className="rankings-grid">
              <div className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Status das tarefas</h2>
                    <p className="chart-subtitle">Distribuição atual das tarefas por status nas listas configuradas.</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {clickUpSummary?.statusSummary?.counts?.length ? (
                    clickUpSummary.statusSummary.counts.map((item) => (
                      <div key={item.id} className="ranking-row">
                        <div>
                          <strong>{item.label}</strong>
                          <span>{formatNumber(item.count || 0)} tarefa(s)</span>
                        </div>
                        <b>{formatPercent((item.share || 0) * 100)}</b>
                      </div>
                    ))
                  ) : (
                    <div className="ranking-empty">Sem status suficientes para montar o ranking.</div>
                  )}
                </div>
              </div>

              <div className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Responsáveis</h2>
                    <p className="chart-subtitle">Quem concentra mais tarefas nas listas monitoradas.</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {clickUpSummary?.assigneeRanking?.length ? (
                    clickUpSummary.assigneeRanking.map((item) => (
                      <div key={item.id} className="ranking-row">
                        <div>
                          <strong>{item.label}</strong>
                          <span>{formatNumber(item.totalTasks || 0)} tarefa(s)</span>
                        </div>
                        <b>{formatNumber(item.overdueCount || 0)} atrasada(s)</b>
                      </div>
                    ))
                  ) : (
                    <div className="ranking-empty">Sem responsáveis suficientes para montar o ranking.</div>
                  )}
                </div>
              </div>

              <div className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Listas monitoradas</h2>
                    <p className="chart-subtitle">Volume operacional por lista configurada globalmente.</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {clickUpSummary?.listSummary?.length ? (
                    clickUpSummary.listSummary.map((item) => (
                      <div key={item.id} className="ranking-row">
                        <div>
                          <strong>{item.label}</strong>
                          <span>{formatNumber(item.totalTasks || 0)} tarefa(s)</span>
                        </div>
                        <b>{formatNumber(item.completedCount || 0)} concluída(s)</b>
                      </div>
                    ))
                  ) : (
                    <div className="ranking-empty">Sem listas suficientes para montar o ranking.</div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="ranking-empty">
            Configure o token e os IDs das listas do ClickUp para liberar os indicadores operacionais aqui.
          </div>
        )}
      </section>
    </section>
  )

  const renderMondayOperationalPanel = () => {
    const weeklyTrackedTime = mondaySummary?.weeklyTrackedTime || []
    const maxWeeklySeconds = weeklyTrackedTime.reduce((max, item) => Math.max(max, item.seconds || 0), 0)
    const overdueOwnerRanking = (mondaySummary?.ownerRanking || []).filter((item) => (item.overdueCount || 0) > 0)
    const topBoard = mondaySummary?.boardSummary?.[0] || null
    const topGroup = mondaySummary?.groupSummary?.[0] || null
    const topWorkloadOwner = [...(mondaySummary?.ownerRanking || [])]
      .sort((left, right) => right.openItems - left.openItems || right.totalItems - left.totalItems || left.label.localeCompare(right.label, 'pt-BR'))[0] || null
    const peakWeek = [...weeklyTrackedTime]
      .sort((left, right) => right.seconds - left.seconds || left.label.localeCompare(right.label, 'pt-BR'))[0] || null
    const totalItems = mondaySummary?.totalItems || 0
    const activeItems = mondaySummary?.activeItems || 0
    const doneItems = mondaySummary?.doneItems || 0
    const overdueItems = mondaySummary?.overdueItems || 0
    const blockedItems = mondaySummary?.blockedItems || 0
    const dueSoonItems = mondaySummary?.dueSoonItems || 0
    const unassignedItems = mondaySummary?.unassignedItems || 0
    const activeOwnersCount = mondaySummary?.activeOwnersCount || 0
    const completionRate = totalItems ? (doneItems / totalItems) * 100 : 0
    const overdueRate = activeItems ? (overdueItems / activeItems) * 100 : 0
    const blockedRate = activeItems ? (blockedItems / activeItems) * 100 : 0
    const assignmentRate = totalItems ? ((totalItems - unassignedItems) / totalItems) * 100 : 0
    const averageLoadPerOwner = activeOwnersCount ? activeItems / activeOwnersCount : 0
    const topStatusShare = mondaySummary?.topStatus && totalItems ? (mondaySummary.topStatus.count / totalItems) * 100 : 0
    const topBoardShare = topBoard && totalItems ? (topBoard.totalItems / totalItems) * 100 : 0
    const mondayTaskCatalog = mondaySummary?.taskCatalog || []
    const mondayTopTaskByOwner = Array.from(
      mondayTaskCatalog
        .filter((task) => (task.trackedSeconds || 0) > 0 && Array.isArray(task.owners) && task.owners.length > 0)
        .flatMap((task) =>
          task.owners.map((owner) => ({
            owner,
            ...task,
          }))
        )
        .reduce((accumulator, task) => {
          const current = accumulator.get(task.owner)
          if (!current || (task.trackedSeconds || 0) > (current.trackedSeconds || 0)) {
            accumulator.set(task.owner, task)
          }
          return accumulator
        }, new Map())
        .values()
    ).sort((left, right) => {
      if ((right.trackedSeconds || 0) !== (left.trackedSeconds || 0)) return (right.trackedSeconds || 0) - (left.trackedSeconds || 0)
      return String(left.owner || '').localeCompare(String(right.owner || ''), 'pt-BR')
    })
    const mondayStatusChartItems = (mondaySummary?.statusSummary?.counts || []).slice(0, 7)
    const mondayWeeklyChartItems = weeklyTrackedTime
    const mondayInteractiveKpis = [
      {
        ...mondayKpis[0],
        tasks: mondayTaskCatalog,
        drilldownTitle: 'Itens do recorte',
        drilldownDescription: 'Todas as demandas que entraram na leitura operacional atual.',
      },
      {
        ...mondayKpis[1],
        tasks: mondayTaskCatalog.filter((task) => !task.isDone),
        drilldownTitle: 'Demandas em andamento',
        drilldownDescription: 'Itens ainda abertos dentro do snapshot operacional.',
      },
      {
        ...mondayKpis[2],
        tasks: mondayTaskCatalog.filter((task) => task.isOverdue),
        drilldownTitle: 'Demandas atrasadas',
        drilldownDescription: 'Itens vencidos que pedem cobrança e priorização.',
      },
      {
        ...mondayKpis[3],
        tasks: mondayTaskCatalog.filter((task) => task.isBlocked && !task.isDone),
        drilldownTitle: 'Demandas bloqueadas',
        drilldownDescription: 'Itens travados que estão impedindo avanço da operação.',
      },
      {
        ...mondayKpis[4],
        tasks: mondayTaskCatalog.filter((task) => task.isDueSoon),
        drilldownTitle: 'Demandas que vencem em 7 dias',
        drilldownDescription: 'Itens prestes a vencer e que merecem prevenção antes de virar atraso.',
      },
      {
        ...mondayKpis[5],
        tasks: mondayTaskCatalog.filter((task) => task.isUnassigned),
        drilldownTitle: 'Demandas sem responsável',
        drilldownDescription: 'Itens sem dono definido, com risco de handoff travado e perda de SLA.',
      },
    ]
    const mondayStatusBarData = {
      labels: mondayStatusChartItems.length ? mondayStatusChartItems.map((item) => item.label) : ['Sem dados'],
      datasets: [
        {
          label: 'Demandas por status',
          data: mondayStatusChartItems.length ? mondayStatusChartItems.map((item) => item.count || 0) : [0],
          backgroundColor: 'rgba(245, 158, 11, 0.72)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 10,
          maxBarThickness: 44,
        },
      ],
    }
    const mondayStatusBarOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `${formatNumber(context.parsed.y || 0)} demanda(s)`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#94a3b8',
            precision: 0,
            callback(value) {
              return formatNumber(value)
            },
          },
        },
      },
    }
    const mondayWeeklyLineData = {
      labels: mondayWeeklyChartItems.length ? mondayWeeklyChartItems.map((item) => item.label) : ['Sem dados'],
      datasets: [
        {
          label: 'Tempo lançado',
          data: mondayWeeklyChartItems.length ? mondayWeeklyChartItems.map((item) => item.seconds || 0) : [0],
          borderColor: currentTheme.main,
          backgroundColor: currentTheme.glow,
          borderWidth: 3,
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: currentTheme.main,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          label: 'Demandas com tempo',
          data: mondayWeeklyChartItems.length ? mondayWeeklyChartItems.map((item) => item.tasksWithTime || 0) : [0],
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderWidth: 3,
          borderDash: [7, 5],
          pointBackgroundColor: '#0b0f19',
          pointBorderColor: '#10b981',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y1',
        },
      ],
    }
    const mondayWeeklyLineOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              if (context.dataset.yAxisID === 'y1') {
                return `${context.dataset.label}: ${formatNumber(context.parsed.y || 0)}`
              }
              return `${context.dataset.label}: ${formatDurationHours(context.parsed.y || 0)}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' },
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#94a3b8',
            callback(value) {
              return formatDurationHours(value)
            },
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            precision: 0,
            callback(value) {
              return formatNumber(value)
            },
          },
        },
      },
    }
    const mondayDecisionCards = [
      {
        key: 'delivery',
        eyebrow: 'Saúde da entrega',
        value: formatPercent(completionRate),
        title: 'concluído no recorte',
        tone: 'emerald',
        details: [
          `${formatNumber(activeItems)} item(ns) ainda em aberto`,
          `${formatNumber(doneItems)} já concluído(s)`,
        ],
      },
      {
        key: 'risk',
        eyebrow: 'Risco imediato',
        value: formatNumber(overdueItems),
        title: 'itens atrasados',
        tone: overdueItems > 0 ? 'orange' : 'blue',
        details: [
          `${formatPercent(overdueRate)} da fila aberta está vencida`,
          dueSoonItems > 0 ? `${formatNumber(dueSoonItems)} vencem nos próximos 7 dias` : 'Nada vencendo nos próximos 7 dias',
        ],
      },
      {
        key: 'capacity',
        eyebrow: 'Capacidade',
        value: activeOwnersCount ? `${formatDecimal(averageLoadPerOwner)} item/resp.` : 'Sem base',
        title: activeOwnersCount ? 'carga média por responsável' : 'sem responsáveis ativos',
        tone: 'cyan',
        details: [
          topWorkloadOwner ? `Maior fila com ${topWorkloadOwner.label}` : 'Sem dono com carga destacada',
          peakWeek?.seconds ? `Pico recente em ${peakWeek.label}: ${formatDurationHours(peakWeek.seconds)}` : 'Sem pico de tempo identificado',
        ],
      },
      {
        key: 'bottleneck',
        eyebrow: 'Gargalo atual',
        value: mondaySummary?.topStatus?.label || 'Sem base',
        title: mondaySummary?.topStatus ? `${formatPercent(topStatusShare)} da fila concentrada aqui` : 'sem concentração relevante',
        tone: 'gold',
        details: [
          topBoard ? `${topBoard.label} concentra ${formatPercent(topBoardShare)}` : 'Sem board dominante',
          topGroup ? `Grupo mais carregado: ${topGroup.label}` : 'Sem grupo dominante',
        ],
      },
    ]
    const mondayFocusCards = [
      {
        key: 'owner',
        title: 'Quem pede ação agora',
        value: mondaySummary?.topOverdueOwner ? mondaySummary.topOverdueOwner.name : 'Sem atraso crítico',
        helper: mondaySummary?.topOverdueOwner
          ? `${formatNumber(mondaySummary.topOverdueOwner.overdueItems)} item(ns) atrasado(s) com esse responsável.`
          : 'Nenhum responsável com atraso no recorte atual.',
      },
      {
        key: 'coverage',
        title: 'Cobertura operacional',
        value: formatPercent(assignmentRate),
        helper: unassignedItems > 0
          ? `${formatNumber(unassignedItems)} item(ns) ainda sem dono definido.`
          : 'Toda a fila do recorte está atribuída.',
      },
      {
        key: 'blocked',
        title: 'Bloqueio e atenção',
        value: blockedItems > 0 ? `${formatNumber(blockedItems)} bloqueado(s)` : 'Sem bloqueios',
        helper: blockedItems > 0
          ? `${formatPercent(blockedRate)} dos itens abertos dependem de destravamento.`
          : 'A fila aberta não mostra bloqueios claros neste recorte.',
      },
      {
        key: 'time',
        title: 'Maior consumo de tempo',
        value: mondaySummary?.topLongestTask?.name || 'Sem time tracking',
        helper: mondaySummary?.topLongestTask
          ? `${formatDurationHours(mondaySummary.topLongestTask.trackedSeconds)} lançadas no item mais pesado.`
          : 'Assim que houver tempo lançado, o principal consumidor aparece aqui.',
      },
    ]
    return (
      <section className="source-section">
        <section className="glass-panel grouped-results monday-operations-shell">
          <div className="section-header section-header-stack section-header-with-action">
            <div>
              <h2>Operação em boards</h2>
              <p className="chart-subtitle">Entenda carga, atraso, tempo investido e gargalos do time em um painel que faça sentido para gestão de operação.</p>
            </div>
          </div>

          {hasMondayConfigured && !mondayError && (
            <>
              <div className="monday-command-panel glass-item">
                <div className="monday-command-copy">
                  <span className="monday-command-kicker">Painel operacional</span>
                  <h3>Fila, risco e capacidade em uma leitura de gestão</h3>
                  <p>Modelamos esse topo como dashboards operacionais de referência: primeiro saúde da entrega, depois risco imediato, capacidade do time e onde a fila está se acumulando.</p>
                </div>
                <div className="monday-command-side">
                  <div className="monday-command-filter">
                    <label htmlFor="monday-owner-filter">Filtrar responsável</label>
                    <select
                      id="monday-owner-filter"
                      className="hero-select"
                      value={mondayOwnerFilter}
                      onChange={(event) => setMondayOwnerFilter(event.target.value)}
                    >
                      <option value="all">Todos os usuários</option>
                      {mondayOwnerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.label}
                        </option>
                      ))}
                    </select>
                    <small>{selectedMondayOwnerLabel === 'Todos os usuários' ? 'Visão consolidada da operação inteira.' : `Lendo apenas ${selectedMondayOwnerLabel}.`}</small>
                  </div>
                </div>
              </div>

              <div className="monday-decision-grid">
                {mondayDecisionCards.map((card) => (
                  <article key={card.key} className="monday-decision-card glass-item">
                    <div className={`monday-decision-accent ${card.tone}`}></div>
                    <p className="monday-decision-eyebrow">{card.eyebrow}</p>
                    <strong className="monday-decision-value">{card.value}</strong>
                    <p className="monday-decision-title">{card.title}</p>
                    <div className="monday-decision-details">
                      {card.details.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {!hasMondayConfigured && (
            <div className="settings-alert error">
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <span>
                  {canEditIntegrations
                    ? 'O Monday ainda não foi configurado na operação. Faça isso em Configurações > Operação para liberar essa leitura.'
                    : 'O Monday ainda não foi configurado nesta operação. Peça ao master para ajustar em Configurações > Operação.'}
                </span>
                {canEditIntegrations && (
                  <div>
                    <Link href="/settings?tab=operation" className="btn btn-secondary">
                      <i className="bx bx-cog"></i>
                      Abrir Configurações
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {mondayError ? (
            <div className="settings-alert error">{mondayError}</div>
          ) : hasMondayConfigured ? (
            <>
              <div className="operations-kpi-shell">
                {renderMondayInteractiveKpiGrid(mondayInteractiveKpis)}
              </div>

              <div className="monday-focus-grid">
                {mondayFocusCards.map((card) => (
                  <article key={card.key} className="monday-focus-card glass-item">
                    <p className="monday-focus-title">{card.title}</p>
                    <strong className="monday-focus-value">{card.value}</strong>
                    <p className="monday-focus-helper">{card.helper}</p>
                  </article>
                ))}
              </div>

              <section className="charts-section monday-charts-section">
                <div className="chart-container glass-panel main-chart">
                  <div className="chart-header chart-header-stack">
                    <div>
                      <h2>Comparativo por status</h2>
                      <p className="chart-subtitle">Clique em uma barra para abrir as demandas daquele status e entender o gargalo real.</p>
                    </div>
                  </div>
                  {mondayStatusChartItems.length ? (
                    <div className="canvas-wrapper">
                      <Bar
                        data={mondayStatusBarData}
                        options={mondayStatusBarOptions}
                        onClick={(_, elements) => {
                          if (!elements.length) return
                          const clickedStatus = mondayStatusChartItems[elements[0].index]
                          if (!clickedStatus) return

                          const filteredTasks = mondayTaskCatalog.filter((task) => task.statusLabel === clickedStatus.label)
                          setMondayMetricDrilldown({
                            title: `Demandas em ${clickedStatus.label}`,
                            description: `${formatNumber(clickedStatus.count || 0)} demanda(s) concentradas nesse status.`,
                            items: sortMondayTasksForDrilldown(filteredTasks),
                          })
                        }}
                      />
                    </div>
                  ) : (
                    <div className="ranking-empty">Sem status suficientes para montar o gráfico comparativo.</div>
                  )}
                </div>

                <div className="chart-container glass-panel secondary-chart">
                  <div className="chart-header chart-header-stack">
                    <div>
                      <h2>Comparativo semanal</h2>
                      <p className="chart-subtitle">Linha de tempo para comparar horas lançadas e volume de demandas com apontamento.</p>
                    </div>
                  </div>
                  {mondayWeeklyChartItems.length ? (
                    <div className="canvas-wrapper">
                      <Line data={mondayWeeklyLineData} options={mondayWeeklyLineOptions} />
                    </div>
                  ) : (
                    <div className="ranking-empty">Sem histórico suficiente para montar a linha comparativa.</div>
                  )}
                </div>
              </section>

              <section className="rankings-grid operations-rankings-grid">
                <div className="glass-panel ranking-card">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Usuários com mais tarefas atrasadas</h2>
                      <p className="chart-subtitle">Quem está mais pressionado no recorte e quais tarefas precisam de atenção imediata.</p>
                    </div>
                  </div>
                  <div className="ranking-list">
                    {overdueOwnerRanking.length ? (
                      overdueOwnerRanking.map((item) => (
                        <div key={item.id} className="ranking-row ranking-row-rich monday-owner-row">
                          <div className="ranking-main-column">
                            <strong>{item.label}</strong>
                            <span>{formatNumber(item.totalItems || 0)} item(ns) no recorte · {formatDurationHours(item.trackedSeconds || 0)} lançadas</span>
                            {item.overdueTasks?.length ? (
                              <div className="ranking-task-tags">
                                {item.overdueTasks.map((task) => (
                                  <span key={task.id} className="ranking-task-chip">{task.name}</span>
                                ))}
                              </div>
                            ) : (
                              <div className="ranking-inline-note">Sem tarefas atrasadas para detalhar.</div>
                            )}
                          </div>
                          <div className="ranking-metrics">
                            <strong>{formatNumber(item.overdueCount || 0)} atrasada(s)</strong>
                            <span>{formatNumber(item.openItems || 0)} aberta(s)</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="ranking-empty">Nenhum responsável com tarefas atrasadas dentro do período filtrado.</div>
                    )}
                  </div>
                </div>

                <div className="glass-panel ranking-card">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Status da operação</h2>
                      <p className="chart-subtitle">Onde a fila está se concentrando para entender gargalo, retrabalho ou etapa final.</p>
                    </div>
                  </div>
                  <div className="ranking-list">
                    {mondaySummary?.statusSummary?.counts?.length ? (
                      mondaySummary.statusSummary.counts.map((item) => (
                        <div key={item.id} className="ranking-row">
                          <div>
                            <strong>{item.label}</strong>
                            <span>{formatNumber(item.count || 0)} item(ns)</span>
                          </div>
                          <b>{formatPercent((item.share || 0) * 100)}</b>
                        </div>
                      ))
                    ) : (
                      <div className="ranking-empty">Sem status suficientes para montar o ranking.</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Tempo por semana</h2>
                    <p className="chart-subtitle">Carga trabalhada separada por semana e quebrada por responsável dentro do período selecionado.</p>
                  </div>
                </div>
                {weeklyTrackedTime.length ? (
                  <div className="weekly-time-list">
                    {weeklyTrackedTime.map((week) => (
                      <div key={week.id} className="weekly-time-row weekly-time-row-detailed">
                        <div className="weekly-time-copy">
                          <strong>{week.label}</strong>
                          <span>{formatNumber(week.tasksWithTime || 0)} tarefa(s) com tempo lançado</span>
                        </div>
                        <div className="weekly-time-bar-track">
                          <span
                            className="weekly-time-bar-fill"
                            style={{ width: `${maxWeeklySeconds > 0 ? (week.seconds / maxWeeklySeconds) * 100 : 0}%` }}
                          ></span>
                        </div>
                        <b>{formatDurationHours(week.seconds || 0)}</b>
                        <div className="weekly-time-owner-list">
                          {week.ownerBreakdown?.length ? (
                            week.ownerBreakdown.map((item) => (
                              <div key={`${week.id}-${item.owner}`} className="weekly-time-owner-row">
                                <span>{item.owner}</span>
                                <strong>{formatDurationHours(item.seconds || 0)}</strong>
                              </div>
                            ))
                          ) : (
                            <div className="ranking-inline-note">Sem responsáveis com tempo lançado nessa semana.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ranking-empty">Não encontramos lançamentos de tempo suficientes para dividir em semanas nesse recorte.</div>
                )}
              </section>

              <section className="rankings-grid operations-rankings-grid">
                <div className="glass-panel ranking-card">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Boards monitorados</h2>
                      <p className="chart-subtitle">Volume operacional consolidado por board no recorte atual.</p>
                    </div>
                  </div>
                  <div className="ranking-list">
                    {mondaySummary?.boardSummary?.length ? (
                      mondaySummary.boardSummary.map((item) => (
                        <div key={item.id} className="ranking-row">
                          <div>
                            <strong>{item.label}</strong>
                            <span>{formatNumber(item.totalItems || 0)} item(ns)</span>
                          </div>
                          <b>{formatNumber(item.doneCount || 0)} concluído(s)</b>
                        </div>
                      ))
                    ) : (
                      <div className="ranking-empty">Sem boards suficientes para montar o ranking.</div>
                    )}
                  </div>
                </div>

                <div className="glass-panel ranking-card">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Grupos dos boards</h2>
                      <p className="chart-subtitle">Em qual grupo do Monday o trabalho está mais concentrado hoje.</p>
                    </div>
                  </div>
                  <div className="ranking-list">
                    {mondaySummary?.groupSummary?.length ? (
                      mondaySummary.groupSummary.map((item) => (
                        <div key={item.id} className="ranking-row">
                          <div>
                            <strong>{item.label}</strong>
                            <span>{formatNumber(item.totalItems || 0)} item(ns)</span>
                          </div>
                          <b>{formatNumber(item.overdueCount || 0)} atrasado(s)</b>
                        </div>
                      ))
                    ) : (
                      <div className="ranking-empty">Sem grupos suficientes para montar o ranking.</div>
                    )}
                  </div>
                </div>
              </section>

              <div className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Tarefas atrasadas e responsáveis</h2>
                    <p className="chart-subtitle">Lista do que está vencido no recorte atual, deixando claro com quem cada demanda está travada.</p>
                  </div>
                </div>
                {mondaySummary?.overdueTasks?.length ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tarefa</th>
                          <th>Responsável</th>
                          <th>Board</th>
                          <th>Status</th>
                          <th>Atraso</th>
                          <th>Tempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mondaySummary.overdueTasks.map((task) => (
                          <tr key={task.id}>
                            <td className="campaign-name">{task.name}</td>
                            <td>{task.owners?.length ? task.owners.join(', ') : 'Sem responsável'}</td>
                            <td>{task.boardName || '-'}</td>
                            <td>{task.statusLabel || 'Sem status'}</td>
                            <td>{formatNumber(task.daysOverdue || 0)} dia(s)</td>
                            <td>{formatDurationHours(task.trackedSeconds || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ranking-empty">Nenhuma tarefa atrasada encontrada dentro do período e do responsável filtrados.</div>
                )}
              </div>

              <div className="glass-panel ranking-card">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>Tarefa em que cada usuário mais ficou</h2>
                    <p className="chart-subtitle">Leitura por responsável, em ordem decrescente de tempo, para entender onde cada pessoa mais concentrou esforço.</p>
                  </div>
                </div>
                {mondayTopTaskByOwner.length ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Usuário</th>
                          <th>Tarefa</th>
                          <th>Status</th>
                          <th>Board</th>
                          <th>Tempo</th>
                          <th>Atualização</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mondayTopTaskByOwner.map((task) => (
                          <tr key={`${task.owner}-${task.id}`}>
                            <td className="campaign-name">{task.owner}</td>
                            <td className="campaign-name">{task.name}</td>
                            <td>{task.statusLabel || 'Sem status'}</td>
                            <td>{task.boardName || '-'}</td>
                            <td>{formatDurationHours(task.trackedSeconds || 0)}</td>
                            <td>{formatShortDate(task.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="ranking-empty">Nenhum usuário com tarefa e time tracking apareceu dentro do período filtrado.</div>
                )}
              </div>
            </>
          ) : (
            <div className="ranking-empty">
              Configure o token e os IDs dos boards do Monday para liberar os indicadores operacionais aqui.
            </div>
          )}
        </section>

      </section>
    )
  }

  if (userLoading || !hasLoadedPreferences) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'white' }}>Carregando painel...</div>
  }

  const handleHomeToolsLauncher = () => {
    setActiveTab('home')

    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false)
      setIsHomeToolsExpanded(true)
      return
    }

    setIsHomeToolsExpanded((current) => !current)
  }

  return (
    <div className="dashboard-container">
      <aside className={`sidebar glass-panel ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Ocultar barra lateral'}
          title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Ocultar barra lateral'}
        >
          <i className={`bx ${isSidebarCollapsed ? 'bx-chevron-right' : 'bx-chevron-left'}`}></i>
        </button>

        <div className="sidebar-top">
          <div className="logo">
            <i className="bx bx-bar-chart-alt-2"></i>
            {!isSidebarCollapsed && (
              <div className="logo-copy">
                <span>Nype OS</span>
                <small>Control center</small>
              </div>
            )}
          </div>
        </div>

        <nav className="nav-menu">
          <button type="button" data-tooltip="Assistente" className={`nav-item nav-button ${activeTab === 'assistant' ? 'active' : ''}`} onClick={() => setActiveTab('assistant')}>
            <i className="bx bx-bot"></i> Assistente
          </button>
          <div className={`nav-tools-group ${isHomeToolsExpanded && !isSidebarCollapsed ? 'open' : ''}`}>
            <button
              type="button"
              data-tooltip="Ferramentas"
              className={`nav-item nav-button nav-tools-trigger ${activeTab === 'home' || isHomeToolsExpanded ? 'active' : ''}`}
              onClick={handleHomeToolsLauncher}
            >
              <i className="bx bx-grid-alt"></i>
              {!isSidebarCollapsed && (
                <>
                  Ferramentas
                  <span className="nav-tools-chevron">
                    <i className={`bx ${isHomeToolsExpanded ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                  </span>
                </>
              )}
            </button>

            {!isSidebarCollapsed && isHomeToolsExpanded && (
              <div className="home-tools-menu">
                {homeToolsMenuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`home-tools-link ${activeTab === item.key ? 'active' : ''}`}
                    onClick={item.onClick}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.helper}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {canManageClients && (
            <button type="button" data-tooltip="Clientes" className={`nav-item nav-button ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
              <i className="bx bxs-buildings"></i> Clientes
            </button>
          )}
          <button type="button" data-tooltip="Apresentação" className={`nav-item nav-button ${activeTab === 'apresentacao' ? 'active' : ''}`} onClick={() => setActiveTab('apresentacao')}>
            <i className="bx bxs-dashboard"></i> Apresentação
          </button>
          <button type="button" data-tooltip="ClickUp" className={`nav-item nav-button ${activeTab === 'clickup' ? 'active' : ''}`} onClick={() => setActiveTab('clickup')}>
            <i className="bx bx-task"></i> ClickUp
          </button>
          <button type="button" data-tooltip="Monday" className={`nav-item nav-button ${activeTab === 'monday' ? 'active' : ''}`} onClick={() => setActiveTab('monday')}>
            <i className="bx bx-columns"></i> Monday
          </button>
          <button type="button" data-tooltip="Agenda" className={`nav-item nav-button ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
            <i className="bx bx-calendar-event"></i> Agenda
          </button>
          {canManageUsers && (
            <button type="button" data-tooltip="Usuários" className={`nav-item nav-button ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => setActiveTab('usuarios')}>
              <i className="bx bxs-user-detail"></i> Usuários
            </button>
          )}
          <a href="/settings" data-tooltip="Configurações" className="nav-item">
            <i className="bx bx-cog"></i> Configurações
          </a>
          <a href="/privacy" data-tooltip="Política e Privacidade" className="nav-item" target="_blank" rel="noreferrer">
            <i className="bx bx-shield-quarter"></i> Política e Privacidade
          </a>
        </nav>

        {!isSidebarCollapsed && activeTab === 'apresentacao' && (
          <div className="sidebar-client glass-item">
            <span className="sidebar-client-label">Cliente ativo</span>
            <strong>{activeClient?.name || 'Nenhum cliente selecionado'}</strong>
          </div>
        )}

        <div className="user-profile">
          <img
            src={userAvatarSrc}
            alt="Usuário"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = userAvatarFallback
            }}
          />
          {!isSidebarCollapsed && (
            <div className="user-info">
              <p className="name">{user?.user_metadata?.full_name || user?.email || 'Usuário'}</p>
              <p className="role">{role}</p>
              <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0, textAlign: 'left', marginTop: '2px' }}>
                Sair da plataforma
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={`main-content ${isSidebarCollapsed ? 'main-content-expanded' : ''}`}>
        <header className="header" style={{ alignItems: 'flex-start' }}>
          <div className="page-title">
            <h1>
              {activeTab === 'home' && 'Home'}
              {activeTab === 'clientes' && 'Base de clientes'}
              {activeTab === 'apresentacao' && `Dashboard ${activeClient?.name || 'do cliente'}`}
              {activeTab === 'assistant' && assistantGreeting}
              {activeTab === 'calendar' && 'Agenda da operação'}
              {activeTab === 'clickup' && 'Operação ClickUp'}
              {activeTab === 'monday' && 'Operação Monday'}
              {activeTab === 'usuarios' && 'Gestão de usuários'}
            </h1>
            {activeTab !== 'assistant' && (
              <p>
                {activeTab === 'home' && 'Entre por aqui sempre que abrir o app e escolha rapidamente qual área da operação você quer acessar.'}
                {activeTab === 'clientes' && 'Cadastre seus clientes e mantenha cada operação separada dentro do dashboard.'}
                {activeTab === 'apresentacao' && 'Uma visão executiva consolidada dos principais resultados do cliente, organizada por fonte de dados.'}
                {activeTab === 'calendar' && 'Acompanhe a agenda da operação dentro da mesma Home, sem trocar de área.'}
                {activeTab === 'clickup' && 'Acompanhe tarefas, responsáveis e status operacionais do ClickUp a partir da configuração global da operação.'}
                {activeTab === 'monday' && 'Acompanhe boards, itens, status e responsáveis do Monday a partir da configuração global da operação.'}
                {activeTab === 'usuarios' && 'Defina quem pode visualizar dashboards, editar integrações e acessar clientes específicos.'}
              </p>
            )}
            {activeTab === 'assistant' && (
              <p className="assistant-header-prompt">{assistantGreetingPrompt}</p>
            )}
          </div>

          <div className="header-actions header-actions-wrap">
            {activeTab === 'apresentacao' && (
              <>
                <div className="date-picker glass-item">
                  <i className="bx bx-user-pin"></i>
                  <select value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)}>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeClient && activeDraftDashboardTemplates.length > 0 && (
                  <>
                    <div className="date-picker glass-item">
                      <i className="bx bx-layout"></i>
                      <select value={draftDashboardTemplateId || activeDraftDashboardTemplateId} onChange={(event) => handleDashboardTemplateChange(event.target.value)}>
                        {activeDraftDashboardTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button type="button" onClick={handleSaveDashboardTemplate} className="btn btn-secondary">
                      <i className="bx bx-bookmark-plus"></i>
                      Salvar modelo
                    </button>
                  </>
                )}

                {draftDateRange === 'custom' && (
                  <div className="date-picker glass-item custom-range">
                    <input type="date" value={draftCustomSince} onChange={(event) => setDraftCustomSince(event.target.value)} />
                    <span>até</span>
                    <input type="date" value={draftCustomUntil} onChange={(event) => setDraftCustomUntil(event.target.value)} />
                  </div>
                )}

                <div className="date-picker glass-item">
                  <i className="bx bx-calendar"></i>
                  <select value={draftDateRange} onChange={(event) => setDraftDateRange(event.target.value)}>
                    {DATE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiInsights}
                  disabled={!hasMetaConfigured || !isAiInsightsConfigured || isAiInsightsLoading}
                  className="btn btn-secondary"
                >
                  <i className={isAiInsightsLoading ? 'bx bx-loader-alt bx-spin' : 'bx bx-bulb'}></i>
                  {isAiInsightsLoading ? 'Gerando insights...' : 'Insights'}
                </button>

                <button onClick={exportPDF} disabled={isExporting} className="btn btn-primary">
                  <i className={isExporting ? 'bx bx-loader-alt bx-spin' : 'bx bx-export'}></i>
                  {isExporting ? 'Gerando PDF...' : 'Exportar PDF'}
                </button>
              </>
            )}

            {activeTab === 'monday' && (
              <>
                {draftMondayDateRange === 'custom' && (
                  <div className="date-picker glass-item custom-range">
                    <input type="date" value={draftMondayCustomSince} onChange={(event) => setDraftMondayCustomSince(event.target.value)} />
                    <span>até</span>
                    <input type="date" value={draftMondayCustomUntil} onChange={(event) => setDraftMondayCustomUntil(event.target.value)} />
                  </div>
                )}

                <div className="date-picker glass-item">
                  <i className="bx bx-calendar"></i>
                  <select value={draftMondayDateRange} onChange={(event) => setDraftMondayDateRange(event.target.value)}>
                    {DATE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleApplyDashboardFilters}
                  disabled={isApplyMondayFiltersDisabled}
                  className="btn btn-secondary"
                >
                  <i className="bx bx-filter-alt"></i>
                  Aplicar período
                </button>
              </>
            )}
          </div>
        </header>

        {activeTab === 'apresentacao' && isDashboardEntryModalOpen && clients.length > 1 && (
          <div className="modal-overlay" onClick={() => setIsDashboardEntryModalOpen(false)}>
            <div className="modal-card glass-panel dashboard-entry-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Selecionar dashboard</h3>
                  <p>Escolha qual dashboard você quer abrir nesta entrada.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setIsDashboardEntryModalOpen(false)} aria-label="Fechar seleção de dashboard">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <div className="dashboard-entry-content">
                <div className="date-picker glass-item dashboard-entry-picker">
                  <i className="bx bx-user-pin"></i>
                  <select value={dashboardEntryClientId} onChange={(event) => setDashboardEntryClientId(event.target.value)}>
                    {clients.map((client) => (
                      <option key={`entry-${client.id}`} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setIsDashboardEntryModalOpen(false)}>
                    Agora não
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmDashboardEntry} disabled={!dashboardEntryClientId}>
                    Abrir dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'home' && renderHomeHub()}

        {activeTab === 'assistant' && (
          <section style={{ width: '100%', minHeight: 'calc(100vh - 220px)' }}>
            <AssistantPage embeddedOverride={true} />
          </section>
        )}

        {activeTab === 'calendar' && (
          <section style={{ width: '100%', minHeight: 'calc(100vh - 220px)' }}>
            <CalendarPage embeddedOverride={true} />
          </section>
        )}

        {activeTab === 'clickup' && renderClickUpOperationalPanel()}

        {activeTab === 'monday' && renderMondayOperationalPanel()}

        {activeTab === 'clientes' && (
          <section className="clients-layout">
            <div className="management-header-row">
              <div className="management-header-copy">
                <h2>Gestão de Clientes</h2>
                <p>Controle parceiros, identidade de marca e prontidão operacional dentro do mesmo painel executivo.</p>
              </div>
              <button type="button" className="btn btn-secondary management-header-button" onClick={() => document.querySelector('.client-create-bar input')?.focus()}>
                <i className="bx bx-user-plus"></i>
                Adicionar cliente
              </button>
            </div>

            <div className="clients-hero-strip">
              <div className="glass-panel management-hero clients-intro clients-hero-main">
                <div className="management-hero-copy">
                  <span className="management-hero-kicker">Client control</span>
                  <h2>Organize clientes, grupos e a identidade visual da operação</h2>
                  <p>
                    Centralize aqui a base de clientes do workspace, escolha quais contas entram na leitura executiva e mantenha a apresentação alinhada com cada operação.
                  </p>
                </div>
                <div className="clients-hero-actions">
                  <button type="button" className="btn btn-primary" onClick={() => document.querySelector('.client-create-bar input')?.focus()}>
                    Novo cliente
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => document.querySelector('.client-create-grid .client-create-bar:nth-child(2) input')?.focus()}>
                    Novo grupo
                  </button>
                </div>
              </div>

              <div className="clients-metric-grid">
                <div className="clients-metric-card">
                  <small>Total de clientes</small>
                  <strong>{formatNumber(clients.length)}</strong>
                  <span>{`${formatNumber(clientGroups.length)} grupo(s) conectados à base`}</span>
                </div>
                <div className="clients-metric-card clients-metric-card-live">
                  <small>Ativos agora</small>
                  <strong>{formatNumber(connectedClientsCount)}</strong>
                  <span>{connectedClientsCount ? 'Prontos para leitura' : 'Sem contas conectadas'}</span>
                </div>
                <div className="clients-metric-card">
                  <small>Pendências</small>
                  <strong>{formatNumber(pendingClientsCount)}</strong>
                  <span>{pendingClientsCount ? 'Revisão necessária' : 'Sem gaps críticos'}</span>
                </div>
                <div className="clients-metric-card clients-metric-card-score">
                  <small>Score estrutural</small>
                  <strong>{clientSecurityScore.toFixed(1)}</strong>
                  <span>{clientSecurityScore >= 90 ? 'Base madura' : 'Melhorar conexões e identidade'}</span>
                </div>
              </div>
            </div>

            <div className="client-create-grid">
              <form className="glass-panel client-create-bar management-action-card" onSubmit={handleCreateClient}>
                <div>
                  <span className="management-card-kicker">New client</span>
                  <h3>Novo cliente</h3>
                  <p>Crie um cliente e depois ajuste a configuração dele logo abaixo.</p>
                </div>
                <div className="client-create-inline">
                  <input type="text" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Ex.: Clínica X, E-commerce Y..." disabled={!isMaster} />
                  <button type="submit" className="btn btn-primary" disabled={!isMaster}>Adicionar cliente</button>
                </div>
              </form>

              <form className="glass-panel client-create-bar management-action-card" onSubmit={handleCreateClientGroup}>
                <div>
                  <span className="management-card-kicker">New cluster</span>
                  <h3>Novo grupo de clientes</h3>
                  <p>Monte grupos para liberar acesso em lote e organizar dashboards relacionados.</p>
                </div>
                <div className="client-create-inline">
                  <input type="text" value={newClientGroupName} onChange={(event) => setNewClientGroupName(event.target.value)} placeholder="Ex.: Franquias, Comercial, Clínicas..." disabled={!isMaster} />
                  <button type="submit" className="btn btn-primary" disabled={!isMaster}>Adicionar grupo</button>
                </div>
              </form>
            </div>

            <div className="clients-grid clients-grid-single">
              <div className="glass-panel users-toolbar-card management-directory-card">
                <div className="user-picker-head">
                  <div>
                    <span className="management-card-kicker">Client registry</span>
                    <h3>Clientes cadastrados</h3>
                    <p>Abra a edição de um cliente quando precisar ajustar conta Meta, identidade visual ou integração da operação.</p>
                  </div>
                </div>

                <div className="user-directory-grid client-directory-grid">
                  {clients.map((client) => {
                    const statusMeta = getClientStatusMeta(client)
                    const linkedGroupsCount = clientGroups.filter((group) => normalizeClientGroupClientIds(group.clientIds).includes(client.id)).length

                    return (
                    <div key={client.id} className={`user-directory-card glass-item client-spotlight-card ${client.id === activeClientId ? 'client-directory-card-active' : ''}`}>
                      <div className="client-spotlight-badge-wrap">
                        <span className={`client-status-badge client-status-${statusMeta.tone}`}>{statusMeta.label}</span>
                      </div>

                      <div className="client-spotlight-head">
                        <div className="client-avatar-shell">
                          {client.logoUrl ? (
                            <img
                              src={client.logoUrl}
                              alt={`Logo ${client.name}`}
                              className="client-avatar-image"
                            />
                          ) : (
                            <span>{getNameInitials(client.name)}</span>
                          )}
                        </div>
                        <div className="client-spotlight-copy">
                          <strong>{client.name}</strong>
                          <span>{`ID: ${String(client.id || '').slice(0, 8).toUpperCase()}`}</span>
                        </div>
                      </div>

                      <div className="client-spotlight-grid">
                        <div>
                          <small>Conta Meta</small>
                          <p>{client.metaAdAccountId || 'Não conectada'}</p>
                        </div>
                        <div>
                          <small>Grupo / identidade</small>
                          <p>{linkedGroupsCount ? `${linkedGroupsCount} grupo(s)` : client.logoUrl ? 'Logo pronta' : 'Pendente'}</p>
                        </div>
                      </div>

                      <div className="user-directory-meta">
                        <span className="user-role-badge">{getDashboardColorLabel(client.dashboardColor || 'blue')}</span>
                        <small>{statusMeta.description}</small>
                      </div>

                      <div className="user-directory-actions client-directory-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setActiveClientId(client.id)
                            setIsEditClientModalOpen(true)
                          }}
                        >
                          Editar
                        </button>
                        {isMaster && clients.length > 1 && (
                          <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClient(client.id)}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  )})}
                </div>

                {!clients.length && (
                  <div className="empty-panel glass-item users-empty-state compact-empty-state">
                    <h3>Nenhum cliente encontrado</h3>
                    <p>Crie um cliente novo para começar a configurar a operação.</p>
                  </div>
                )}
              </div>
            </div>

            <section className="client-command-grid">
              <div className="glass-panel client-activity-card client-activity-card-large">
                <div className="client-activity-head">
                  <div>
                    <span className="management-card-kicker">Activity summary</span>
                    <h3>Atividade recente da base</h3>
                  </div>
                  <button type="button" className="client-activity-link">Ver auditoria</button>
                </div>
                <div className="client-activity-list client-activity-list-extended">
                  <div className="client-activity-item">
                    <span className="client-activity-icon client-activity-icon-primary">
                      <i className="bx bx-key"></i>
                    </span>
                    <div>
                      <strong>{clients[0]?.name ? `${clients[0].name} segue como principal foco de leitura da operação.` : 'Nenhum cliente foi definido como foco principal ainda.'}</strong>
                      <small>Agora</small>
                    </div>
                  </div>
                  <div className="client-activity-item">
                    <span className="client-activity-icon client-activity-icon-success">
                      <i className="bx bx-user-plus"></i>
                    </span>
                    <div>
                      <strong>{`${formatNumber(connectedClientsCount)} cliente(s) já conseguem entrar na leitura com dados conectados.`}</strong>
                      <small>Conexões ativas</small>
                    </div>
                  </div>
                  <div className="client-activity-item">
                    <span className="client-activity-icon client-activity-icon-alert">
                      <i className="bx bx-shield-quarter"></i>
                    </span>
                    <div>
                      <strong>{pendingClientsCount ? `${formatNumber(pendingClientsCount)} cliente(s) exigem revisão de identidade ou conta Meta.` : 'Nenhuma pendência estrutural relevante nesta base.'}</strong>
                      <small>Fila de revisão</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-panel client-security-card">
                <div className="client-security-head">
                  <h3>Status estrutural</h3>
                  <i className="bx bx-shield-quarter"></i>
                </div>
                <div className="client-security-meters">
                  <div className="client-security-meter">
                    <div>
                      <span>Integridade da base</span>
                      <strong>{`${Math.max(72, Math.round(clientSecurityScore))}%`}</strong>
                    </div>
                    <div className="client-security-track">
                      <div className="client-security-fill client-security-fill-primary" style={{ width: `${Math.max(72, Math.round(clientSecurityScore))}%` }}></div>
                    </div>
                  </div>
                  <div className="client-security-meter">
                    <div>
                      <span>Identidade visual</span>
                      <strong>{brandedClientsCount ? 'Ativa' : 'Pendente'}</strong>
                    </div>
                    <div className="client-security-track">
                      <div className="client-security-fill client-security-fill-tertiary" style={{ width: `${clients.length ? Math.round((brandedClientsCount / clients.length) * 100) : 0}%` }}></div>
                    </div>
                  </div>
                </div>
                <div className="client-security-note">
                  <div className="client-security-note-head">
                    <i className="bx bx-badge-check"></i>
                    <span>Varredura operacional</span>
                  </div>
                  <p>
                    {connectedClientsCount
                      ? 'A base já está pronta para cruzar campanhas, operação e contexto do cliente em leituras executivas.'
                      : 'Conecte ao menos uma conta Meta para liberar leitura operacional orientada por dados no copiloto.'}
                  </p>
                </div>
              </div>
            </section>

            <div className="clients-grid clients-grid-single">
              <div className="glass-panel users-toolbar-card management-directory-card">
                <div className="user-picker-head">
                  <div>
                    <span className="management-card-kicker">Access grouping</span>
                    <h3>Grupos de clientes</h3>
                    <p>Escolha os dashboards que pertencem a cada grupo para depois liberar acesso em lote aos usuários.</p>
                  </div>
                </div>

                <div className="client-groups-grid">
                  {clientGroups.map((group) => (
                    <div key={group.id} className="glass-item client-group-card">
                      <div className="client-group-head">
                        <div className="input-group">
                          <label>Nome do grupo</label>
                          <input
                            type="text"
                            value={group.name}
                            onChange={(event) => handleClientGroupFieldChange(group.id, 'name', event.target.value)}
                            placeholder="Nome do grupo"
                            disabled={!isMaster}
                          />
                        </div>
                        {isMaster && (
                          <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClientGroup(group.id)}>
                            Excluir
                          </button>
                        )}
                      </div>

                      <div className="input-group">
                        <label>Dashboards dentro do grupo</label>
                        <div className="stage-selector">
                          {clients.map((client) => {
                            const hasClient = normalizeClientGroupClientIds(group.clientIds).includes(client.id)

                            return (
                              <label key={`${group.id}-${client.id}`} className={`stage-chip ${hasClient ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={hasClient}
                                  onChange={() => handleClientGroupClientToggle(group.id, client.id)}
                                  disabled={!isMaster}
                                />
                                <span>{client.name}</span>
                              </label>
                            )
                          })}
                        </div>
                        <span className="field-helper">
                          {group.clientIds.length} dashboard(s) vinculado(s) a este grupo.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {!clientGroups.length && (
                  <div className="empty-panel glass-item users-empty-state compact-empty-state">
                    <h3>Nenhum grupo criado</h3>
                    <p>Crie grupos para conceder acesso em lote aos dashboards.</p>
                  </div>
                )}
              </div>
            </div>

            <section className="client-intelligence-grid">
              <div className="glass-panel client-intelligence-feature">
                <div className="client-intelligence-kicker">
                  <i className="bx bx-bulb"></i>
                  Insight operacional
                </div>
                <h3>
                  {clients.length
                    ? `${clients.filter((client) => client.metaAdAccountId).length} cliente(s) já estão prontos para leitura com dados conectados.`
                    : 'Comece cadastrando o primeiro cliente para estruturar a operação.'}
                </h3>
                <p>
                  {clients.filter((client) => client.metaAdAccountId).length
                    ? 'Priorize agora os clientes com conta Meta ativa e complete a identidade dos demais para deixar a apresentação consistente.'
                    : 'Assim que o primeiro cliente entrar, você já pode conectar Meta, CRM, planilhas e identidade visual no mesmo fluxo.'}
                </p>
                <button type="button" className="btn btn-primary">
                  Gerar plano de expansão
                </button>
              </div>

              <div className="glass-panel client-activity-card">
                <div className="client-activity-head">
                  <h3>Atividade recente da base</h3>
                  <button type="button" className="client-activity-link">Ver auditoria</button>
                </div>
                <div className="client-activity-list">
                  <div className="client-activity-item">
                    <span className="client-activity-dot client-activity-dot-primary"></span>
                    <div>
                      <strong>{clients[0]?.name ? `${clients[0].name} aparece como cliente em foco do workspace.` : 'Nenhum cliente selecionado como principal no momento.'}</strong>
                      <small>Agora</small>
                    </div>
                  </div>
                  <div className="client-activity-item">
                    <span className="client-activity-dot client-activity-dot-success"></span>
                    <div>
                      <strong>{`${formatNumber(clientGroups.length)} grupo(s) disponíveis para liberar acesso em lote.`}</strong>
                      <small>Estrutura de acesso</small>
                    </div>
                  </div>
                  <div className="client-activity-item">
                    <span className="client-activity-dot client-activity-dot-muted"></span>
                    <div>
                      <strong>{`${formatNumber(clients.filter((client) => !client.logoUrl).length)} cliente(s) ainda sem logo configurada.`}</strong>
                      <small>Identidade visual</small>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </section>
        )}

        {activeTab === 'clientes' && isEditClientModalOpen && activeClient && (
          <div className="modal-overlay" onClick={() => setIsEditClientModalOpen(false)}>
            <div className="modal-card modal-card-wide glass-panel" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Editar cliente</h3>
                  <p>Atualize identidade, contas vinculadas e integrações específicas desse cliente.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setIsEditClientModalOpen(false)} aria-label="Fechar edição de cliente">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <form className="client-editor-card modal-client-editor" onSubmit={handleSaveIntegrations}>
                <div className="client-editor-header">
                  <div>
                    <h3>Editando: {activeClient.name}</h3>
                    <p>Qualquer ajuste aqui já define como a dash desse cliente vai abrir.</p>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isSavingIntegrations || !canManageClients}>
                    {isSavingIntegrations ? 'Salvando...' : 'Salvar cliente'}
                  </button>
                </div>

                <div className="integration-block client-identity-block">
                  <div className="integration-heading">
                    <div className="integration-icon" style={{ color: currentTheme.main, borderColor: `${currentTheme.main}33` }}>
                      <i className="bx bx-id-card"></i>
                    </div>
                    <div>
                      <h3>Identidade do cliente</h3>
                      <p>Defina nome, cor e logo para organizar a conta e personalizar a apresentação final.</p>
                    </div>
                  </div>

                  <div className="client-identity-layout">
                    <div className="client-identity-main">
                      <div className="input-group">
                        <label>Nome do cliente</label>
                        <input type="text" value={activeClient.name} onChange={(event) => handleClientFieldChange('name', event.target.value)} placeholder="Nome do cliente" />
                      </div>

                      <div className="branding-grid">
                        <div className="input-group">
                          <label>Logo do cliente</label>
                          <input type="file" accept="image/*" onChange={handleClientLogoUpload} />
                        </div>

                        <div className="input-group">
                          <label>Ou cole a URL da logo</label>
                          <input type="text" value={activeClient.logoUrl || ''} onChange={(event) => handleClientFieldChange('logoUrl', event.target.value)} placeholder="https://..." />
                        </div>
                      </div>

                      <div className="logo-preview">
                        {activeClient.logoUrl ? <img src={activeClient.logoUrl} alt={`Logo ${activeClient.name}`} /> : <span>Sem logo definida</span>}
                      </div>
                    </div>

                    <div className="client-identity-side">
                      <div className="input-group">
                        <label>Cor da dashboard</label>
                        <div className="dashboard-color-editor">
                          <div className="dashboard-color-preview-row">
                            <input
                              type="color"
                              value={activeClientDashboardHex}
                              onChange={(event) => handleClientDashboardHexChange(event.target.value)}
                              aria-label="Selecionar cor da dashboard"
                            />
                            <div className="dashboard-color-code">
                              <strong>{activeClientDashboardHex.toUpperCase()}</strong>
                              <span>{`rgb(${activeClientDashboardRgb.r}, ${activeClientDashboardRgb.g}, ${activeClientDashboardRgb.b})`}</span>
                            </div>
                          </div>
                          <div className="dashboard-rgb-grid">
                            <label className="dashboard-rgb-field">
                              <span>R</span>
                              <input
                                type="number"
                                min="0"
                                max="255"
                                value={activeClientDashboardRgb.r}
                                onChange={(event) => handleClientDashboardRgbChange('r', event.target.value)}
                              />
                            </label>
                            <label className="dashboard-rgb-field">
                              <span>G</span>
                              <input
                                type="number"
                                min="0"
                                max="255"
                                value={activeClientDashboardRgb.g}
                                onChange={(event) => handleClientDashboardRgbChange('g', event.target.value)}
                              />
                            </label>
                            <label className="dashboard-rgb-field">
                              <span>B</span>
                              <input
                                type="number"
                                min="0"
                                max="255"
                                value={activeClientDashboardRgb.b}
                                onChange={(event) => handleClientDashboardRgbChange('b', event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="dashboard-theme-presets">
                            {Object.entries(THEMES).map(([themeKey, theme]) => (
                              <button
                                key={themeKey}
                                type="button"
                                className={`dashboard-theme-preset ${activeClient.dashboardColor === themeKey ? 'active' : ''}`}
                                onClick={() => {
                                  handleClientFieldChange('dashboardColor', themeKey)
                                  setThemeColor(themeKey)
                                }}
                              >
                                <span className="dashboard-theme-swatch" style={{ background: theme.main }}></span>
                                <small>{themeKey}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="integration-block">
                    <div className="integration-heading">
                      <div className="integration-icon" style={{ color: '#0668E1', borderColor: '#0668E133' }}>
                        <i className="bx bxl-meta"></i>
                      </div>
                      <div>
                        <h3>Meta Ads</h3>
                        <p>Selecione a conta de anúncio deste cliente usando a credencial global cadastrada em Configurações.</p>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>Conta do Meta vinculada ao cliente</label>
                      <select
                        className="client-select-input"
                        value={activeClient.metaAdAccountId || ''}
                        onChange={(event) => handleClientFieldChange('metaAdAccountId', event.target.value)}
                      >
                        <option value="">
                          {hasMetaManualToken || hasMetaOauthConnection
                            ? 'Selecione uma conta'
                            : 'Cadastre um token manual ou conecte a Meta em Configurações'}
                        </option>
                        {adAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name ? `${account.name} (${account.id})` : account.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {CLIENT_INTEGRATION_GROUPS.map((group) => (
                    <div key={group.title} className="integration-block">
                      <div className="integration-heading">
                        <div className="integration-icon" style={{ color: group.accent, borderColor: `${group.accent}33` }}>
                          <i className={`bx ${group.icon}`}></i>
                        </div>
                        <div>
                          <h3>{group.title}</h3>
                          <p>{group.description}</p>
                        </div>
                      </div>

                      {group.fields.map((field) => {
                        const value = field.storage === 'client' ? activeClient[field.name] || '' : activeIntegrations[field.name] || ''

                        return (
                          <div key={field.name} className="input-group">
                            <label>{field.label}</label>
                            <input
                              type={field.type}
                              value={value}
                              onChange={(event) => handleIntegrationChange(field.name, event.target.value, field.storage)}
                              placeholder={field.placeholder}
                            />
                          </div>
                        )
                      })}

                      {group.title === 'Google Sheets' && (
                        <div className="field-helper">
                          Use uma planilha pública ou publicada em CSV. Cada linha será tratada como um lead ou registro, e a coluna de status será lida como pipeline para contar quantos estão em cada etapa.
                        </div>
                      )}

                      {group.title === 'RD Station' && (
                        <>
                          <div className="input-group">
                            <label>Funil do RD para este cliente</label>
                            <select
                              value={activeClient?.rdPipelineId || ''}
                              onChange={(event) => handleClientFieldChange('rdPipelineId', event.target.value)}
                            >
                              <option value="">Todos os funis</option>
                              {rdPipelineOptions.map((pipeline) => (
                                <option key={pipeline.id} value={pipeline.id}>
                                  {pipeline.name}
                                </option>
                              ))}
                            </select>
                            <span className="field-helper">
                              Escolha o pipeline que este cliente usa no RD. As métricas do CRM passam a considerar só esse funil.
                            </span>
                          </div>

                          <div className="qualification-config">
                            <button
                              type="button"
                              className="qualification-toggle"
                              onClick={() => setIsQualifiedStagesVisible((current) => !current)}
                            >
                              <div>
                                <strong>Etapas qualificadas do pipeline</strong>
                                <span>Configuração operacional usada nos cálculos de qualificação e taxas do CRM. Não aparece no dashboard final.</span>
                              </div>
                              <i className={`bx ${isQualifiedStagesVisible ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                            </button>

                            {isQualifiedStagesVisible && (
                              <div className="qualification-panel">
                                <p className="field-helper">
                                  Selecione as etapas que você considera qualificadas. Os cálculos em cascata do CRM passam a usar essa definição automaticamente.
                                </p>
                                <div className="stage-selector">
                                  {availableRdStages.length ? (
                                    availableRdStages.map((stage) => {
                                      const checked = selectedQualifiedStages.includes(stage)

                                      return (
                                        <label key={stage} className={`stage-chip ${checked ? 'active' : ''}`}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleQualifiedStageToggle(stage)}
                                          />
                                          <span>{stage}</span>
                                        </label>
                                      )
                                    })
                                  ) : (
                                    <div className="stage-empty">
                                      Salve o token do RD e aguarde a leitura do funil para listar automaticamente as etapas do pipeline.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </form>
            </div>
          </div>
        )}


        {activeTab === 'usuarios' && canManageUsers && (
          <section className="clients-layout users-management-layout">
            <div className="glass-panel management-hero users-intro-card">
              <div className="management-hero-copy">
                <span className="management-hero-kicker">Access governance</span>
                <h2>Gerencie acessos, permissões e leitura por workspace</h2>
                <p>Defina quem entra na operação, quais dashboards cada pessoa pode visualizar e como o acesso se distribui entre master, operador, cliente e visualizador.</p>
              </div>
              <div className="management-stats-grid">
                <div className="management-stat-card">
                  <small>Total de usuários</small>
                  <strong>{formatNumber(users.length)}</strong>
                </div>
                <div className="management-stat-card">
                  <small>Masters</small>
                  <strong>{formatNumber(users.filter((managedUser) => managedUser.role === 'master').length)}</strong>
                </div>
                <div className="management-stat-card">
                  <small>Clientes liberados</small>
                  <strong>{formatNumber(clients.length)}</strong>
                </div>
                <div className="management-stat-card">
                  <small>Grupos disponíveis</small>
                  <strong>{formatNumber(clientGroups.length)}</strong>
                </div>
              </div>
            </div>

            <div className="glass-panel users-toolbar-card management-directory-card">
              <div className="user-picker-head">
                <div>
                  <span className="management-card-kicker">Team registry</span>
                  <h3>Usuários cadastrados</h3>
                  <p>Use a busca para encontrar um acesso e abra a edição em um pop-up, sem ocupar a tela principal.</p>
                </div>
                <div className="users-toolbar-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setIsCreateUserModalOpen(true)}>
                    Novo usuário
                  </button>
                </div>
              </div>

              <div className="users-search-row">
                <div className="input-group users-search-field">
                  <label>Buscar usuário</label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Nome ou e-mail"
                  />
                </div>
              </div>

              {usersLoading ? (
                <div className="empty-panel glass-item">
                  <h3>Carregando usuários</h3>
                  <p>Estamos buscando os acessos liberados neste workspace.</p>
                </div>
              ) : (
                <div className="user-directory-grid">
                  {filteredUsers.map((managedUser) => (
                    <div key={`user-list-${managedUser.id}`} className="user-directory-card glass-item">
                      <div className="user-directory-topline">
                        <div className="directory-card-icon">
                          <i className="bx bx-user"></i>
                        </div>
                        <span className="user-role-badge">{roleLabels[managedUser.role] || managedUser.role}</span>
                      </div>
                      <div className="user-directory-main">
                        <strong>{managedUser.full_name || managedUser.email}</strong>
                        <span>{managedUser.email}</span>
                      </div>
                      <div className="user-directory-meta">
                        <span className="user-role-badge">{aiAccessLabels[managedUser.ai_access_level] || 'IA Time'}</span>
                        <small>
                          {managedUser.role === 'master'
                            ? 'Acesso total'
                            : `${getManagedUserAccessibleClientCount(managedUser)} dashboard(s) liberado(s)`}
                        </small>
                      </div>
                      <div className="user-directory-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedUserId(managedUser.id)
                            setIsEditUserModalOpen(true)
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!usersLoading && !filteredUsers.length && (
                <div className="empty-panel glass-item users-empty-state compact-empty-state">
                  <h3>Nenhum usuário encontrado</h3>
                  <p>Ajuste a busca ou crie um novo acesso para o workspace.</p>
                </div>
              )}
            </div>

            {isCreateUserModalOpen && (
              <div className="modal-overlay" onClick={() => setIsCreateUserModalOpen(false)}>
                <div className="modal-card glass-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <h3>Novo usuário</h3>
                      <p>Cadastre um novo acesso e defina exatamente quais dashboards ele poderá enxergar.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => setIsCreateUserModalOpen(false)} aria-label="Fechar cadastro de usuário">
                      <i className="bx bx-x"></i>
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser}>
                    {createUserError && <div className="form-alert">{createUserError}</div>}

                    <div className="form-grid user-admin-grid">
                      <div className="input-group">
                        <label>Nome</label>
                        <input type="text" value={userForm.fullName} onChange={(event) => setUserForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nome completo" />
                      </div>
                      <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com" />
                      </div>
                      <div className="input-group">
                        <label>Senha inicial</label>
                        <input type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} placeholder="Senha provisória" />
                      </div>
                      <div className="input-group">
                        <label>Nível liberado</label>
                        <select className="client-select-input" value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
                          <option value="visualizador">Visualizador</option>
                          <option value="operador">Operador</option>
                          <option value="cliente">Cliente</option>
                          <option value="master">Master</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Liberação da IA</label>
                        <select
                          className="client-select-input"
                          value={userForm.aiAccessLevel}
                          onChange={(event) => setUserForm((current) => ({ ...current, aiAccessLevel: event.target.value }))}
                        >
                          <option value="team">IA Time</option>
                          <option value="master">IA Master</option>
                        </select>
                      </div>
                    </div>

                    {userForm.role !== 'master' && (
                      <>
                        <div className="input-group">
                          <label>Dashboards liberados</label>
                          <div className="stage-selector">
                            {clients.map((client) => (
                              <label key={`new-user-${client.id}`} className={`stage-chip ${userForm.clientIds.includes(client.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={userForm.clientIds.includes(client.id)}
                                  onChange={() => handleUserClientToggle(client.id)}
                                />
                                <span>{client.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="input-group">
                          <label>Grupos liberados</label>
                          <div className="stage-selector">
                            {clientGroups.length ? (
                              clientGroups.map((group) => (
                                <label key={`new-user-group-${group.id}`} className={`stage-chip ${userForm.clientGroupIds.includes(group.id) ? 'active' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={userForm.clientGroupIds.includes(group.id)}
                                    onChange={() => handleUserClientGroupToggle(group.id)}
                                  />
                                  <span>{group.name}</span>
                                </label>
                              ))
                            ) : (
                              <div className="stage-empty">
                                Nenhum grupo criado ainda. Crie grupos na aba de clientes para liberar acesso por grupo.
                              </div>
                            )}
                          </div>
                          {createUserError.includes('grupos de clientes') && (
                            <span className="field-helper">
                              O restante do cadastro continua funcionando. Para liberar grupos, aplique a migration do Supabase primeiro.
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setIsCreateUserModalOpen(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={savingUser}>
                        {savingUser ? 'Criando...' : 'Adicionar usuário'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {isEditUserModalOpen && selectedManagedUser && (
              <div className="modal-overlay" onClick={() => setIsEditUserModalOpen(false)}>
                <div className="modal-card glass-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <h3>Editar usuário</h3>
                      <p>Ajuste nível, dashboards liberados e demais permissões deste acesso.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => setIsEditUserModalOpen(false)} aria-label="Fechar edição de usuário">
                      <i className="bx bx-x"></i>
                    </button>
                  </div>

                  {editUserError && <div className="form-alert">{editUserError}</div>}

                  <div className="user-admin-head">
                    <div>
                      <strong>{selectedManagedUser.full_name || selectedManagedUser.email}</strong>
                      <span>{selectedManagedUser.email}</span>
                    </div>
                    {selectedManagedUser.id !== user?.id && (
                      <button type="button" className="btn btn-secondary" onClick={() => handleDeleteUser(selectedManagedUser.id)}>
                        Excluir
                      </button>
                    )}
                  </div>

                  <div className="form-grid user-admin-grid">
                    <div className="input-group">
                      <label>Nome</label>
                      <input
                        type="text"
                        value={selectedManagedUser.full_name || ''}
                        onChange={(event) =>
                          handleManagedUserChange(selectedManagedUser.id, (item) => ({ ...item, full_name: event.target.value }))
                        }
                      />
                    </div>
                      <div className="input-group">
                        <label>Nível</label>
                        <select
                          className="client-select-input"
                        value={selectedManagedUser.role}
                        onChange={(event) =>
                          handleManagedUserChange(selectedManagedUser.id, (item) => ({ ...item, role: event.target.value }))
                        }
                      >
                        <option value="visualizador">Visualizador</option>
                        <option value="operador">Operador</option>
                        <option value="cliente">Cliente</option>
                          <option value="master">Master</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Liberação da IA</label>
                        <select
                          className="client-select-input"
                          value={selectedManagedUser.ai_access_level || (selectedManagedUser.role === 'master' ? 'master' : 'team')}
                          onChange={(event) =>
                            handleManagedUserChange(selectedManagedUser.id, (item) => ({ ...item, ai_access_level: event.target.value }))
                          }
                        >
                          <option value="team">IA Time</option>
                          <option value="master">IA Master</option>
                        </select>
                      </div>
                    </div>

                  {selectedManagedUser.role !== 'master' && (
                    <>
                      <div className="input-group">
                        <label>Dashboards liberados</label>
                        <div className="stage-selector">
                          {clients.map((client) => {
                            const currentAccess = selectedManagedUser.clientAccess || []
                            const hasClient = currentAccess.some((item) => item.client_id === client.id)

                            return (
                              <label key={`${selectedManagedUser.id}-${client.id}`} className={`stage-chip ${hasClient ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={hasClient}
                                  onChange={() =>
                                    handleManagedUserChange(selectedManagedUser.id, (item) => {
                                      const baseAccess = item.clientAccess || []
                                      const nextAccess = hasClient
                                        ? baseAccess.filter((accessItem) => accessItem.client_id !== client.id)
                                        : [
                                            ...baseAccess,
                                            {
                                              client_id: client.id,
                                              can_view: true,
                                              can_edit: item.role === 'operador',
                                            },
                                          ]

                                      return { ...item, clientAccess: nextAccess }
                                    })
                                  }
                                />
                                <span>{client.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Grupos liberados</label>
                        <div className="stage-selector">
                          {clientGroups.length ? (
                            clientGroups.map((group) => {
                              const currentGroupAccess = selectedManagedUser.clientGroupAccess || []
                              const hasGroup = currentGroupAccess.some((item) => item.group_id === group.id)

                              return (
                                <label key={`${selectedManagedUser.id}-group-${group.id}`} className={`stage-chip ${hasGroup ? 'active' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={hasGroup}
                                    onChange={() =>
                                      handleManagedUserChange(selectedManagedUser.id, (item) => {
                                        const baseGroupAccess = item.clientGroupAccess || []
                                        const nextGroupAccess = hasGroup
                                          ? baseGroupAccess.filter((groupAccess) => groupAccess.group_id !== group.id)
                                          : [
                                              ...baseGroupAccess,
                                              {
                                                group_id: group.id,
                                                can_view: true,
                                                can_edit: item.role === 'operador',
                                              },
                                            ]

                                        return { ...item, clientGroupAccess: nextGroupAccess }
                                      })
                                    }
                                  />
                                  <span>{group.name}</span>
                                </label>
                              )
                            })
                          ) : (
                            <div className="stage-empty">
                              Nenhum grupo criado ainda. Crie grupos na aba de clientes para liberar acesso por grupo.
                            </div>
                          )}
                        </div>
                        {editUserError.includes('grupos de clientes') && (
                          <span className="field-helper">
                            O acesso por dashboard segue funcionando. Para liberar grupos, aplique a migration do Supabase primeiro.
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <div className="modal-foot">
                    <span className="form-note">
                      {selectedManagedUser.role === 'master' && 'Acesso total: usuários, clientes e integrações.'}
                      {selectedManagedUser.role === 'operador' && 'Pode editar integrações e clientes liberados.'}
                      {selectedManagedUser.role === 'visualizador' && 'Pode apenas visualizar os dashboards liberados.'}
                      {selectedManagedUser.role === 'cliente' && 'Acesso externo focado só nos dashboards atribuídos.'}
                      {' '}
                      {(selectedManagedUser.ai_access_level || (selectedManagedUser.role === 'master' ? 'master' : 'team')) === 'master'
                        ? 'IA Master liberada com acesso completo ao contexto interno.'
                        : 'IA Time liberada apenas para dados de campanha.'}
                    </span>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setIsEditUserModalOpen(false)}>
                        Cancelar
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => handleUpdateUser(selectedManagedUser)}>
                        Salvar acesso
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'apresentacao' && (
          <div ref={dashboardRef}>
            <section className="glass-panel hero-panel">
              <div className="hero-copy">
                {activeClient?.logoUrl && (
                  <div className="hero-logo-wrap">
                    <img src={activeClient.logoUrl} alt={`Logo ${activeClient.name}`} className="hero-logo" />
                  </div>
                )}
                <span className="hero-badge" style={{ color: currentTheme.main, borderColor: currentTheme.main }}>
                  {`Dashboard ${activeClient?.name || 'do cliente'}`}
                </span>
                <h2>{activeClient?.name || 'Selecione um cliente'}</h2>
                <p>
                  A seguir, apresentamos um panorama consolidado do período selecionado, separando os dados por origem para facilitar a leitura executiva da operação.
                </p>
              </div>
              <div className="hero-meta">
                {!hasAnyPresentationData ? (
                  <div className="hero-stat hero-stat-empty">
                    <span>Nenhuma integração ativa</span>
                    <strong>Cadastre uma integração do cliente ou da operação</strong>
                  </div>
                ) : (
                  <>
                    {hasMetaConfigured && (
                      <div className="hero-stat">
                        <span>Conta de anúncio</span>
                        <strong>{selectedAdAccount || 'Defina a conta do cliente'}</strong>
                      </div>
                    )}
                    {Boolean([
                      activeClient?.googleAdsAccountId,
                      activeClient?.tiktokAdsAccountId,
                      activeClient?.linkedInAdsAccountId,
                    ].filter(Boolean).length) && (
                      <div className="hero-stat">
                        <span>Outras contas de anúncio</span>
                        <strong>{[
                          activeClient?.googleAdsAccountId,
                          activeClient?.tiktokAdsAccountId,
                          activeClient?.linkedInAdsAccountId,
                        ].filter(Boolean).length} conta(s) vinculada(s)</strong>
                      </div>
                    )}
                    {hasSheetsConfigured && (
                      <div className="hero-stat">
                        <span>Google Sheets</span>
                        <strong>{googleSheetsSummary?.totalRows ? `${googleSheetsSummary.totalRows} linha(s) lida(s)` : 'Planilha conectada'}</strong>
                      </div>
                    )}
                    {hasRdConfigured && (
                      <>
                        <div className="hero-stat">
                          <span>CRM</span>
                          <strong>{activeClient?.rdStationAccountId || 'Token configurado para este cliente'}</strong>
                        </div>
                        <div className="hero-stat">
                          <span>Funil</span>
                          <div className="hero-select-wrap">
                            <select value={draftRdPipelineFilter} onChange={(event) => setDraftRdPipelineFilter(event.target.value)} className="hero-select">
                              <option value="">Todos os funis</option>
                              {rdPipelineOptions.map((pipeline) => (
                                <option key={pipeline.id} value={pipeline.id}>
                                  {pipeline.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="hero-stat">
                          <span>Vendedor</span>
                          <div className="hero-select-wrap">
                            <select value={draftRdSellerFilter} onChange={(event) => setDraftRdSellerFilter(event.target.value)} className="hero-select">
                              <option value="all">Todos os vendedores</option>
                              {(rdSummary?.sellers || []).map((seller) => (
                                <option key={seller.id} value={seller.id}>
                                  {seller.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            {errorMessage && <div className="feedback-banner">{errorMessage}</div>}

            {!activeClient ? (
              !canViewDashboard ? (
              <div className="empty-panel glass-panel">
                <h3>Aguardando liberação</h3>
                <p>Seu usuário já existe, mas ainda não recebeu acesso a nenhum workspace ou dashboard. Peça ao master para liberar sua conta.</p>
              </div>
            ) : (
              <div className="empty-panel glass-panel">
                <h3>Crie um cliente primeiro</h3>
                <p>Use a aba de clientes para adicionar sua operação antes de abrir a apresentação.</p>
              </div>
            )
            ) : isLoading ? (
              <div className="empty-panel glass-panel">
                <h3>Sincronizando com as APIs</h3>
                <p>Estamos puxando os dados configurados para {activeClient.name}.</p>
              </div>
            ) : !hasAnyPresentationData ? (
              <div className="empty-panel glass-panel">
                <h3>Defina a operação</h3>
                <p>Cadastre ao menos uma integração do cliente ou da operação para liberar a apresentação dinâmica do dashboard.</p>
                <button type="button" className="btn btn-primary" onClick={() => setActiveTab('clientes')}>
                  Abrir clientes
                </button>
              </div>
            ) : (
              <>
                {hasMetaConfigured && (
                  <section className="source-section">
                    <div className="source-section-header">
                      <div className="source-section-badge" style={{ color: '#0668E1', borderColor: '#0668E1' }}>
                        <i className="bx bxl-meta"></i>
                        <span>Meta Ads</span>
                      </div>
                      <p className="source-section-copy">Primeiro bloco de leitura das contas de anúncio e da performance de mídia.</p>
                    </div>
                <section className="glass-panel meta-filter-panel">
                  <div className="meta-filter-panel-head">
                    <div>
                      <span className="meta-filter-kicker">Leitura por objetivo</span>
                      <h2>Filtro por tipo de resultado</h2>
                      <p className="chart-subtitle">O relatório considera apenas campanhas que geraram o tipo de resultado selecionado.</p>
                    </div>
                    <span className="meta-filter-helper">Todos começam marcados por padrão.</span>
                  </div>
                  <div className="stage-selector meta-filter-chip-row">
                    {availableMetaResultFilters.map((filter) => (
                      <label key={filter.key} className={`stage-chip ${normalizedDraftMetaResultFilters.includes(filter.key) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={normalizedDraftMetaResultFilters.includes(filter.key)}
                          onChange={() => handleMetaResultFilterToggle(filter.key)}
                        />
                        <span>{filter.label}</span>
                      </label>
                    ))}
                  </div>
                  {availableMetaCampaignOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaCampaignFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaCampaignFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por campanha</h3>
                          <p>{metaCampaignFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaCampaignFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaCampaignFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Selecione as campanhas específicas que quer considerar. Todas começam marcadas por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {availableMetaCampaignOptions.map((campaign) => (
                              <label key={campaign.id} className={`stage-chip ${activeDraftMetaCampaignIds.includes(campaign.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaCampaignIds.includes(campaign.id)}
                                  onChange={() => handleMetaCampaignFilterToggle(campaign.id)}
                                />
                                <span>{campaign.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {draftAvailableMetaAdsetOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaAdsetFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaAdsetFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por conjunto</h3>
                          <p>{metaAdsetFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaAdsetFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaAdsetFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Os conjuntos seguem a campanha selecionada. Todos começam marcados por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {draftAvailableMetaAdsetOptions.map((adset) => (
                              <label key={adset.id} className={`stage-chip ${activeDraftMetaAdsetIds.includes(adset.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaAdsetIds.includes(adset.id)}
                                  onChange={() => handleMetaAdsetFilterToggle(adset.id)}
                                />
                                <span>{adset.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {draftAvailableMetaAdOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaAdFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaAdFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por anúncio</h3>
                          <p>{metaAdFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaAdFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaAdFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Os anúncios seguem campanha e conjunto selecionados. Todos começam marcados por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {draftAvailableMetaAdOptions.map((ad) => (
                              <label key={ad.id} className={`stage-chip ${activeDraftMetaAdIds.includes(ad.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaAdIds.includes(ad.id)}
                                  onChange={() => handleMetaAdFilterToggle(ad.id)}
                                />
                                <span>{ad.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <section className="glass-panel grouped-results">
                  <div className="section-header section-header-stack section-header-with-action">
                    <div>
                      <h2>Resumo de resultados</h2>
                      <p className="chart-subtitle">Os indicadores abaixo consideram somente as campanhas enquadradas no filtro de resultado ativo.</p>
                    </div>
                    {activeDraftDashboardTemplate && (
                      <div className="metric-library-anchor metric-library-inline-trigger">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setIsMetaMetricLibraryOpen((current) => !current)}
                          disabled={!availableMetaDashboardMetricOptions.length}
                        >
                          <i className="bx bx-plus"></i>
                          Adicionar métrica
                        </button>
                      </div>
                    )}
                  </div>

                  {activeDraftDashboardTemplate && isMetaMetricLibraryOpen && (
                    <div className="metric-library-panel glass-item metric-library-inline-panel">
                      <div>
                        <strong>Métricas Meta disponíveis</strong>
                        <p>Adicione novos cards usando o mesmo layout visual das métricas já existentes no dashboard.</p>
                      </div>
                      {renderMetricLibraryGrid(
                        availableMetaDashboardMetricOptions,
                        metaDashboardMetricValues,
                        handleAddMetaDashboardMetric,
                        { compact: true }
                      )}
                    </div>
                  )}

                  <div className="template-metrics-shell">
                    <div className="result-group">
                      <div className="result-group-head">
                        <h3>Mídia e distribuição</h3>
                        <p>Visão geral do investimento e da entrega da campanha.</p>
                      </div>
                      {renderMetaSummaryMetricGrid(
                        metaSummaryDashboardMetricCards,
                        availableMetaDashboardMetricOptions.length > 0
                      )}
                    </div>

                    <div className="conversion-groups-grid">
                      {metaConversionGroups.map((group) => (
                        <article
                          key={group.key}
                          className={`conversion-group-card glass-panel ${group.resultValue > 0 ? 'conversion-group-card-active' : 'conversion-group-card-muted'}`}
                        >
                          <div className="conversion-group-head">
                            <div className={`icon-box ${group.tone}`}>
                              <i className={`bx ${group.icon}`}></i>
                            </div>
                            <div>
                              <h3>{group.title}</h3>
                              <p>{group.description}</p>
                            </div>
                          </div>
                          <div className="conversion-stats">
                            {group.stats.map((stat) => (
                              <div key={stat.label} className="conversion-stat">
                                <span>{stat.label}</span>
                                <strong>{stat.value}</strong>
                              </div>
                            ))}
                          </div>
                          {group.secondaryInsights ? (
                            <div className="conversion-group-footer">
                              <button
                                type="button"
                                className="conversion-group-secondary-trigger"
                                onClick={() => setMetaSecondaryResultDrilldown(group.key)}
                              >
                                <i className="bx bx-info-circle"></i>
                                Conversões extras
                              </button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>

                    <div className="glass-panel meta-result-preview-panel">
                      <div className="meta-result-preview-head">
                        <div>
                          <span className="meta-result-preview-kicker">Comparativo de resultado</span>
                          <h3>{activeMetaResultPreviewConfig.title} x custo</h3>
                          <p>Leia a evolução do resultado junto com o custo no agrupamento que fizer mais sentido para decisão.</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary conversion-group-expand"
                          onClick={() => setMetaResultDrilldown({ key: activeMetaResultPreviewConfig.key })}
                        >
                          <i className="bx bx-expand-alt"></i>
                          Expandir gráfico
                        </button>
                      </div>

                      <div className="meta-result-preview-toolbar">
                        <div className="meta-result-preview-tabs">
                          {activeMetaComparisonGroups.map((group) => (
                            <button
                              key={`preview-${group.key}`}
                              type="button"
                              className={`meta-result-preview-tab ${metaResultPreviewKey === group.key ? 'active' : ''} ${group.resultValue > 0 ? 'meta-result-preview-tab-active-model' : 'meta-result-preview-tab-muted'}`}
                              onClick={() => setMetaResultPreviewKey(group.key)}
                            >
                              {group.title}
                            </button>
                          ))}
                        </div>

                        <div className="meta-result-periods">
                          {META_RESULT_PERIOD_OPTIONS.map((option) => (
                            <button
                              key={`inline-${option.value}`}
                              type="button"
                              className={`meta-result-period-btn ${metaResultGrouping === option.value ? 'active' : ''}`}
                              onClick={() => setMetaResultGrouping(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="meta-result-summary meta-result-summary-inline">
                        <div className="monday-drilldown-stat glass-item">
                          <span>{activeMetaResultPreviewConfig.resultLabel}</span>
                          <strong>{formatNumber(metaResultPreviewSummary.totalResults)}</strong>
                        </div>
                        <div className="monday-drilldown-stat glass-item">
                          <span>{activeMetaResultPreviewConfig.costLabel}</span>
                          <strong>{formatCurrency(metaResultPreviewSummary.averageCost)}</strong>
                        </div>
                        <div className="monday-drilldown-stat glass-item">
                          <span>Investimento</span>
                          <strong>{formatCurrency(metaResultPreviewSummary.totalSpend)}</strong>
                        </div>
                      </div>

                      {metaResultPreviewSeries.length ? (
                        <div className="canvas-wrapper meta-result-inline-chart-wrapper">
                          <Line data={metaResultPreviewChartData} options={metaResultPreviewChartOptions} />
                        </div>
                      ) : (
                        <div className="ranking-empty">Sem histórico suficiente para montar esse comparativo no período atual.</div>
                      )}
                    </div>
                  </div>

                </section>

                <section className="charts-section">
                  <div className="chart-container glass-panel main-chart">
                    <div className="chart-header chart-header-stack">
                      <div>
                        <h2>Evolução das métricas</h2>
                        <p className="chart-subtitle">Escolha as métricas que quer mostrar na apresentação desse cliente.</p>
                      </div>
                      <div className="chart-legend-custom">
                        <span className="legend-item">
                          <span className="dot" style={{ background: currentTheme.main, boxShadow: `0 0 8px ${currentTheme.main}` }}></span>
                          <select className="chart-metric-select" value={metric1} onChange={(event) => setMetric1(event.target.value)}>
                            {Object.entries(METRIC_OPTIONS).map(([key, metric]) => (
                              <option key={`metric-1-${key}`} value={key}>{metric.label}</option>
                            ))}
                          </select>
                        </span>
                        <span className="legend-item">
                          <span className="dot emerald"></span>
                          <select className="chart-metric-select" value={metric2} onChange={(event) => setMetric2(event.target.value)}>
                            {Object.entries(METRIC_OPTIONS).map(([key, metric]) => (
                              <option key={`metric-2-${key}`} value={key}>{metric.label}</option>
                            ))}
                          </select>
                        </span>
                      </div>
                    </div>
                    <div className="canvas-wrapper">
                      <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                  </div>

                  <div className="chart-container glass-panel secondary-chart">
                    <div className="chart-header chart-header-stack">
                      <div>
                        <h2>Distribuição de resultados</h2>
                        <p className="chart-subtitle">Leitura rápida do resultado da operação Meta desse cliente.</p>
                      </div>
                    </div>
                    <div className="canvas-wrapper donut-wrapper">
                      <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                    </div>
                  </div>
                </section>

                <section className="glass-panel funnel-section">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Funil de métricas</h2>
                      <p className="chart-subtitle">Arraste as métricas para montar a jornada manualmente. O sistema calcula a taxa de uma etapa para outra automaticamente.</p>
                    </div>
                  </div>

                  <div className="funnel-builder">
                    <div className="funnel-library">
                      <h3>Métricas disponíveis</h3>
                      <div className="funnel-chip-list">
                        {availableFunnelMetrics.map(([key, metric]) => (
                          <button
                            key={key}
                            type="button"
                            className="funnel-chip"
                            draggable
                            onDragStart={() => handleFunnelDragStart(key)}
                            onClick={() => replaceDraftFunnelSteps([...activeDraftFunnelSteps, key])}
                          >
                            <i className="bx bx-move"></i>
                            {metric.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="funnel-dropzone"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleFunnelDrop(activeDraftFunnelSteps.length)}
                    >
                      {funnelCards.length === 0 ? (
                        <div className="funnel-empty">
                          Arraste métricas para cá para montar o funil do cliente.
                        </div>
                      ) : (
                        <div className="funnel-steps">
                          {funnelCards.map((step, index) => (
                            <React.Fragment key={step.key}>
                              <div
                                className="funnel-step"
                                draggable
                                onDragStart={() => handleFunnelDragStart(step.key, index)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => handleFunnelDrop(index)}
                              >
                                <div className="funnel-step-head">
                                  <span className="funnel-step-label">{step.label}</span>
                                  <button type="button" className="funnel-remove" onClick={() => handleRemoveFunnelStep(step.key)}>
                                    Remover
                                  </button>
                                </div>
                                <strong>{step.formattedValue}</strong>
                              </div>

                              {index < funnelCards.length - 1 && (
                                <div className="funnel-connector">
                                  <span>{funnelCards[index + 1]?.conversionRate === null ? 'Sem base anterior' : `${funnelCards[index + 1]?.conversionRate.toFixed(2).replace('.', ',')}% de conversão`}</span>
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rankings-grid meta-rankings-stack">
                  <div className="glass-panel ranking-card meta-ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Mapa de estados e cidades</h2>
                        <p className="chart-subtitle">Camadas territoriais separadas pelo resultado ativo do topo do dashboard.</p>
                      </div>
                    </div>
                    <div className="geo-map-panel">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking de cidades...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : (breakdowns.errors?.states && breakdowns.errors?.cities && !metaRankingLayers.some((layer) => layer.map.stateItems.length || layer.map.cityItems.length)) ? (
                        <div className="ranking-empty">{breakdowns.errors.states || breakdowns.errors.cities}</div>
                      ) : !metaRankingLayers.some((layer) => layer.map.stateItems.length || layer.map.cityItems.length) ? (
                        <div className="ranking-empty">Sem dados geográficos suficientes para montar o mapa por resultado no período.</div>
                      ) : (
                        <div className="meta-ranking-layer-stack">
                          {metaRankingLayers.map((layer) => (
                            <div key={`geo-layer-${layer.resultKey}`} className="meta-ranking-layer-section">
                              <div className="meta-ranking-layer-head">
                                <h3>{layer.cities.title}</h3>
                                <p>{layer.cities.description}</p>
                              </div>
                              {(!layer.map.stateItems.length && !layer.map.cityItems.length) ? (
                                <div className="ranking-empty">{layer.cities.emptyMessage}</div>
                              ) : (
                                <div className="brazil-map-shell">
                                  <div
                                    className="brazil-map-stage"
                                    style={{
                                      '--client-accent-rgb': `${activeClientDashboardRgb.r}, ${activeClientDashboardRgb.g}, ${activeClientDashboardRgb.b}`,
                                    }}
                                  >
                                    <svg viewBox="0 0 140 145" className="brazil-map-silhouette" aria-hidden="true">
                                      <path d={BRAZIL_MAP_SILHOUETTE_PATH}></path>
                                    </svg>

                                    {layer.map.stateItems.map((item) => {
                                      const intensity = Math.max(0.22, (item.conversions || 0) / layer.map.maxConversions)
                                      return (
                                        <button
                                          key={`state-map-${layer.resultKey}-${item.uf}`}
                                          type="button"
                                          className={`brazil-state-node ${layer.map.topStateItem?.uf === item.uf ? 'is-top-performer' : ''}`}
                                          style={{
                                            left: `${item.x}%`,
                                            top: `${item.y}%`,
                                            '--state-intensity': intensity,
                                          }}
                                          title={`${item.name}: ${formatNumber(item.conversions)} ${layer.resultLabel} · ${formatCurrency(item.averageCost)} por resultado`}
                                        >
                                          <span>{item.uf}</span>
                                        </button>
                                      )
                                    })}

                                    {layer.map.cityItems.map((item, index) => {
                                      const cityIntensity = Math.max(0.28, (item.conversions || 0) / layer.map.maxConversions)
                                      return (
                                        <button
                                          key={`city-map-${layer.resultKey}-${item.label}-${index}`}
                                          type="button"
                                          className="brazil-city-node"
                                          style={{
                                            left: `${item.x}%`,
                                            top: `${item.y}%`,
                                            '--city-intensity': cityIntensity,
                                          }}
                                          title={`${item.label}: ${formatNumber(item.conversions)} ${layer.resultLabel} · ${formatCurrency(item.averageCost)} por resultado`}
                                          onClick={() => setMetaRankingDrilldown({ type: 'cities', item, resultKey: layer.resultKey })}
                                        >
                                          <span>{item.label}</span>
                                        </button>
                                      )
                                    })}
                                  </div>

                                  <div className="brazil-map-legend">
                                    <div className="brazil-map-legend-card glass-item">
                                      <strong>{`Top estados de ${layer.resultLabel}`}</strong>
                                      <div className="brazil-map-legend-list">
                                        {layer.map.topStateItems.length ? (
                                          layer.map.topStateItems.map((item) => (
                                            <div
                                              key={`state-legend-${layer.resultKey}-${item.uf}`}
                                              className={`brazil-map-legend-row ${layer.map.topStateItem?.uf === item.uf ? 'is-top-performer' : ''}`}
                                              style={layer.map.topStateItem?.uf === item.uf
                                                ? { '--client-accent-rgb': `${activeClientDashboardRgb.r}, ${activeClientDashboardRgb.g}, ${activeClientDashboardRgb.b}` }
                                                : undefined}
                                            >
                                              <span>{item.name}</span>
                                              <b>{formatNumber(item.conversions)}</b>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="ranking-inline-note">Sem leitura estadual disponível.</div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="brazil-map-legend-card glass-item">
                                      <strong>{layer.cities.title}</strong>
                                      <div className="brazil-map-legend-list">
                                        {layer.cities.items.length ? (
                                          layer.cities.items.map((item, index) => (
                                            <button
                                              key={`${layer.resultKey}-${item.label}-${index}`}
                                              type="button"
                                              className="brazil-map-legend-row brazil-map-legend-row-action"
                                              onClick={() => setMetaRankingDrilldown({ type: 'cities', item, resultKey: layer.resultKey })}
                                            >
                                              <span>{item.label}</span>
                                              <b>{formatNumber(item.conversions)}</b>
                                            </button>
                                          ))
                                        ) : (
                                          <div className="ranking-inline-note">Sem leitura territorial neste recorte.</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel ranking-card meta-ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Top 5 por criativos</h2>
                        <p className="chart-subtitle">Camadas de criativos separadas pelo tipo de resultado ativo no topo do dashboard.</p>
                      </div>
                    </div>
                    <div className="meta-ranking-layer-stack">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking de criativos...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : breakdowns.errors?.creatives ? (
                        <div className="ranking-empty">{breakdowns.errors.creatives}</div>
                      ) : !metaRankingLayers.some((layer) => layer.creatives.items.length) ? (
                        <div className="ranking-empty">Sem dados por criativo para os resultados ativos no período.</div>
                      ) : (
                        metaRankingLayers.map((layer) => (
                          <div key={`creatives-layer-${layer.resultKey}`} className="meta-ranking-layer-section">
                            <div className="meta-ranking-layer-head">
                              <h3>{layer.creatives.title}</h3>
                              <p>{layer.creatives.description}</p>
                            </div>
                            <div className="ranking-list">
                              {layer.creatives.items.length === 0 ? (
                                <div className="ranking-empty">{layer.creatives.emptyMessage}</div>
                              ) : (
                                layer.creatives.items.map((item, index) => (
                                  <button
                                    key={`${layer.resultKey}-${item.label}-${index}`}
                                    type="button"
                                    className="ranking-row ranking-row-action ranking-row-rich meta-ranking-row meta-ranking-row-rich"
                                    onClick={() => setMetaRankingDrilldown({ type: 'creatives', item, resultKey: layer.resultKey })}
                                  >
                                    <div className="creative-ranking-main">
                                      <div className="creative-thumb">
                                        {item.imageUrl ? (
                                          <img src={item.imageUrl} alt={item.label} />
                                        ) : (
                                          <span>Sem imagem</span>
                                        )}
                                      </div>
                                      <div className="ranking-main-column meta-ranking-main-column">
                                        <strong>{item.label}</strong>
                                        <span>{formatNumber(item.conversions)} {layer.resultLabel}</span>
                                      </div>
                                    </div>
                                    <div className="ranking-metrics meta-ranking-metrics">
                                      <b>{formatCurrency(item.averageCost)} / resultado</b>
                                      <span>{formatCurrency(item.spend)} investidos</span>
                                      <small>Preview e comparativo</small>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="glass-panel ranking-card meta-ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Resultado por idade</h2>
                        <p className="chart-subtitle">Faixas etárias separadas pelo tipo de resultado ativo no topo do dashboard.</p>
                      </div>
                    </div>
                    <div className="meta-ranking-layer-stack">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking por idade...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : breakdowns.errors?.ages ? (
                        <div className="ranking-empty">{breakdowns.errors.ages}</div>
                      ) : !metaRankingLayers.some((layer) => layer.ages.items.length) ? (
                        <div className="ranking-empty">Sem dados por idade para os resultados ativos no período.</div>
                      ) : (
                        metaRankingLayers.map((layer) => (
                          <div key={`ages-layer-${layer.resultKey}`} className="meta-ranking-layer-section">
                            <div className="meta-ranking-layer-head">
                              <h3>{layer.ages.title}</h3>
                              <p>{layer.ages.description}</p>
                            </div>
                            <div className="ranking-list">
                              {layer.ages.items.length === 0 ? (
                                <div className="ranking-empty">{layer.ages.emptyMessage}</div>
                              ) : (
                                layer.ages.items.map((item, index) => (
                                  <button
                                    key={`${layer.resultKey}-${item.label}-${index}`}
                                    type="button"
                                    className="ranking-row ranking-row-action meta-ranking-row age-ranking-row"
                                    onClick={() => setMetaRankingDrilldown({ type: 'ages', item, resultKey: layer.resultKey })}
                                  >
                                    <div className="age-ranking-main">
                                      <div className="age-ranking-position">#{index + 1}</div>
                                      <div className="ranking-main-column age-ranking-copy">
                                        <div className="meta-ranking-main-column age-ranking-title-row">
                                          <strong>{item.label}</strong>
                                          <span>{formatNumber(item.conversions)} {layer.resultLabel}</span>
                                        </div>
                                        <div className="age-ranking-bar-track" aria-hidden="true">
                                          <span className="age-ranking-bar-fill" style={{ width: `${item.intensity * 100}%` }}></span>
                                        </div>
                                        <small className="age-ranking-tag">{item.performanceLabel}</small>
                                      </div>
                                    </div>
                                    <div className="ranking-metrics meta-ranking-metrics age-ranking-metrics">
                                      <b>{formatCurrency(item.averageCost)} / resultado</b>
                                      <span>{formatPercent(item.conversionRateValue)} de conversão</span>
                                      <small>Toque para comparar</small>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="campaigns-section glass-panel">
                  <div className="section-header section-header-stack section-header-with-action">
                    <div>
                      <h2>Campanhas do cliente ({filteredCampaigns.length})</h2>
                      <p className="chart-subtitle">Tabela pronta para reunião, com base na conta Meta vinculada a {activeClient.name}.</p>
                    </div>
                    <div className="campaigns-section-actions">
                      <div className="campaigns-toolbar-row">
                        {activeDraftDashboardTemplate && (
                          <div className="campaign-column-controls">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setIsCampaignColumnLibraryOpen((current) => !current)}
                            >
                              <i className="bx bx-columns"></i>
                              Editar colunas
                            </button>
                          </div>
                        )}
                        <div className="campaign-filters">
                          <div className="search-box">
                            <i className="bx bx-search"></i>
                            <input type="text" placeholder="Buscar campanha" value={campaignSearch} onChange={(event) => setCampaignSearch(event.target.value)} />
                          </div>
                          <div className="date-picker glass-item compact-filter">
                            <i className="bx bx-filter-alt"></i>
                            <select value={campaignStatusFilter} onChange={(event) => setCampaignStatusFilter(event.target.value)}>
                              <option value="all">Todos os status</option>
                              <option value="ACTIVE">Ativas</option>
                              <option value="PAUSED">Pausadas</option>
                              <option value="ARCHIVED">Arquivadas</option>
                            </select>
                          </div>
                          <div className="date-picker glass-item compact-filter">
                            <i className="bx bx-sort-down"></i>
                            <select value={campaignSortBy} onChange={(event) => setCampaignSortBy(event.target.value)}>
                              {campaignSortOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      {activeDraftDashboardTemplate && isCampaignColumnLibraryOpen && (
                        <div className="metric-library-panel glass-item campaign-column-library">
                          <div>
                            <strong>Colunas da tabela</strong>
                            <p>Escolha as métricas que devem aparecer na tabela de campanhas deste modelo.</p>
                          </div>
                          <div className="campaign-column-grid">
                            {Object.entries(META_CAMPAIGN_TABLE_COLUMN_OPTIONS).map(([columnKey, column]) => {
                              const isSelected = draftMetaCampaignTableColumnKeys.includes(columnKey)
                              return (
                                <button
                                  key={columnKey}
                                  type="button"
                                  className={`metric-library-chip campaign-column-chip ${isSelected ? 'active' : ''}`}
                                  onClick={() => handleToggleMetaCampaignTableColumn(columnKey)}
                                >
                                  <span>{column.label}</span>
                                  <small>{column.description}</small>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Campanha</th>
                          {selectedMetaCampaignTableColumns.map((column) => (
                            <th key={`campaign-header-${column.key}`}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCampaigns.length === 0 ? (
                          <tr>
                            <td colSpan={2 + selectedMetaCampaignTableColumns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                              Nenhuma campanha encontrada para esse filtro.
                            </td>
                          </tr>
                        ) : (
                          filteredCampaigns.map((campaign, index) => {
                            const campaignMetrics = extractMetaCampaignMetrics(campaign)
                            const campaignSpend = campaignMetrics.spend
                            const campaignPurchases = campaignMetrics.purchases
                            const campaignLeads = campaignMetrics.leads
                            const campaignMessages = campaignMetrics.messages
                            const campaignCostPerPurchase = campaignMetrics.cost_per_purchase
                            const campaignCostPerLead = campaignMetrics.cost_per_lead
                            const campaignCostPerMessage = campaignMetrics.cost_per_message
                            const campaignConversions = campaignMetrics.totalConversions
                            const campaignCpa = campaignMetrics.cpa
                            const campaignRoas = campaignMetrics.roas
                            const isActive = campaign.status === 'ACTIVE'

                            return (
                              <tr key={campaign.id || index}>
                                <td>
                                  <span className={`status-badge ${isActive ? 'status-active' : 'status-paused'}`}>
                                    {isActive ? 'Ativa' : 'Pausada'}
                                  </span>
                                </td>
                                <td className="campaign-name">{campaign.name}</td>
                                {selectedMetaCampaignTableColumns.map((column) => {
                                  if (column.key === 'totalConversions') {
                                    return (
                                      <td key={`${campaign.id || index}-${column.key}`}>
                                        <strong>{formatNumber(campaignConversions)}</strong>
                                        <br />
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                          {campaignPurchases} compras, {campaignLeads} leads, {campaignMessages} mensagens
                                        </span>
                                        <br />
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                          CPA {formatCurrency(campaignCostPerPurchase)} · CPL {formatCurrency(campaignCostPerLead)} · CPMsg {formatCurrency(campaignCostPerMessage)}
                                        </span>
                                      </td>
                                    )
                                  }

                                  const metricValue = getCampaignMetricValue(campaign, column.key)
                                  return (
                                    <td
                                      key={`${campaign.id || index}-${column.key}`}
                                      style={column.key === 'roas' && metricValue >= 3 ? { color: 'var(--accent-emerald)' } : undefined}
                                    >
                                      {formatCampaignMetricValue(column.key, metricValue)}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                  </section>
                )}

                {hasSheetsConfigured && (
                  <section className="source-section">
                    <div className="source-section-header">
                      <div className="source-section-badge" style={{ color: '#22c55e', borderColor: '#22c55e' }}>
                        <i className="bx bx-spreadsheet"></i>
                        <span>Google Sheets</span>
                      </div>
                      <p className="source-section-copy">Leitura personalizada da planilha vinculada a este cliente, transformando colunas em cards do dashboard.</p>
                    </div>

                    <section className="glass-panel grouped-results">
                      <div className="section-header section-header-stack section-header-with-action">
                        <div>
                          <h2>Resumo da planilha</h2>
                          <p className="chart-subtitle">
                            Cada linha da planilha é tratada como um registro. A coluna de status funciona como pipeline e as colunas numéricas podem virar cards extras.
                          </p>
                        </div>
                        {activeDraftDashboardTemplate && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setIsSheetsMetricLibraryOpen((current) => !current)}
                            disabled={!availableGoogleSheetsMetricOptions.length}
                          >
                            <i className="bx bx-plus"></i>
                            Adicionar métrica
                          </button>
                        )}
                      </div>

                      {googleSheetsDashboardMetricCards.length > 0
                        ? renderDashboardMetricGrid(googleSheetsDashboardMetricCards, 'sheets')
                        : defaultGoogleSheetsKpis.length > 0
                          ? renderFixedKpiGrid(defaultGoogleSheetsKpis)
                          : (
                            <div className="ranking-empty">
                              A planilha foi lida, mas ainda não encontramos colunas numéricas para transformar em cards.
                            </div>
                          )}

                      {isSheetsMetricLibraryOpen && (
                        <div className="metric-library-panel glass-item">
                          <div>
                            <strong>Métricas do Google Sheets</strong>
                            <p>Adicione contagem total de registros, etapas do status e colunas numéricas da planilha como cards do modelo atual.</p>
                          </div>
                          <div className="metric-library-list">
                            {availableGoogleSheetsMetricOptions.length > 0 ? (
                              availableGoogleSheetsMetricOptions.map(([metricKey, metric]) => (
                                <button
                                  key={metricKey}
                                  type="button"
                                  className="metric-library-chip"
                                  onClick={() => handleAddSheetsDashboardMetric(metricKey)}
                                >
                                  <span>{metric.label}</span>
                                  <small>{metric.description}</small>
                                </button>
                              ))
                            ) : (
                              <div className="metric-library-empty">Todas as colunas numéricas da planilha já estão visíveis neste modelo.</div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="glass-panel sheets-preview-card">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Preview da planilha</h2>
                            <p className="chart-subtitle">
                              {googleSheetsSummary?.totalRows
                                ? `${formatNumber(googleSheetsSummary.totalRows)} linha(s) lida(s) da planilha configurada para ${activeClient.name}.`
                                : 'Assim que a planilha responder, o preview aparece aqui.'}
                            </p>
                          </div>
                        </div>
                        {googleSheetsError ? (
                          <div className="settings-alert error">
                            {googleSheetsError}
                          </div>
                        ) : null}
                        {googleSheetsSummary?.statusSummary?.counts?.length > 0 && (
                          <div className="glass-item rd-diagnostic-panel">
                            <p className="meta-campaign-filter-note">
                              Pipeline da planilha pela coluna <b>{googleSheetsSummary.statusSummary.header}</b>.
                            </p>
                            <div className="pipeline-columns-grid">
                              {googleSheetsSummary.statusSummary.counts.map((status) => (
                                <div key={status.id} className="pipeline-column-card glass-item">
                                  <div>
                                    <strong>{status.label}</strong>
                                    <span>{formatNumber(status.count)} registro(s)</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {googleSheetsSummary?.previewRows?.length ? (
                          <div className="table-container">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  {(googleSheetsSummary.headers || []).map((header) => (
                                    <th key={header}>{header}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {googleSheetsSummary.previewRows.map((row) => (
                                  <tr key={row.id}>
                                    {row.cells.map((cell) => (
                                      <td key={cell.key}>{cell.value || '-'}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="ranking-empty">
                            Nenhuma linha de preview disponível. Verifique se a planilha tem cabeçalho e dados abaixo da linha informada.
                          </div>
                        )}
                      </div>
                    </section>
                  </section>
                )}


                {hasRdConfigured && (
                  <section className="source-section">
                    <div className="source-section-header">
                      <div className="source-section-badge" style={{ color: '#14b8a6', borderColor: '#14b8a6' }}>
                        <i className="bx bx-signal-5"></i>
                        <span>RD Station CRM</span>
                      </div>
                      <p className="source-section-copy">Em seguida, entram os indicadores comerciais e de CRM vinculados ao cliente.</p>
                    </div>
                  <section className="glass-panel grouped-results">
                      <div className="section-header section-header-stack section-header-with-action">
                        <div>
                          <h2>Resumo comercial</h2>
                          <p className="chart-subtitle">Os indicadores abaixo resumem o desempenho comercial identificado no RD Station para este cliente.</p>
                        </div>
                        {activeDraftDashboardTemplate && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setIsRdMetricLibraryOpen((current) => !current)}
                            disabled={!availableRdDashboardMetricOptions.length}
                          >
                            <i className="bx bx-plus"></i>
                            Adicionar métrica
                          </button>
                        )}
                      </div>

                      <div className="template-metrics-shell">
                        {!!rdSummary?.availableSources?.length && (
                          <div className="meta-campaign-filter-collapsible rd-source-filter-collapsible">
                            <button
                              type="button"
                              className={`meta-campaign-filter-trigger ${isRdSourceFilterOpen ? 'open' : ''}`}
                              onClick={() => setIsRdSourceFilterOpen((current) => !current)}
                            >
                              <div>
                                <h3>Filtrar por origem</h3>
                                <p>{rdLeadSourceFilterSummary}</p>
                              </div>
                              <span className="meta-campaign-filter-trigger-icon">
                                <i className={`bx ${isRdSourceFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                              </span>
                            </button>
                            {isRdSourceFilterOpen && (
                              <div className="rd-source-filter-bar rd-source-filter-inline">
                                <div>
                                  <p>Selecione as origens e UTMs que quer considerar na base das oportunidades, qualificação e conversão.</p>
                                </div>
                                <div className="rd-source-list">
                                  {rdSummary.availableSources.map((source) => (
                                    <label
                                      key={source}
                                      className={`result-filter-chip rd-source-list-item ${activeDraftRdLeadSources.includes(source) ? 'active' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={activeDraftRdLeadSources.includes(source)}
                                        onChange={() => handleRdLeadSourceToggle(source)}
                                      />
                                      <span>{source}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="crm-groups-grid">
                          <section className="crm-result-group">
                            <div className="result-group-head">
                              <h3>Qualificação e conversão</h3>
                              <p>Leitura da safra criada no período selecionado: oportunidades, qualificação, perdas e vendas da mesma base.</p>
                            </div>
                            {renderFixedKpiGrid(rdQualificationKpisWithTrend)}
                          </section>

                          <section className="crm-result-group">
                            <div className="result-group-head">
                              <h3>Fechamento e receita</h3>
                              <p>Leitura por data de fechamento de todas as negociações ganhas no período, incluindo safras criadas antes do intervalo selecionado.</p>
                            </div>
                            {renderFixedKpiGrid(rdRevenueKpisWithTrend)}
                          </section>

                          <section className="crm-result-group">
                            <div className="result-group-head">
                              <h3>Resultado final</h3>
                              <p>Consolidado final somando safras criadas no período e safras anteriores fechadas no mesmo intervalo.</p>
                            </div>
                            {renderFixedKpiGrid(rdFinalKpisWithTrend)}
                          </section>
                        </div>

                        {rdExtraDashboardMetricCards.length > 0 && renderDashboardMetricGrid(rdExtraDashboardMetricCards, 'rd')}

                        {isRdMetricLibraryOpen && (
                          <div className="metric-library-panel glass-item">
                            <div>
                              <strong>Métricas RD disponíveis</strong>
                              <p>Monte o painel comercial com qualquer card do CRM, mudando ordem e tamanho por modelo.</p>
                            </div>
                            <div className="metric-library-list">
                              {availableRdDashboardMetricOptions.length > 0 ? (
                                availableRdDashboardMetricOptions.map(([metricKey, metric]) => (
                                  <button
                                    key={metricKey}
                                    type="button"
                                    className="metric-library-chip"
                                    onClick={() => handleAddRdDashboardMetric(metricKey)}
                                  >
                                    <span>{metric.label}</span>
                                    <small>{metric.description}</small>
                                  </button>
                                ))
                              ) : (
                                <div className="metric-library-empty">Todas as métricas do RD já estão visíveis neste modelo.</div>
                              )}
                            </div>
                          </div>
                        )}

                        {rdSummary?.diagnostics && (
                          <div className="meta-campaign-filter-collapsible rd-diagnostics-collapsible">
                            <button
                              type="button"
                              className={`meta-campaign-filter-trigger ${isRdDiagnosticsOpen ? 'open' : ''}`}
                              onClick={() => setIsRdDiagnosticsOpen((current) => !current)}
                            >
                              <div>
                                <h3>Como as negociações estão sendo filtradas</h3>
                                <p>{rdDiagnosticsSummary}</p>
                              </div>
                              <span className="meta-campaign-filter-trigger-icon">
                                <i className={`bx ${isRdDiagnosticsOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                              </span>
                            </button>
                            {isRdDiagnosticsOpen && (
                              <div className="rd-source-filter-bar rd-source-filter-inline rd-diagnostic-panel">
                                <p className="meta-campaign-filter-note">
                                  Esses números mostram em que etapa as negociações do RD estão sendo reduzidas antes de entrar nos cards finais.
                                </p>
                                <div className="rd-diagnostic-grid">
                                  <div className="conversion-stat">
                                    <span>Negociações recebidas do RD</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.allDeals?.totalDeals || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Negociações após o funil atual</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.pipelineDeals?.totalDeals || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas reconhecidas em todos os vendedores</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.allDeals?.wonClassified || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas no período após o funil atual</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.pipelineDeals?.wonClosedInRange || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas fechadas no período em todos os vendedores</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.allDeals?.wonClosedInRange || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas fechadas no período após filtro atual</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonClosedInRange || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas fora do período</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonClosedOutOfRange || 0)}</strong>
                                  </div>
                                  <div className="conversion-stat">
                                    <span>Ganhas sem data de fechamento</span>
                                    <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonWithoutCloseDate || 0)}</strong>
                                  </div>
                                </div>
                                <div className="rd-diagnostic-meta">
                                  <span>Filtro de funil: <b>{rdSummary.diagnostics.pipelineFilterApplied ? rdAppliedPipelineSummary : 'Todos os funis'}</b></span>
                                  <span>Filtro de vendedor: <b>{rdSummary.diagnostics.sellerFilterApplied ? 'Aplicado' : 'Todos os vendedores'}</b></span>
                                  <span>Filtro de origem: <b>{rdSummary.diagnostics.leadSourceFilterApplied ? 'Aplicado' : 'Nao afeta este bloco'}</b></span>
                                  <span>Filtro de etapas qualificadas: <b>{rdSummary.diagnostics.qualifiedStageFilterApplied ? 'Aplicado' : 'Nao afeta este bloco'}</b></span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </section>

                    {!!rdSummary?.sellerRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Destaque por vendedor</h2>
                            <p className="chart-subtitle">Ranking com base em receita ganha e negócios fechados na operação comercial.</p>
                          </div>
                        </div>

                        <div className="ranking-list">
                          {rdSummary.sellerRanking.map((seller) => (
                            <div key={seller.id} className="ranking-row">
                              <div>
                                <strong>{seller.name}</strong>
                                <span>
                                  {formatNumber(seller.wonDeals)} ganhos, {formatNumber(seller.openDeals)} em aberto, {formatNumber(seller.lostDeals)} perdidos
                                </span>
                              </div>
                              <b>{formatCurrency(seller.wonRevenue)}</b>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {!!rdSummary?.stageRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Colunas do pipeline</h2>
                            <p className="chart-subtitle">Quantidade de cards e valor por coluna do pipeline dentro do período selecionado.</p>
                          </div>
                        </div>

                        <div className="pipeline-columns-grid">
                          {rdSummary.stageRanking.map((stage) => (
                            <div key={stage.label} className="pipeline-column-card glass-item">
                              <div>
                                <strong>{stage.label}</strong>
                                <span>{formatNumber(stage.deals || 0)} card(s)</span>
                              </div>
                              <div className="pipeline-column-metrics">
                                <div>
                                  <small>Valor na coluna</small>
                                  <b>{formatCurrency(stage.totalValue || 0)}</b>
                                </div>
                                <div>
                                  <small>Em aberto</small>
                                  <span>{formatNumber(stage.openDeals || 0)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}
        {activeTab === 'apresentacao' && hasPendingDashboardFilters && (
          <button
            type="button"
            className="floating-filter-apply"
            onClick={handleApplyDashboardFilters}
            disabled={isApplyDashboardFiltersDisabled}
          >
            Aplicar filtro
          </button>
        )}

        {activeTab === 'apresentacao' && isAiInsightsModalOpen && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay" onClick={() => setIsAiInsightsModalOpen(false)}>
            <div className="modal-card glass-panel ai-insights-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Insights da dashboard</h3>
                  <p>Análise resumida dos números ativos da apresentação, usando a configuração da aba IA.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setIsAiInsightsModalOpen(false)} aria-label="Fechar insights da dashboard">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              {isAiInsightsLoading ? (
                <div className="glass-item ai-insights-state">
                  <i className="bx bx-loader-alt bx-spin"></i>
                  <strong>Gerando insights...</strong>
                  <p>A IA está analisando os números do dashboard com base no período e nos filtros ativos.</p>
                </div>
              ) : aiInsightsError ? (
                <div className="glass-item ai-insights-state ai-insights-state-error">
                  <i className="bx bx-error-circle"></i>
                  <strong>Não foi possível gerar insights agora.</strong>
                  <p>{aiInsightsError}</p>
                </div>
              ) : aiInsightsResult?.structured ? (
                <>
                  <div className="glass-item ai-insights-summary-shell">
                    <div className="ai-insights-summary-hero">
                      <div className="ai-insights-summary-copy">
                        <span className="ai-insights-kicker">Leitura executiva</span>
                        <strong className="ai-insights-headline">{aiStructuredHeadline}</strong>
                        <p className="ai-insights-summary">
                          {aiStructuredSummary || 'A IA respondeu com um formato parcial. Ajuste o prompt JSON para separar headline, resumo, insights e próximos passos.'}
                        </p>
                      </div>
                      <div className="ai-insights-context ai-insights-context-hero">
                        <span>{aiInsightsDateLabel}</span>
                        <span>{aiInsightsFilterLabel}</span>
                        <span>{aiInsightsResult.provider || globalIntegrations.aiProvider || 'IA configurada'} · {aiInsightsResult.model || globalIntegrations.aiModel || 'modelo não informado'}</span>
                      </div>
                    </div>
                    {aiHasStructuredResponse ? (
                      <div className="ai-insights-highlight-grid">
                        {aiHighlights.map((item) => (
                          <div key={item.label} className={`ai-insights-highlight-card ai-insights-highlight-${item.tone}`}>
                            <small>{item.label}</small>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ai-insights-fallback-banner">
                        <span className="ai-insight-chip">Leitura livre</span>
                        <p>A resposta veio mais narrativa do que estruturada. Organizamos abaixo os principais pontos já identificados no resumo.</p>
                      </div>
                    )}
                  </div>

                  {aiInsightGroups.length ? (
                    <div className="ai-insights-sections">
                      {aiInsightGroups.map((group) => (
                        <section key={group.key} className="ai-insights-section">
                          <div className="ai-insights-section-head">
                            <div className="ai-insights-section-title-wrap">
                              <span className={`ai-insight-chip ai-insight-chip-${group.key}`}>{group.title}</span>
                              <strong>{group.title}</strong>
                            </div>
                            <small>{group.items.length} leitura(s)</small>
                          </div>
                          <div className="ai-insights-grid">
                            {group.items.map((item, index) => {
                              const typeKey = String(item.type || 'insight').trim().toLowerCase()
                              const typeLabel = AI_INSIGHT_TYPE_LABELS[typeKey] || 'Insight'

                              return (
                                <div key={`${group.key}-${index}`} className="glass-item ai-insight-card">
                                  <div className="ai-insight-card-head">
                                    <span className={`ai-insight-chip ai-insight-chip-${typeKey}`}>{typeLabel}</span>
                                    <span className="ai-insight-index">{String(index + 1).padStart(2, '0')}</span>
                                  </div>
                                  <strong>{item.title || 'Leitura do período'}</strong>
                                  {item.evidence ? (
                                    <div className="ai-insight-block">
                                      <small>Evidência</small>
                                      <p>{item.evidence}</p>
                                    </div>
                                  ) : null}
                                  {item.action ? (
                                    <div className="ai-insight-block ai-insight-block-action">
                                      <small>Ação sugerida</small>
                                      <p className="ai-insight-action">{item.action}</p>
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : aiFallbackTakeaways.length ? (
                    <div className="ai-insights-sections">
                      <section className="ai-insights-section">
                        <div className="ai-insights-section-head">
                          <div className="ai-insights-section-title-wrap">
                            <span className="ai-insight-chip">Leitura guiada</span>
                            <strong>Principais pontos do resumo</strong>
                          </div>
                          <small>{aiFallbackTakeaways.length} bloco(s)</small>
                        </div>
                        <div className="ai-insights-grid ai-insights-grid-fallback">
                          {aiFallbackTakeaways.map((item, index) => (
                            <div key={`${item.title}-${index}`} className="glass-item ai-insight-card ai-insight-card-fallback">
                              <div className="ai-insight-card-head">
                                <span className="ai-insight-chip ai-insight-chip-insight">{item.title}</span>
                                <span className="ai-insight-index">{String(index + 1).padStart(2, '0')}</span>
                              </div>
                              <p>{item.text}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div className="glass-item ai-insight-card ai-insight-card-empty">
                      <span className="ai-insight-chip">Formato livre</span>
                      <strong>Sem cards estruturados neste retorno</strong>
                      <p>O provider respondeu, mas não separou a análise em blocos de oportunidade, alerta ou anomalia.</p>
                    </div>
                  )}

                  {aiCampaignAnalyses.length ? (
                    <div className="ai-insights-sections">
                      <section className="ai-insights-section">
                        <div className="ai-insights-section-head">
                          <div className="ai-insights-section-title-wrap">
                            <span className="ai-insight-chip">Campanhas</span>
                            <strong>Leitura por campanha</strong>
                          </div>
                          <small>{aiCampaignAnalyses.length} campanha(s)</small>
                        </div>
                        <div className="ai-insights-grid">
                          {aiCampaignAnalyses.map((item, index) => (
                            <div key={`${item.campaignName}-${index}`} className="glass-item ai-insight-card">
                              <div className="ai-insight-card-head">
                                <span className={`ai-insight-chip ai-insight-chip-${item.status || 'attention'}`}>
                                  {AI_CAMPAIGN_STATUS_LABELS[item.status] || 'Atenção'}
                                </span>
                                <span className="ai-insight-index">{String(index + 1).padStart(2, '0')}</span>
                              </div>
                              <strong>{item.campaignName}</strong>
                              {item.summary ? (
                                <div className="ai-insight-block">
                                  <small>Leitura</small>
                                  <p>{item.summary}</p>
                                </div>
                              ) : null}
                              {item.evidence ? (
                                <div className="ai-insight-block">
                                  <small>Evidência</small>
                                  <p>{item.evidence}</p>
                                </div>
                              ) : null}
                              {item.action ? (
                                <div className="ai-insight-block ai-insight-block-action">
                                  <small>Ação sugerida</small>
                                  <p className="ai-insight-action">{item.action}</p>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {aiFocusGroups.length ? (
                    <div className="ai-insights-sections">
                      <section className="ai-insights-section">
                        <div className="ai-insights-section-head">
                          <div className="ai-insights-section-title-wrap">
                            <span className="ai-insight-chip">Síntese final</span>
                            <strong>Positivos, atenção e urgência</strong>
                          </div>
                          <small>{aiFocusGroups.reduce((total, group) => total + group.items.length, 0)} ponto(s)</small>
                        </div>
                        <div className="ai-insights-grid">
                          {aiFocusGroups.map((group) => (
                            <div key={group.key} className="glass-item ai-insight-card ai-insight-card-focus">
                              <div className="ai-insight-card-head">
                                <span className={`ai-insight-chip ai-insight-chip-${group.tone}`}>{group.title}</span>
                              </div>
                              <ul className="ai-insight-bullet-list">
                                {group.items.map((item, index) => (
                                  <li key={`${group.key}-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {aiHasNextActions ? (
                    <div className="glass-item ai-insights-actions-shell">
                      <div className="ai-insights-actions-head">
                        <div>
                          <span className="ai-insights-kicker">Próximos passos</span>
                          <strong className="ai-insights-section-title">Ações recomendadas pela IA</strong>
                        </div>
                        <span className="ai-insights-actions-badge">
                          {(aiInsightsResult.structured.nextActions || []).length} item(ns)
                        </span>
                      </div>
                      <ul className="ai-insights-actions-list">
                        {aiInsightsResult.structured.nextActions.map((item, index) => (
                          <li key={`${item}-${index}`}>
                            <span className="ai-insights-actions-step">{index + 1}</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="ai-insights-meta">
                    <span>Provider: {aiInsightsResult.provider || globalIntegrations.aiProvider || 'IA configurada'}</span>
                    <span>Modelo: {aiInsightsResult.model || globalIntegrations.aiModel || 'não informado'}</span>
                  </div>
                </>
              ) : (
                <div className="glass-item ai-insights-state">
                  <i className="bx bx-bulb"></i>
                  <strong>Pronto para analisar</strong>
                  <p>Clique em <strong>Insights</strong> no topo da dashboard para gerar uma leitura guiada dos números ativos.</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {metaSecondaryResultDrilldown && activeMetaSecondaryResultGroup && activeMetaSecondaryResultInsights && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay" onClick={() => setMetaSecondaryResultDrilldown(null)}>
            <div className="modal-card glass-panel meta-secondary-result-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Conversões extras de {activeMetaSecondaryResultGroup.title.toLowerCase()}</h3>
                  <p>Leitura informativa das campanhas desse objetivo no período atual. Esses números não entram no card principal e não puxam gasto adicional.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setMetaSecondaryResultDrilldown(null)} aria-label="Fechar conversões extras">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <div className="meta-secondary-result-summary glass-item">
                <strong>{formatNumber(activeMetaSecondaryResultInsights.campaignCount)}</strong>
                <span>campanha(s) desse objetivo no recorte selecionado</span>
              </div>

              {activeMetaSecondaryResultInsights.items.length ? (
                <div className="meta-secondary-result-list">
                  {activeMetaSecondaryResultInsights.items.map((item) => (
                    <div key={`${activeMetaSecondaryResultGroup.key}-${item.key}`} className="meta-secondary-result-item glass-item">
                      <div>
                        <strong>{item.label}</strong>
                        <span>Resultado paralelo gerado por campanhas de {activeMetaSecondaryResultGroup.title.toLowerCase()}</span>
                      </div>
                      <b>{formatNumber(item.value)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ranking-empty">Nenhum resultado extra apareceu nesse grupo no período selecionado.</div>
              )}
            </div>
          </div>,
          document.body
        )}

        {metaResultDrilldown && activeMetaResultDrilldownConfig && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay meta-result-overlay" onClick={() => setMetaResultDrilldown(null)}>
            <div className="modal-card modal-card-wide glass-panel meta-result-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{activeMetaResultDrilldownConfig.title}</h3>
                  <p>{activeMetaResultDrilldownConfig.description}</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setMetaResultDrilldown(null)} aria-label="Fechar comparativo de resultado">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <div className="meta-result-toolbar">
                <div className="meta-result-periods">
                  {META_RESULT_PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`meta-result-period-btn ${metaResultGrouping === option.value ? 'active' : ''}`}
                      onClick={() => setMetaResultGrouping(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="meta-result-toolbar-note">
                  Agrupando por {META_RESULT_PERIOD_OPTIONS.find((option) => option.value === metaResultGrouping)?.label.toLowerCase() || 'semana'}.
                </span>
              </div>

              {metaResultComparisonSummary ? (
                <div className="meta-result-summary">
                  <div className="monday-drilldown-stat glass-item">
                    <span>{activeMetaResultDrilldownConfig.resultLabel}</span>
                    <strong>{formatNumber(metaResultComparisonSummary.totalResults)}</strong>
                  </div>
                  <div className="monday-drilldown-stat glass-item">
                    <span>{activeMetaResultDrilldownConfig.costLabel}</span>
                    <strong>{formatCurrency(metaResultComparisonSummary.averageCost)}</strong>
                  </div>
                  <div className="monday-drilldown-stat glass-item">
                    <span>Investimento</span>
                    <strong>{formatCurrency(metaResultComparisonSummary.totalSpend)}</strong>
                  </div>
                </div>
              ) : null}

              {metaResultComparisonSeries.length ? (
                <div className="glass-item meta-result-chart-shell">
                  <div className="meta-result-chart-head">
                    <div className="meta-result-legend">
                      <span className="legend-item">
                        <span className="dot" style={{ background: activeMetaResultDrilldownConfig.resultTone, boxShadow: `0 0 8px ${activeMetaResultDrilldownConfig.resultTone}` }}></span>
                        {activeMetaResultDrilldownConfig.resultLabel}
                      </span>
                      <span className="legend-item">
                        <span className="dot" style={{ background: activeMetaResultDrilldownConfig.costTone, boxShadow: `0 0 8px ${activeMetaResultDrilldownConfig.costTone}` }}></span>
                        {activeMetaResultDrilldownConfig.costLabel}
                      </span>
                    </div>
                  </div>
                  <div className="canvas-wrapper meta-result-chart-wrapper">
                    <Line data={metaResultComparisonChartData} options={metaResultComparisonChartOptions} />
                  </div>
                </div>
              ) : (
                <div className="ranking-empty">Sem histórico suficiente para montar esse comparativo no período atual.</div>
              )}
            </div>
          </div>,
          document.body
        )}

        {metaRankingDrilldown && activeMetaRankingDrilldownConfig && activeMetaRankingDrilldownItem && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay meta-ranking-overlay" onClick={() => setMetaRankingDrilldown(null)}>
            <div className="modal-card modal-card-wide glass-panel meta-ranking-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{activeMetaRankingDrilldownConfig.title}</h3>
                  <p>{activeMetaRankingDrilldownConfig.detailDescription}</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setMetaRankingDrilldown(null)} aria-label="Fechar detalhamento do ranking">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <div className={`meta-ranking-body ${isCreativeRankingDrilldown ? 'meta-ranking-body-creative' : ''}`}>
                {isCreativeRankingDrilldown ? (
                  <div className="meta-ranking-creative-main">
                    <div className="glass-item meta-ranking-chart-shell meta-ranking-period-shell">
                      <div className="meta-result-chart-head">
                        <div>
                          <strong>Resultado no período selecionado</strong>
                          <p className="chart-subtitle">Leitura isolada do criativo com base no filtro atual, sem comparar com os demais itens do ranking.</p>
                        </div>
                      </div>
                      {metaRankingDrilldownSummary ? (
                        <div className="meta-ranking-period-grid">
                          <div className="conversion-stat">
                            <span>{activeMetaRankingDrilldownConfig.resultLabel}</span>
                            <strong>{formatNumber(metaRankingDrilldownSummary.conversions)}</strong>
                          </div>
                          <div className="conversion-stat">
                            <span>{activeMetaRankingDrilldownConfig.costLabel}</span>
                            <strong>{formatCurrency(metaRankingDrilldownSummary.avgCost)}</strong>
                          </div>
                          <div className="conversion-stat">
                            <span>Investimento</span>
                            <strong>{formatCurrency(metaRankingDrilldownSummary.spendValue)}</strong>
                          </div>
                          <div className="conversion-stat">
                            <span>Cliques</span>
                            <strong>{formatNumber(metaRankingDrilldownSummary.clicksValue)}</strong>
                          </div>
                          <div className="conversion-stat">
                            <span>Impressões</span>
                            <strong>{formatNumber(metaRankingDrilldownSummary.impressionsValue)}</strong>
                          </div>
                          <div className="conversion-stat">
                            <span>Taxa de conversão</span>
                            <strong>{formatPercent(metaRankingDrilldownSummary.conversionRateValue)}</strong>
                          </div>
                        </div>
                      ) : (
                        <div className="ranking-empty">Sem base suficiente para montar a leitura desse criativo no período.</div>
                      )}
                      <div className="meta-ranking-inline-note">
                        <strong>{formatCurrency(activeMetaRankingDrilldownItem.spend || 0)}</strong> investidos para gerar{' '}
                        <strong>{formatNumber(getMetaBreakdownResultValue(activeMetaRankingDrilldownItem, activeMetaRankingDrilldownConfig?.resultMetricKey))}</strong> {activeMetaRankingDrilldownConfig?.resultLabel?.toLowerCase() || 'resultados'} nesse criativo
                        {metaRankingDrilldownSummary?.impressionsValue
                          ? `, com ${formatNumber(metaRankingDrilldownSummary.impressionsValue)} impressões dentro do recorte selecionado.`
                          : ' dentro do recorte selecionado.'}
                      </div>
                    </div>

                    <div className="glass-item meta-ranking-chart-shell">
                      <div className="meta-result-chart-head">
                        <div>
                          <strong>Resultado diario do criativo</strong>
                          <p className="chart-subtitle">Eixo X por dia, com conversoes e custo por conversao do proprio criativo dentro do periodo filtrado.</p>
                        </div>
                        <div className="meta-result-legend">
                          <span className="legend-item">
                            <span className="dot" style={{ background: activeMetaRankingDrilldownConfig.resultTone, boxShadow: `0 0 8px ${activeMetaRankingDrilldownConfig.resultTone}` }}></span>
                            Conversões
                          </span>
                          <span className="legend-item">
                            <span className="dot" style={{ background: activeMetaRankingDrilldownConfig.costTone, boxShadow: `0 0 8px ${activeMetaRankingDrilldownConfig.costTone}` }}></span>
                            Custo por conversão
                          </span>
                        </div>
                      </div>
                      {metaRankingDetailDailyLoading ? (
                        <div className="ranking-empty">Carregando evolução diária do criativo...</div>
                      ) : metaRankingDetailDailyError ? (
                        <div className="ranking-empty">{metaRankingDetailDailyError}</div>
                      ) : metaRankingComparisonChartData ? (
                        <div className="canvas-wrapper meta-ranking-chart-wrapper">
                          <Bar data={metaRankingComparisonChartData} options={metaRankingComparisonChartOptions} />
                        </div>
                      ) : (
                        <div className="ranking-empty">Sem histórico diário suficiente para montar a evolução desse criativo.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="glass-item meta-ranking-chart-shell">
                    <div className="meta-result-chart-head">
                      <div>
                        <strong>Evolução diária do item selecionado</strong>
                        <p className="chart-subtitle">Eixo X por dia, com volume de resultados e custo por resultado do item escolhido dentro do período filtrado.</p>
                      </div>
                      <div className="meta-result-legend">
                        <span className="legend-item">
                          <span className="dot" style={{ background: activeMetaRankingDrilldownConfig.resultTone, boxShadow: `0 0 8px ${activeMetaRankingDrilldownConfig.resultTone}` }}></span>
                          {activeMetaRankingDrilldownConfig.resultLabel}
                        </span>
                        <span className="legend-item">
                          <span className="dot" style={{ background: activeMetaRankingDrilldownConfig.costTone, boxShadow: `0 0 8px ${activeMetaRankingDrilldownConfig.costTone}` }}></span>
                          {activeMetaRankingDrilldownConfig.costLabel}
                        </span>
                      </div>
                    </div>
                    {metaRankingDetailDailyLoading ? (
                      <div className="ranking-empty">Carregando evolução diária do item selecionado...</div>
                    ) : metaRankingDetailDailyError ? (
                      <div className="ranking-empty">{metaRankingDetailDailyError}</div>
                    ) : metaRankingComparisonChartData ? (
                      <div className="canvas-wrapper meta-ranking-chart-wrapper">
                        <Bar data={metaRankingComparisonChartData} options={metaRankingComparisonChartOptions} />
                      </div>
                    ) : (
                      <div className="ranking-empty">Sem histórico diário suficiente para montar a evolução desse item.</div>
                    )}
                  </div>
                )}

                <div className="glass-item meta-ranking-detail-panel">
                  <div className="meta-ranking-detail-head">
                    <span className="meta-ranking-detail-kicker">{activeMetaRankingDrilldownConfig.previewKicker}</span>
                    <h4>{activeMetaRankingDrilldownItem.label}</h4>
                    <p>{isCreativeRankingDrilldown ? 'Visual da peca com a melhor imagem disponivel retornada pela Meta para esse criativo.' : activeMetaRankingDrilldownConfig.description}</p>
                  </div>

                  {metaRankingDrilldown.type === 'creatives' ? (
                    <div className="meta-ranking-preview-frame">
                      {activeMetaRankingDrilldownItem.previewHtml ? (
                        <iframe
                          title={`Preview de ${activeMetaRankingDrilldownItem.label}`}
                          srcDoc={activeMetaRankingDrilldownItem.previewHtml}
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        />
                      ) : activeMetaRankingDrilldownItem.imageUrl ? (
                        <img src={activeMetaRankingDrilldownItem.imageUrl} alt={activeMetaRankingDrilldownItem.label} />
                      ) : (
                        <div className="meta-ranking-preview-fallback">
                          <i className="bx bx-image-alt"></i>
                          <span>Preview indisponível</span>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {metaRankingDrilldownSummary && !isCreativeRankingDrilldown ? (
                    <div className="meta-ranking-detail-stats">
                      <div className="conversion-stat">
                        <span>{activeMetaRankingDrilldownConfig.resultLabel}</span>
                        <strong>{formatNumber(metaRankingDrilldownSummary.conversions)}</strong>
                      </div>
                      <div className="conversion-stat">
                        <span>{activeMetaRankingDrilldownConfig.costLabel}</span>
                        <strong>{formatCurrency(metaRankingDrilldownSummary.avgCost)}</strong>
                      </div>
                      <div className="conversion-stat">
                        <span>Cliques</span>
                        <strong>{formatNumber(metaRankingDrilldownSummary.clicksValue)}</strong>
                      </div>
                      <div className="conversion-stat">
                        <span>Taxa de conversão</span>
                        <strong>{formatPercent(metaRankingDrilldownSummary.conversionRateValue)}</strong>
                      </div>
                    </div>
                  ) : null}

                  {!isCreativeRankingDrilldown ? (
                    <div className="meta-ranking-inline-note">
                      <strong>{formatCurrency(activeMetaRankingDrilldownItem.spend || 0)}</strong> investidos para gerar{' '}
                      <strong>{formatNumber(getMetaBreakdownResultValue(activeMetaRankingDrilldownItem, activeMetaRankingDrilldownConfig?.resultMetricKey))}</strong> {activeMetaRankingDrilldownConfig?.resultLabel?.toLowerCase() || 'resultados'} nesse item.
                      {metaRankingDrilldownSummary?.impressionsValue
                        ? ` Foram ${formatNumber(metaRankingDrilldownSummary.impressionsValue)} impressões no período analisado.`
                        : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {mondayMetricDrilldown && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay monday-drilldown-overlay" onClick={() => setMondayMetricDrilldown(null)}>
            <div className="modal-card glass-panel monday-drilldown-popup" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>{mondayMetricDrilldown.title}</h3>
                  <p>{mondayMetricDrilldown.description}</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setMondayMetricDrilldown(null)} aria-label="Fechar detalhamento do Monday">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              {mondayMetricDrilldown.items?.length ? (
                <div className="monday-drilldown-body">
                  <div className="monday-drilldown-summary">
                    <div className="monday-drilldown-stat glass-item">
                      <span>Demandas</span>
                      <strong>{formatNumber(mondayMetricDrilldown.items.length)}</strong>
                    </div>
                    <div className="monday-drilldown-stat glass-item">
                      <span>Atrasadas</span>
                      <strong>{formatNumber(mondayMetricDrilldown.items.filter((task) => task.isOverdue).length)}</strong>
                    </div>
                    <div className="monday-drilldown-stat glass-item">
                      <span>Bloqueadas</span>
                      <strong>{formatNumber(mondayMetricDrilldown.items.filter((task) => task.isBlocked).length)}</strong>
                    </div>
                    <div className="monday-drilldown-stat glass-item">
                      <span>Sem responsável</span>
                      <strong>{formatNumber(mondayMetricDrilldown.items.filter((task) => task.isUnassigned).length)}</strong>
                    </div>
                  </div>

                  <div className="monday-drilldown-mode glass-item">
                    {mondayOwnerFilter === 'all'
                      ? 'Agrupado por responsável para facilitar cobrança, priorização e tomada de decisão por pessoa.'
                      : `Lista priorizada para ${selectedMondayOwnerLabel}, ordenada por urgência e tempo de atraso.`}
                  </div>

                  <div className="monday-user-groups">
                    {mondayDrilldownOwnerGroups.map((group) => (
                      (() => {
                        const isExpanded = Boolean(expandedMondayGroups[group.key])
                        const previewTasks = group.items.slice(0, 3)
                        const topTask = group.items[0] || null

                        return (
                          <section key={group.key} className={`monday-user-group glass-item ${isExpanded ? 'monday-user-group-expanded' : 'monday-user-group-collapsed'}`}>
                            <button
                              type="button"
                              className="monday-user-group-toggle"
                              onClick={() => setExpandedMondayGroups((current) => ({
                                ...current,
                                [group.key]: !current[group.key],
                              }))}
                              aria-expanded={isExpanded}
                            >
                              <div className="monday-user-group-head">
                                <div>
                                  <h4>{group.owner}</h4>
                                  <p>{formatNumber(group.items.length)} demanda(s) dessa métrica em ordem da mais urgente/atrasada para a menos crítica.</p>
                                </div>
                                <div className="monday-user-group-metrics">
                                  <div className="monday-user-group-metric">
                                    <span>Atrasadas</span>
                                    <strong>{formatNumber(group.overdueCount)}</strong>
                                  </div>
                                  <div className="monday-user-group-metric">
                                    <span>Bloqueadas</span>
                                    <strong>{formatNumber(group.blockedCount)}</strong>
                                  </div>
                                  <div className="monday-user-group-metric">
                                    <span>Vencem logo</span>
                                    <strong>{formatNumber(group.dueSoonCount)}</strong>
                                  </div>
                                </div>
                              </div>

                              <div className="monday-user-group-summary">
                                <div className="monday-user-group-summary-copy">
                                  <span>
                                    {topTask
                                      ? `Mais crítica agora: ${topTask.name}${topTask.daysOverdue ? ` · ${formatNumber(topTask.daysOverdue)} dia(s) de atraso` : topTask.isDueSoon ? ' · vence logo' : ''}`
                                      : 'Sem demanda prioritária no recorte.'}
                                  </span>
                                  {previewTasks.length ? (
                                    <div className="monday-user-group-preview">
                                      {previewTasks.map((task) => (
                                        <span key={`${group.key}-preview-${task.id}`} className="monday-user-group-preview-item">
                                          {task.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <span className="monday-user-group-action">
                                  {isExpanded ? 'Fechar tarefas' : 'Ver tarefas'}
                                  <i className={`bx ${isExpanded ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                                </span>
                              </div>
                            </button>

                            {isExpanded ? (
                              <div className="monday-user-table-wrap">
                                <table className="monday-user-task-table">
                                  <thead>
                                    <tr>
                                      <th>Demanda</th>
                                      <th>Urgência</th>
                                      <th>Status</th>
                                      <th>Prazo</th>
                                      <th>Atraso</th>
                                      <th>Tempo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.items.map((task) => {
                                      const urgency = getMondayTaskUrgency(task)

                                      return (
                                        <tr key={`${group.key}-${task.id}`}>
                                          <td className="monday-user-task-main monday-user-col-main">
                                            <strong>{task.name}</strong>
                                            <span>{task.boardName || '-'}{task.groupLabel ? ` · ${task.groupLabel}` : ''}</span>
                                          </td>
                                          <td className="monday-user-col-urgency">{urgency.label}</td>
                                          <td className="monday-user-col-status">{task.statusLabel || 'Sem status'}</td>
                                          <td className="monday-user-col-date">{task.dueDate ? formatShortDate(task.dueDate) : '-'}</td>
                                          <td className="monday-user-col-overdue">
                                            <div className="monday-overdue-stack">
                                              <span className="monday-overdue-value">
                                                {task.daysOverdue
                                                  ? `${formatNumber(task.daysOverdue)} dia(s)`
                                                  : task.isDueSoon
                                                    ? 'Vence logo'
                                                    : 'No prazo'}
                                              </span>
                                              {task.isOverdue && <span className="monday-task-chip danger">Atrasada</span>}
                                              {!task.isOverdue && task.isDueSoon && <span className="monday-task-chip info">Vence logo</span>}
                                            </div>
                                          </td>
                                          <td className="monday-user-col-time">{formatDurationHours(task.trackedSeconds || 0)}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </section>
                        )
                      })()
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ranking-empty">Nenhuma demanda encontrada para esse recorte.</div>
              )}
            </div>
          </div>,
          document.body
        )}
      </main>

      <style jsx>{`
        .sidebar-top {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 26px;
        }

        .nav-button {
          width: 100%;
          border: none;
          background: transparent;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }

        .sidebar :global(.nav-item) {
          transition:
            background 0.22s ease,
            color 0.22s ease,
            transform 0.22s ease,
            border-color 0.22s ease,
            box-shadow 0.22s ease;
        }

        .sidebar :global(.nav-item:hover) {
          background: linear-gradient(90deg, rgba(175, 198, 255, 0.12), rgba(175, 198, 255, 0.04));
          color: #f8fbff;
          transform: translateX(4px);
          box-shadow: inset 0 0 0 1px rgba(175, 198, 255, 0.08);
        }

        .sidebar :global(.nav-item.active:hover) {
          background: linear-gradient(90deg, rgba(175, 198, 255, 0.16), rgba(175, 198, 255, 0.05));
          box-shadow: inset 0 0 0 1px rgba(175, 198, 255, 0.12);
        }

        .nav-tools-group {
          display: grid;
          gap: 10px;
        }

        .assistant-header-prompt {
          margin-top: 10px;
          font-size: 15px;
          line-height: 1.45;
          color: var(--text-secondary);
          max-width: 680px;
        }

        .nav-tools-trigger {
          justify-content: space-between;
        }

        .nav-tools-chevron {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
        }

        .nav-tools-chevron i {
          font-size: 18px;
          margin: 0;
        }

        .home-tools-menu {
          display: grid;
          gap: 8px;
          padding: 0 0 0 18px;
        }

        .home-tools-link {
          width: 100%;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(69, 71, 75, 0.14);
          background: rgba(17, 24, 39, 0.48);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          display: grid;
          gap: 4px;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .home-tools-link strong {
          font-family: var(--font-family-headline);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .home-tools-link span {
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.45;
        }

        .home-tools-link:hover,
        .home-tools-link.active {
          border-color: rgba(175, 198, 255, 0.24);
          background: rgba(175, 198, 255, 0.08);
          transform: translateX(2px);
        }

        .sidebar-toggle {
          position: absolute;
          top: 26px;
          right: -18px;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(17, 24, 39, 0.96);
          color: var(--text-primary);
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          z-index: 3;
          transition:
            transform 0.22s ease,
            background 0.22s ease,
            border-color 0.22s ease,
            box-shadow 0.22s ease,
            color 0.22s ease;
        }

        .sidebar-toggle i {
          font-size: 18px;
        }

        .sidebar-toggle:hover {
          transform: translateY(-1px) scale(1.03);
          background: linear-gradient(180deg, rgba(30, 41, 59, 0.98), rgba(17, 24, 39, 0.98));
          border-color: rgba(175, 198, 255, 0.28);
          color: #ffffff;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34);
        }

        .sidebar-collapsed {
          width: 92px;
          padding-left: 14px;
          padding-right: 14px;
        }

        .sidebar-collapsed :global(.nav-item) {
          justify-content: center;
          width: 56px;
          height: 56px;
          margin: 0 auto;
          padding: 0;
          font-size: 0;
          border-radius: 18px;
          position: relative;
        }

        .sidebar-collapsed :global(.nav-item i) {
          font-size: 24px;
          margin: 0;
        }

        .sidebar-collapsed :global(.logo) {
          width: 100%;
          justify-content: center;
          margin-bottom: 10px;
          padding: 0;
        }

        .sidebar-collapsed :global(.nav-menu) {
          gap: 14px;
        }

        .sidebar-collapsed :global(.user-profile) {
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
        }

        .sidebar-collapsed :global(.nav-item)::after {
          content: attr(data-tooltip);
          position: absolute;
          left: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%);
          background: rgba(17, 24, 39, 0.96);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform-origin: left center;
          z-index: 12;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
        }

        .sidebar-collapsed :global(.nav-item:hover)::after {
          opacity: 1;
          transform: translateY(-50%) translateX(4px);
        }

        .main-content-expanded {
          margin-left: 92px;
        }

        .sidebar-client {
          padding: 16px;
          margin-top: 12px;
          margin-bottom: 18px;
        }

        .sidebar-client-label {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .header-actions-wrap {
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .custom-range input {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font: inherit;
          outline: none;
        }

        .clients-layout,
        .integrations-layout {
          display: grid;
          gap: 24px;
        }

        .management-header-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }

        .management-header-copy h2 {
          margin: 0 0 8px;
          color: #ffffff;
          font-size: clamp(34px, 4vw, 48px);
          line-height: 0.98;
          letter-spacing: -0.04em;
        }

        .management-header-copy p {
          margin: 0;
          color: rgba(225, 226, 235, 0.62);
          font-size: 16px;
          line-height: 1.6;
        }

        .management-header-button {
          min-height: 54px;
          padding: 0 24px;
          border-radius: 18px;
        }

        .management-hero {
          padding: 34px;
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
          gap: 24px;
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent-blue) 14%, transparent), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.012));
          border: 1px solid rgba(143, 144, 149, 0.14);
          border-radius: 28px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
        }

        .management-hero-copy {
          display: grid;
          align-content: start;
          gap: 12px;
        }

        .management-hero-kicker,
        .management-card-kicker {
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .management-hero h2 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(34px, 4vw, 54px);
          line-height: 0.98;
          letter-spacing: -0.04em;
        }

        .management-hero p {
          margin: 0;
          max-width: 64ch;
          color: rgba(225, 226, 235, 0.7);
          font-size: 18px;
          line-height: 1.65;
        }

        .management-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .management-stat-card {
          min-height: 132px;
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(143, 144, 149, 0.12);
          background: rgba(11, 14, 20, 0.64);
          display: grid;
          align-content: space-between;
          gap: 14px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }

        .management-stat-card small {
          color: rgba(225, 226, 235, 0.45);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .management-stat-card strong {
          color: #ffffff;
          font-size: clamp(30px, 3vw, 42px);
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .client-create-grid {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 18px;
        }

        .clients-hero-strip {
          display: grid;
          gap: 24px;
        }

        .clients-hero-main {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
        }

        .clients-hero-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .clients-hero-actions .btn {
          min-height: 48px;
          padding: 0 18px;
        }

        .clients-metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .clients-metric-card {
          min-height: 148px;
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.012)),
            rgba(16, 19, 26, 0.92);
          box-shadow: 0 14px 38px rgba(0, 0, 0, 0.18);
          display: grid;
          align-content: space-between;
          gap: 14px;
        }

        .clients-metric-card small {
          color: rgba(225, 226, 235, 0.38);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .clients-metric-card strong {
          color: #ffffff;
          font-size: clamp(34px, 3vw, 50px);
          line-height: 0.96;
          letter-spacing: -0.05em;
        }

        .clients-metric-card span {
          color: rgba(225, 226, 235, 0.56);
          font-size: 12px;
          line-height: 1.5;
        }

        .clients-metric-card-live {
          border-color: rgba(78, 222, 163, 0.18);
          background:
            radial-gradient(circle at top right, rgba(78, 222, 163, 0.08), transparent 42%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.012)),
            rgba(16, 19, 26, 0.92);
        }

        .clients-metric-card-score strong {
          color: var(--accent-emerald);
        }

        .client-create-grid > .client-create-bar {
          flex: 1 1 520px;
        }

        .clients-intro,
        .integrations-intro,
        .integrations-form {
          padding: 28px;
        }

        .clients-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: 360px 1fr;
        }

        .clients-grid-single {
          grid-template-columns: 1fr;
        }

        .users-management-layout {
          gap: 0;
        }

        .users-grid {
          align-items: start;
          grid-template-columns: 360px minmax(0, 1fr);
        }

        .clients-sidebar {
          display: grid;
          gap: 24px;
        }

        .client-create-bar {
          padding: 18px 22px;
          display: grid;
          align-content: start;
          gap: 12px;
        }

        .management-action-card,
        .management-directory-card,
        .users-intro-card {
          border-radius: 28px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.012)),
            rgba(16, 19, 26, 0.92);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
        }

        .client-create-inline {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
        }

        .client-create-bar h3 {
          margin-bottom: 4px;
        }

        .client-create-inline input {
          flex: 1;
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
        }

        .client-create-inline .btn {
          min-height: 44px;
          padding: 0 18px;
          white-space: nowrap;
        }

        .client-editor-card {
          padding: 24px;
          display: grid;
          gap: 24px;
        }

        .users-editor-shell {
          align-self: start;
          min-height: 0;
        }

        .client-list-card {
          padding: 24px;
        }

        .client-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .users-summary-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
          max-width: 320px;
        }

        .users-summary-chip {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
        }

        .users-toolbar-card {
          display: grid;
          gap: 20px;
          padding: 24px;
        }

        .integration-management-card {
          gap: 22px;
        }

        .integration-management-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .integration-summary-card {
          padding: 22px;
          border-radius: 20px;
          display: grid;
          gap: 10px;
        }

        .integration-summary-card h3 {
          font-size: 18px;
        }

        .integration-summary-card p {
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .integration-summary-card strong {
          font-size: 32px;
          line-height: 1;
        }

        .integration-mapped-list {
          padding: 22px;
          border-radius: 20px;
          display: grid;
          gap: 18px;
        }

        .users-toolbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .users-search-row {
          display: flex;
          justify-content: flex-start;
        }

        .users-search-field {
          width: min(100%, 360px);
          margin-bottom: 0;
        }

        .user-directory-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .client-directory-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .user-directory-card {
          padding: 20px;
          border-radius: 24px;
          display: grid;
          gap: 16px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.012)),
            rgba(11, 14, 20, 0.7);
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
          transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
        }

        .user-directory-card:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 5%, transparent), rgba(255, 255, 255, 0.014)),
            rgba(11, 14, 20, 0.78);
        }

        .user-directory-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .directory-card-icon {
          width: 52px;
          height: 52px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent-blue) 16%, transparent);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .directory-card-icon i {
          font-size: 23px;
        }

        .user-directory-main strong {
          display: block;
          color: #ffffff;
          font-size: 20px;
          margin-bottom: 6px;
          letter-spacing: -0.03em;
        }

        .user-directory-main span {
          color: rgba(225, 226, 235, 0.5);
          font-size: 12px;
          letter-spacing: 0.02em;
          display: block;
          overflow-wrap: anywhere;
        }

        .user-directory-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .user-directory-meta small {
          color: rgba(225, 226, 235, 0.58);
          font-size: 12px;
          line-height: 1.5;
        }

        .user-role-badge {
          padding: 7px 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent-blue) 16%, transparent);
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .user-directory-actions {
          display: flex;
          justify-content: flex-end;
        }

        .client-directory-card-active {
          border-color: color-mix(in srgb, var(--accent-blue) 32%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 8%, transparent), rgba(255, 255, 255, 0.016)),
            rgba(11, 14, 20, 0.82);
        }

        .client-directory-actions {
          gap: 10px;
          flex-wrap: wrap;
        }

        .client-groups-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .client-group-card {
          display: grid;
          gap: 16px;
          padding: 22px;
          border-radius: 24px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.012)),
            rgba(11, 14, 20, 0.7);
        }

        .client-spotlight-card {
          position: relative;
          overflow: hidden;
        }

        .client-spotlight-card::before {
          content: '';
          position: absolute;
          inset: auto -14% 72% auto;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(175, 198, 255, 0.08), transparent 68%);
          pointer-events: none;
        }

        .client-spotlight-badge-wrap {
          display: flex;
          justify-content: flex-end;
        }

        .client-status-badge {
          min-height: 28px;
          padding: 0 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(143, 144, 149, 0.16);
        }

        .client-status-success {
          color: var(--accent-emerald);
          background: color-mix(in srgb, var(--accent-emerald) 8%, transparent);
          border-color: color-mix(in srgb, var(--accent-emerald) 18%, transparent);
        }

        .client-status-info {
          color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
          border-color: color-mix(in srgb, var(--accent-blue) 18%, transparent);
        }

        .client-status-neutral {
          color: rgba(225, 226, 235, 0.68);
          background: rgba(255, 255, 255, 0.04);
        }

        .client-spotlight-head {
          display: flex;
          align-items: flex-start;
          gap: 18px;
        }

        .client-avatar-shell {
          width: 68px;
          height: 68px;
          border-radius: 22px;
          background: color-mix(in srgb, var(--accent-blue) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent-blue) 16%, transparent);
          display: grid;
          place-items: center;
          color: var(--accent-blue);
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.04em;
          overflow: hidden;
          flex-shrink: 0;
        }

        .client-avatar-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .client-spotlight-copy {
          display: grid;
          gap: 8px;
        }

        .client-spotlight-copy strong {
          color: #ffffff;
          font-size: 22px;
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .client-spotlight-copy span {
          color: rgba(225, 226, 235, 0.42);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-spotlight-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          padding: 18px 0;
          border-top: 1px solid rgba(143, 144, 149, 0.12);
          border-bottom: 1px solid rgba(143, 144, 149, 0.12);
        }

        .client-spotlight-grid small {
          display: block;
          margin-bottom: 4px;
          color: rgba(225, 226, 235, 0.38);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-spotlight-grid p {
          margin: 0;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .client-intelligence-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
          gap: 24px;
        }

        .client-command-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
          gap: 24px;
        }

        .client-intelligence-feature,
        .client-activity-card {
          padding: 30px;
          border-radius: 28px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.012)),
            rgba(16, 19, 26, 0.92);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22);
        }

        .client-intelligence-feature {
          position: relative;
          overflow: hidden;
          display: grid;
          gap: 18px;
          align-content: start;
          background:
            radial-gradient(circle at top right, rgba(78, 222, 163, 0.08), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.012)),
            rgba(16, 19, 26, 0.92);
        }

        .client-intelligence-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--accent-emerald);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-intelligence-feature h3,
        .client-activity-head h3 {
          margin: 0;
          color: #ffffff;
          font-size: 28px;
          line-height: 1.08;
          letter-spacing: -0.04em;
        }

        .client-intelligence-feature p {
          margin: 0;
          max-width: 56ch;
          color: rgba(225, 226, 235, 0.64);
          font-size: 15px;
          line-height: 1.65;
        }

        .client-activity-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .client-activity-link {
          border: none;
          background: transparent;
          color: var(--accent-blue);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .client-activity-list {
          display: grid;
          gap: 22px;
          margin-top: 26px;
        }

        .client-activity-list-extended {
          margin-top: 0;
        }

        .client-activity-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .client-activity-card-large {
          display: grid;
          gap: 24px;
          align-content: start;
        }

        .client-activity-icon {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background: rgba(255, 255, 255, 0.03);
        }

        .client-activity-icon i {
          font-size: 18px;
        }

        .client-activity-icon-primary {
          color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
          border-color: color-mix(in srgb, var(--accent-blue) 20%, transparent);
        }

        .client-activity-icon-success {
          color: var(--accent-emerald);
          background: color-mix(in srgb, var(--accent-emerald) 8%, transparent);
          border-color: color-mix(in srgb, var(--accent-emerald) 20%, transparent);
        }

        .client-activity-icon-alert {
          color: #f6b25d;
          background: rgba(246, 178, 93, 0.08);
          border-color: rgba(246, 178, 93, 0.2);
        }

        .client-security-card {
          padding: 30px;
          border-radius: 28px;
          border: 1px solid rgba(143, 144, 149, 0.14);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.012)),
            rgba(11, 14, 20, 0.92);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22);
          display: grid;
          gap: 28px;
          align-content: start;
        }

        .client-security-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .client-security-head h3 {
          margin: 0;
          color: #ffffff;
          font-size: 28px;
          line-height: 1.08;
          letter-spacing: -0.04em;
        }

        .client-security-head i {
          font-size: 24px;
          color: var(--accent-emerald);
        }

        .client-security-meters {
          display: grid;
          gap: 18px;
        }

        .client-security-meter {
          display: grid;
          gap: 10px;
        }

        .client-security-meter div:first-child {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .client-security-meter span {
          color: rgba(225, 226, 235, 0.42);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-security-meter strong {
          color: var(--accent-emerald);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .client-security-track {
          width: 100%;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }

        .client-security-fill {
          height: 100%;
          border-radius: inherit;
        }

        .client-security-fill-primary {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent-blue) 55%, white 45%),
            color-mix(in srgb, var(--accent-blue) 90%, black 10%)
          );
        }

        .client-security-fill-tertiary {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent-emerald) 90%, white 10%),
            color-mix(in srgb, var(--accent-emerald) 70%, white 30%)
          );
        }

        .client-security-note {
          padding: 20px;
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--accent-emerald) 12%, transparent);
          background: color-mix(in srgb, var(--accent-emerald) 6%, transparent);
          display: grid;
          gap: 12px;
        }

        .client-security-note-head {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: var(--accent-emerald);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-security-note p {
          margin: 0;
          color: rgba(225, 226, 235, 0.68);
          font-size: 14px;
          line-height: 1.65;
        }

        .client-activity-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          margin-top: 6px;
          flex-shrink: 0;
        }

        .client-activity-dot-primary {
          background: var(--accent-blue);
        }

        .client-activity-dot-success {
          background: var(--accent-emerald);
        }

        .client-activity-dot-muted {
          background: rgba(225, 226, 235, 0.4);
        }

        .client-activity-item strong {
          display: block;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.55;
        }

        .client-activity-item small {
          display: inline-block;
          margin-top: 6px;
          color: rgba(225, 226, 235, 0.38);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .client-group-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .client-group-head .input-group {
          flex: 1;
          margin-bottom: 0;
        }

        .compact-empty-state {
          min-height: 180px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 9, 18, 0.72);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 320;
        }

        .modal-card {
          width: min(100%, 880px);
          max-height: min(88vh, 900px);
          overflow: auto;
          padding: 24px;
          display: grid;
          gap: 22px;
          position: relative;
          z-index: 321;
        }

        .modal-card-wide {
          width: min(100%, 1180px);
        }

        .dashboard-entry-modal {
          width: min(100%, 560px);
        }

        .dashboard-entry-content {
          display: grid;
          gap: 18px;
        }

        .dashboard-entry-picker {
          width: 100%;
        }

        .dashboard-entry-picker select {
          width: 100%;
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .modal-header h3 {
          font-size: 26px;
          margin-bottom: 6px;
        }

        .modal-header p {
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .modal-close {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        .modal-close i {
          font-size: 20px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .ai-insights-modal {
          width: min(100%, 960px);
          gap: 18px;
        }

        .ai-insights-state,
        .ai-insights-summary-shell,
        .ai-insights-actions-shell,
        .ai-insight-card {
          padding: 20px;
          display: grid;
          gap: 12px;
        }

        .ai-insights-state {
          justify-items: start;
        }

        .ai-insights-state i {
          font-size: 28px;
          color: #93c5fd;
        }

        .ai-insights-state strong,
        .ai-insight-card strong,
        .ai-insights-section-title,
        .ai-insights-headline {
          font-size: 22px;
          line-height: 1.2;
          color: var(--text-primary);
        }

        .ai-insights-state p,
        .ai-insights-summary,
        .ai-insight-card p,
        .ai-insights-empty-note {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .ai-insights-state-error {
          border-color: rgba(248, 113, 113, 0.28);
          background: rgba(127, 29, 29, 0.18);
        }

        .ai-insights-state-error i {
          color: #fda4af;
        }

        .ai-insights-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ai-insights-summary-shell {
          gap: 18px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)),
            radial-gradient(circle at top right, rgba(59, 130, 246, 0.2), transparent 34%);
        }

        .ai-insights-summary-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }

        .ai-insights-summary-copy {
          flex: 1 1 420px;
          display: grid;
          gap: 12px;
        }

        .ai-insights-headline {
          max-width: 18ch;
          font-size: clamp(28px, 4vw, 42px);
          line-height: 0.98;
          letter-spacing: -0.03em;
        }

        .ai-insights-summary {
          max-width: 62ch;
          font-size: 16px;
        }

        .ai-insights-context {
          display: grid;
          gap: 8px;
          justify-items: end;
        }

        .ai-insights-context-hero {
          flex: 0 0 260px;
        }

        .ai-insights-context span {
          width: fit-content;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          display: inline-flex;
          align-items: center;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
        }

        .ai-insights-highlight-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .ai-insights-fallback-banner {
          display: grid;
          gap: 10px;
          padding: 16px 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
        }

        .ai-insights-fallback-banner p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 70ch;
        }

        .ai-insights-highlight-card {
          min-height: 108px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 16px;
          display: grid;
          align-content: space-between;
          gap: 12px;
        }

        .ai-insights-highlight-card small {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ai-insights-highlight-card strong {
          font-size: 34px;
          line-height: 1;
          color: var(--text-primary);
        }

        .ai-insights-highlight-opportunity {
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.16), rgba(255, 255, 255, 0.03));
        }

        .ai-insights-highlight-alert {
          background: linear-gradient(180deg, rgba(245, 158, 11, 0.16), rgba(255, 255, 255, 0.03));
        }

        .ai-insights-highlight-info {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(255, 255, 255, 0.03));
        }

        .ai-insights-sections {
          display: grid;
          gap: 18px;
        }

        .ai-insights-section {
          display: grid;
          gap: 12px;
        }

        .ai-insights-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .ai-insights-section-head small {
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
        }

        .ai-insights-section-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .ai-insights-section-title-wrap strong {
          font-size: 22px;
          color: var(--text-primary);
          line-height: 1.1;
        }

        .ai-insights-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .ai-insights-grid-fallback {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .ai-insight-card {
          align-content: start;
          gap: 14px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.025)),
            radial-gradient(circle at top right, rgba(255, 255, 255, 0.08), transparent 34%);
        }

        .ai-insight-card-fallback {
          min-height: 180px;
        }

        .ai-insight-card-focus {
          min-height: 100%;
        }

        .ai-insight-card-empty {
          grid-column: 1 / -1;
        }

        .ai-insight-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .ai-insight-index {
          color: rgba(255, 255, 255, 0.24);
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .ai-insight-chip {
          width: fit-content;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          display: inline-flex;
          align-items: center;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .ai-insight-chip-opportunity,
        .ai-insight-chip-win {
          border-color: rgba(16, 185, 129, 0.28);
          background: rgba(16, 185, 129, 0.14);
          color: #86efac;
        }

        .ai-insight-chip-positive {
          border-color: rgba(16, 185, 129, 0.28);
          background: rgba(16, 185, 129, 0.14);
          color: #86efac;
        }

        .ai-insight-chip-attention {
          border-color: rgba(245, 158, 11, 0.28);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }

        .ai-insight-chip-urgent {
          border-color: rgba(248, 113, 113, 0.28);
          background: rgba(248, 113, 113, 0.16);
          color: #fda4af;
        }

        .ai-insight-chip-alert,
        .ai-insight-chip-anomaly {
          border-color: rgba(245, 158, 11, 0.28);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }

        .ai-insight-block {
          display: grid;
          gap: 6px;
          padding-top: 2px;
        }

        .ai-insight-block small {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ai-insight-block-action {
          margin-top: auto;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(59, 130, 246, 0.18);
          background: rgba(59, 130, 246, 0.08);
        }

        .ai-insight-action {
          color: var(--text-primary);
          font-weight: 600;
        }

        .ai-insight-bullet-list {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 10px;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .ai-insights-actions-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .ai-insights-actions-badge {
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          display: inline-flex;
          align-items: center;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .ai-insights-actions-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
          color: var(--text-primary);
        }

        .ai-insights-actions-list li {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .ai-insights-actions-step {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(59, 130, 246, 0.16);
          color: #bfdbfe;
          font-size: 13px;
          font-weight: 800;
        }

        .ai-insights-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 13px;
        }

        .meta-result-modal {
          width: min(100%, 1120px);
          gap: 18px;
        }

        .meta-ranking-modal {
          width: min(100%, 1180px);
          gap: 18px;
        }

        .meta-result-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .meta-result-periods {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .meta-result-period-btn {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .meta-result-period-btn.active {
          border-color: var(--accent-blue);
          background: rgba(59, 130, 246, 0.12);
          color: var(--text-primary);
        }

        .meta-result-toolbar-note {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .meta-result-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .meta-result-chart-shell {
          padding: 20px;
          display: grid;
          gap: 16px;
        }

        .meta-ranking-body {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
          gap: 18px;
          align-items: start;
        }

        .meta-ranking-chart-shell {
          padding: 20px;
          display: grid;
          gap: 16px;
        }

        .meta-ranking-period-shell {
          align-content: start;
        }

        .meta-ranking-period-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .meta-ranking-creative-main {
          display: grid;
          gap: 18px;
        }

        .meta-ranking-body-creative {
          grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
        }

        .meta-ranking-chart-wrapper {
          min-height: 360px;
        }

        .meta-ranking-detail-panel {
          padding: 22px;
          display: grid;
          gap: 18px;
          align-content: start;
        }

        .meta-ranking-detail-head {
          display: grid;
          gap: 8px;
        }

        .meta-ranking-detail-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .meta-ranking-detail-head h4 {
          font-size: 28px;
          line-height: 1.1;
          margin: 0;
        }

        .meta-ranking-detail-head p {
          color: var(--text-muted);
          line-height: 1.55;
          margin: 0;
        }

        .meta-ranking-preview-frame {
          width: 100%;
          min-height: 280px;
          min-height: 360px;
          max-height: 460px;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          display: grid;
          place-items: center;
        }

        .meta-ranking-preview-frame img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          image-rendering: auto;
          padding: 20px;
          background:
            radial-gradient(circle at 50% 24%, rgba(255, 255, 255, 0.08), transparent 30%),
            rgba(8, 12, 22, 0.78);
        }

        .meta-ranking-preview-frame iframe {
          width: 100%;
          min-height: 620px;
          height: 100%;
          border: 0;
          background: #fff;
        }

        .meta-ranking-preview-fallback {
          min-height: 220px;
          border-radius: 24px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.02);
          display: grid;
          place-items: center;
          gap: 8px;
          text-align: center;
          padding: 24px;
          color: var(--text-muted);
        }

        .meta-ranking-preview-fallback i {
          font-size: 28px;
          color: var(--text-secondary);
        }

        .meta-ranking-preview-fallback-text strong {
          font-size: 30px;
          color: var(--text-primary);
          line-height: 1.1;
        }

        .meta-ranking-detail-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .meta-result-chart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .meta-result-legend {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
        }

        .meta-result-chart-wrapper {
          min-height: 380px;
        }

        .modal-foot {
          display: grid;
          gap: 16px;
        }

        .client-editor-header h3 {
          font-size: 24px;
          margin-bottom: 6px;
        }

        .client-editor-header p {
          color: var(--text-secondary);
        }

        .modal-client-editor {
          padding: 0;
        }

        .branding-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .client-identity-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
          gap: 24px;
          align-items: start;
        }

        .client-identity-main,
        .client-identity-side {
          display: grid;
          gap: 18px;
          min-width: 0;
        }

        .dashboard-color-editor {
          display: grid;
          gap: 12px;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .dashboard-color-preview-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .dashboard-color-preview-row input[type="color"] {
          width: 100%;
          height: 56px;
          padding: 0;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: rgba(0, 0, 0, 0.2);
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          overflow: hidden;
          box-sizing: border-box;
        }

        .dashboard-color-preview-row input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .dashboard-color-preview-row input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 10px;
        }

        .dashboard-color-code {
          display: grid;
          gap: 4px;
          min-width: 0;
          justify-items: start;
        }

        .dashboard-color-code strong {
          font-size: 15px;
          line-height: 1.1;
        }

        .dashboard-color-code span {
          color: var(--text-muted);
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .dashboard-rgb-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .dashboard-rgb-field {
          display: grid;
          gap: 6px;
        }

        .dashboard-rgb-field span {
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .dashboard-rgb-field input {
          width: 100%;
          min-height: 42px;
          padding: 0 10px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .dashboard-theme-presets {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .dashboard-theme-preset {
          width: 100%;
          min-width: 0;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }

        .dashboard-theme-preset.active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .dashboard-theme-preset small {
          font-size: 12px;
          line-height: 1;
          text-transform: capitalize;
        }

        .dashboard-theme-swatch {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          flex-shrink: 0;
        }

        .client-list-card h3,
        .clients-intro h2,
        .integrations-intro h2 {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .client-create-bar p,
        .clients-intro p,
        .integrations-intro p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .client-list {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .client-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .client-row.selected {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .client-select,
        .client-delete {
          background: transparent;
          border: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .client-select {
          display: grid;
          gap: 4px;
          text-align: left;
          flex: 1;
        }

        .client-select span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .client-delete {
          color: #fda4af;
          font-size: 13px;
        }

        .hero-panel {
          padding: 24px;
          margin-bottom: 24px;
          display: grid;
          gap: 20px;
          grid-template-columns: 1.8fr 1fr;
          background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent), radial-gradient(circle at top right, rgba(124, 77, 255, 0.14), transparent 34%);
          border-radius: 24px;
        }

        .hero-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .hero-panel h2 {
          font-size: 34px;
          margin: 14px 0 10px;
          letter-spacing: -0.03em;
        }

        .hero-logo-wrap {
          width: 112px;
          height: 112px;
          margin-bottom: 18px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          place-items: center;
          overflow: hidden;
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.22);
        }

        .hero-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 14px;
        }

        .hero-panel p {
          color: var(--text-secondary);
          max-width: 720px;
          line-height: 1.55;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero-meta {
          display: grid;
          gap: 14px;
        }

        .source-section {
          display: grid;
          gap: 28px;
          margin-bottom: 28px;
        }

        .home-hub-hero-obsidian {
          padding: 34px;
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.95fr);
          gap: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.008)),
            radial-gradient(circle at top right, rgba(175, 198, 255, 0.12), transparent 34%);
          border-radius: 24px;
        }

        .home-hub-copy {
          display: grid;
          align-content: start;
          gap: 14px;
        }

        .home-hub-kicker {
          color: #4ede63;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .home-hub-kicker-success {
          color: #4ede63;
        }

        .home-hub-copy h2 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(34px, 4vw, 54px);
          line-height: 0.98;
          letter-spacing: -0.05em;
        }

        .home-hub-copy p {
          margin: 0;
          max-width: 56ch;
          color: rgba(225, 226, 235, 0.7);
          font-size: 17px;
          line-height: 1.65;
        }

        .home-hub-metrics-obsidian {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .home-hub-metric {
          min-height: 156px;
          padding: 22px;
          display: grid;
          align-content: space-between;
          gap: 14px;
          border-radius: 20px;
          background: rgba(11, 14, 20, 0.74);
          border: 1px solid rgba(143, 144, 149, 0.12);
        }

        .home-hub-metric span {
          display: block;
          color: rgba(225, 226, 235, 0.38);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .home-hub-metric strong {
          display: block;
          color: #ffffff;
          font-size: clamp(34px, 4vw, 52px);
          line-height: 0.96;
          letter-spacing: -0.05em;
        }

        .home-hub-metric small {
          display: block;
          color: rgba(225, 226, 235, 0.56);
          font-size: 12px;
          line-height: 1.5;
        }

        .home-hub-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }

        .home-hub-section-head h3 {
          margin: 0;
          color: #ffffff;
          font-size: 26px;
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .home-hub-manage-link {
          border: none;
          background: transparent;
          color: #afc6ff;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .home-hub-grid-obsidian {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 18px;
        }

        .home-hub-card {
          padding: 22px;
          min-height: 208px;
          display: grid;
          gap: 18px;
          align-content: start;
          text-align: left;
          border-radius: 20px;
          cursor: pointer;
          transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
        }

        .home-hub-card:hover {
          transform: translateY(-2px);
          border-color: rgba(175, 198, 255, 0.2);
          background:
            linear-gradient(180deg, rgba(175, 198, 255, 0.04), rgba(255, 255, 255, 0.012)),
            rgba(22, 27, 34, 0.92);
        }

        .home-hub-grid-obsidian .home-hub-card:nth-child(1),
        .home-hub-grid-obsidian .home-hub-card:nth-child(2) {
          grid-column: span 2;
        }

        .home-hub-grid-obsidian .home-hub-card:nth-child(n + 3) {
          grid-column: span 1;
        }

        .home-hub-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .home-hub-card-pill {
          min-height: 28px;
          padding: 0 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          border: 1px solid rgba(143, 144, 149, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(225, 226, 235, 0.62);
        }

        .home-hub-card-copy {
          display: grid;
          gap: 10px;
        }

        .home-hub-card-copy h3 {
          margin: 0;
          color: #ffffff;
          font-size: 22px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        .home-hub-card-copy p {
          margin: 0;
          color: rgba(225, 226, 235, 0.64);
          font-size: 14px;
          line-height: 1.6;
        }

        .home-hub-card-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 14px;
        }

        .home-hub-card-footer span {
          color: rgba(225, 226, 235, 0.42);
          font-size: 12px;
          line-height: 1.5;
          max-width: 26ch;
        }

        .home-hub-card-footer strong {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        .home-hub-lower-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
          gap: 24px;
          align-items: start;
        }

        .home-hub-analytics-card,
        .home-hub-reports-card,
        .home-hub-ai-note {
          padding: 28px;
          border-radius: 20px;
        }

        .home-hub-analytics-card {
          min-height: 420px;
          display: grid;
          gap: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.008)),
            radial-gradient(circle at center bottom, rgba(78, 137, 255, 0.08), transparent 46%);
        }

        .home-hub-analytics-copy {
          margin: 12px 0 0;
          max-width: 56ch;
          color: rgba(225, 226, 235, 0.62);
          font-size: 14px;
          line-height: 1.7;
        }

        .home-hub-analytics-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .home-hub-analytics-head h3,
        .home-hub-reports-head h3 {
          margin: 6px 0 0;
          color: #ffffff;
          font-size: 24px;
          line-height: 1.08;
          letter-spacing: -0.04em;
        }

        .home-hub-analytics-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .home-hub-analytics-badges span {
          min-height: 28px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(143, 144, 149, 0.14);
          color: rgba(225, 226, 235, 0.62);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
        }

        .home-hub-analytics-metrics {
          margin-top: auto;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .home-hub-analytics-metric-card {
          padding: 20px;
          border-radius: 18px;
          background: rgba(11, 14, 20, 0.58);
          border: 1px solid rgba(69, 71, 75, 0.16);
          display: grid;
          gap: 8px;
        }

        .home-hub-analytics-metric-card span {
          color: rgba(225, 226, 235, 0.42);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .home-hub-analytics-metric-card strong {
          color: #ffffff;
          font-size: 20px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }

        .home-hub-analytics-metric-card small {
          color: rgba(225, 226, 235, 0.5);
          font-size: 12px;
          line-height: 1.55;
        }

        .home-hub-side-stack {
          display: grid;
          gap: 24px;
        }

        .home-hub-reports-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .home-hub-reports-list {
          display: grid;
          gap: 20px;
          margin-top: 26px;
        }

        .home-hub-report-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .home-hub-report-dot {
          width: 7px;
          height: 7px;
          margin-top: 7px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .home-hub-report-dot.primary { background: #afc6ff; }
        .home-hub-report-dot.success { background: #4ede63; }
        .home-hub-report-dot.muted { background: rgba(225, 226, 235, 0.4); }

        .home-hub-report-item strong {
          display: block;
          color: #ffffff;
          font-size: 14px;
          line-height: 1.55;
        }

        .home-hub-report-item small {
          display: inline-block;
          margin-top: 6px;
          color: rgba(225, 226, 235, 0.38);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .home-hub-ai-note {
          background:
            linear-gradient(180deg, rgba(78, 137, 255, 0.08), rgba(255, 255, 255, 0.01)),
            rgba(0, 15, 47, 0.4);
          border: 1px solid rgba(175, 198, 255, 0.16);
          display: grid;
          gap: 12px;
        }

        .home-hub-ai-note p {
          margin: 0;
          color: rgba(225, 226, 235, 0.72);
          font-size: 14px;
          line-height: 1.65;
        }

        :root[data-ui-mode='light'] .home-tools-link {
          background: rgba(255, 255, 255, 0.84);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .home-tools-link span {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .home-tools-link:hover,
        :root[data-ui-mode='light'] .home-tools-link.active {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .sidebar-toggle {
          background: rgba(255, 255, 255, 0.96);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .sidebar :global(.nav-item:hover) {
          background: linear-gradient(90deg, rgba(219, 234, 254, 0.92), rgba(239, 246, 255, 0.88));
          color: #0f172a;
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.12);
        }

        :root[data-ui-mode='light'] .sidebar :global(.nav-item.active:hover) {
          background: linear-gradient(90deg, rgba(219, 234, 254, 0.98), rgba(239, 246, 255, 0.92));
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.16);
        }

        :root[data-ui-mode='light'] .sidebar-collapsed :global(.nav-item)::after {
          background: rgba(255, 255, 255, 0.98);
          color: #0f172a;
          border-color: rgba(15, 23, 42, 0.1);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
        }

        :root[data-ui-mode='light'] .home-hub-hero-obsidian {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(248, 250, 252, 0.92)),
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent-blue) 12%, transparent), transparent 34%);
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
        }

        :root[data-ui-mode='light'] .home-hub-kicker,
        :root[data-ui-mode='light'] .home-hub-kicker-success,
        :root[data-ui-mode='light'] .home-hub-manage-link {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .home-hub-copy h2,
        :root[data-ui-mode='light'] .home-hub-section-head h3,
        :root[data-ui-mode='light'] .home-hub-card-copy h3,
        :root[data-ui-mode='light'] .home-hub-analytics-head h3,
        :root[data-ui-mode='light'] .home-hub-reports-head h3,
        :root[data-ui-mode='light'] .home-hub-report-item strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .home-hub-copy p,
        :root[data-ui-mode='light'] .home-hub-card-copy p,
        :root[data-ui-mode='light'] .home-hub-analytics-copy,
        :root[data-ui-mode='light'] .home-hub-ai-note p,
        :root[data-ui-mode='light'] .home-hub-report-item small,
        :root[data-ui-mode='light'] .home-hub-card-footer span,
        :root[data-ui-mode='light'] .home-hub-metric small,
        :root[data-ui-mode='light'] .home-hub-metric span,
        :root[data-ui-mode='light'] .home-hub-analytics-metric-card small,
        :root[data-ui-mode='light'] .home-hub-analytics-metric-card span {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .home-hub-metric {
          background: rgba(255, 255, 255, 0.74);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .home-hub-metric strong,
        :root[data-ui-mode='light'] .home-hub-card-footer strong,
        :root[data-ui-mode='light'] .home-hub-analytics-metric-card strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .home-hub-card {
          background: rgba(255, 255, 255, 0.88);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .home-hub-card:hover {
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(15, 23, 42, 0.08));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 6%, white), rgba(255, 255, 255, 0.94)),
            rgba(255, 255, 255, 0.94);
        }

        :root[data-ui-mode='light'] .home-hub-card-pill,
        :root[data-ui-mode='light'] .home-hub-analytics-badges span {
          background: rgba(15, 23, 42, 0.04);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .home-hub-analytics-card,
        :root[data-ui-mode='light'] .home-hub-reports-card {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(248, 250, 252, 0.94)),
            radial-gradient(circle at center bottom, color-mix(in srgb, var(--accent-blue) 8%, transparent), transparent 46%);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
        }

        :root[data-ui-mode='light'] .home-hub-analytics-metric-card {
          background: rgba(248, 250, 252, 0.92);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .home-hub-report-dot.muted {
          background: rgba(71, 85, 105, 0.3);
        }

        :root[data-ui-mode='light'] .home-hub-ai-note {
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 8%, white), rgba(255, 255, 255, 0.94)),
            rgba(255, 255, 255, 0.94);
          border-color: color-mix(in srgb, var(--accent-blue) 16%, rgba(15, 23, 42, 0.08));
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .management-hero {
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent-blue) 10%, transparent), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(248, 250, 252, 0.96));
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
        }

        :root[data-ui-mode='light'] .management-hero h2,
        :root[data-ui-mode='light'] .client-intelligence-feature h3,
        :root[data-ui-mode='light'] .client-activity-head h3,
        :root[data-ui-mode='light'] .client-security-head h3,
        :root[data-ui-mode='light'] .client-spotlight-copy strong,
        :root[data-ui-mode='light'] .client-spotlight-grid p,
        :root[data-ui-mode='light'] .user-directory-main strong,
        :root[data-ui-mode='light'] .client-activity-item strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .management-hero p,
        :root[data-ui-mode='light'] .management-header-copy p,
        :root[data-ui-mode='light'] .client-intelligence-feature p,
        :root[data-ui-mode='light'] .client-security-note p,
        :root[data-ui-mode='light'] .user-directory-main span,
        :root[data-ui-mode='light'] .user-directory-meta small,
        :root[data-ui-mode='light'] .client-activity-item small {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .management-stat-card,
        :root[data-ui-mode='light'] .clients-metric-card {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 250, 252, 0.96)),
            rgba(255, 255, 255, 0.94);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .clients-metric-card-live {
          border-color: color-mix(in srgb, var(--accent-emerald) 26%, rgba(15, 23, 42, 0.08));
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent-emerald) 10%, transparent), transparent 42%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 250, 252, 0.96));
        }

        :root[data-ui-mode='light'] .management-stat-card small,
        :root[data-ui-mode='light'] .clients-metric-card small,
        :root[data-ui-mode='light'] .client-spotlight-copy span,
        :root[data-ui-mode='light'] .client-spotlight-grid small,
        :root[data-ui-mode='light'] .client-security-meter span {
          color: rgba(71, 85, 105, 0.78);
        }

        :root[data-ui-mode='light'] .management-stat-card strong,
        :root[data-ui-mode='light'] .clients-metric-card strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .clients-metric-card span {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .management-action-card,
        :root[data-ui-mode='light'] .management-directory-card,
        :root[data-ui-mode='light'] .users-intro-card,
        :root[data-ui-mode='light'] .user-directory-card,
        :root[data-ui-mode='light'] .client-group-card,
        :root[data-ui-mode='light'] .client-intelligence-feature,
        :root[data-ui-mode='light'] .client-activity-card,
        :root[data-ui-mode='light'] .client-security-card {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.96)),
            rgba(255, 255, 255, 0.94);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .client-intelligence-feature {
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent-emerald) 10%, transparent), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.96));
        }

        :root[data-ui-mode='light'] .user-directory-card:hover {
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 5%, white), rgba(255, 255, 255, 0.98)),
            rgba(255, 255, 255, 0.98);
        }

        :root[data-ui-mode='light'] .client-directory-card-active {
          border-color: color-mix(in srgb, var(--accent-blue) 28%, rgba(15, 23, 42, 0.08));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 8%, white), rgba(255, 255, 255, 0.98)),
            rgba(255, 255, 255, 0.98);
        }

        :root[data-ui-mode='light'] .directory-card-icon,
        :root[data-ui-mode='light'] .client-avatar-shell {
          background: color-mix(in srgb, var(--accent-blue) 10%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(15, 23, 42, 0.08));
          box-shadow: none;
        }

        :root[data-ui-mode='light'] .user-role-badge,
        :root[data-ui-mode='light'] .client-status-info {
          background: color-mix(in srgb, var(--accent-blue) 10%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .client-status-success,
        :root[data-ui-mode='light'] .client-security-note {
          background: color-mix(in srgb, var(--accent-emerald) 10%, white);
          border-color: color-mix(in srgb, var(--accent-emerald) 18%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .client-status-neutral {
          color: var(--text-secondary);
          background: rgba(15, 23, 42, 0.04);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .client-spotlight-grid {
          border-top-color: rgba(15, 23, 42, 0.08);
          border-bottom-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .client-security-track {
          background: rgba(71, 85, 105, 0.14);
        }

        :root[data-ui-mode='light'] .client-activity-link {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .client-activity-icon {
          background: rgba(15, 23, 42, 0.03);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .client-activity-icon-alert {
          background: rgba(246, 178, 93, 0.12);
          border-color: rgba(246, 178, 93, 0.22);
        }

        :root[data-ui-mode='light'] .client-activity-dot-muted {
          background: rgba(71, 85, 105, 0.36);
        }

        :root[data-ui-mode='light'] .client-create-inline input {
          background: rgba(255, 255, 255, 0.88);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .client-create-inline input::placeholder {
          color: rgba(71, 85, 105, 0.62);
        }

        :root[data-ui-mode='light'] .page-title h1,
        :root[data-ui-mode='light'] .page-title p {
          color: var(--text-primary);
          text-shadow: none;
        }

        :root[data-ui-mode='light'] .page-title p {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .source-section-copy,
        :root[data-ui-mode='light'] .chart-subtitle,
        :root[data-ui-mode='light'] .hero-panel p,
        :root[data-ui-mode='light'] .hero-stat span,
        :root[data-ui-mode='light'] .meta-filter-helper,
        :root[data-ui-mode='light'] .meta-campaign-filter-trigger p,
        :root[data-ui-mode='light'] .meta-campaign-filter-note,
        :root[data-ui-mode='light'] .rd-source-filter-bar p,
        :root[data-ui-mode='light'] .result-group-head p,
        :root[data-ui-mode='light'] .conversion-group-head p,
        :root[data-ui-mode='light'] .meta-result-preview-head p,
        :root[data-ui-mode='light'] .conversion-stat span,
        :root[data-ui-mode='light'] .meta-summary-add-card span,
        :root[data-ui-mode='light'] .metric-library-panel p,
        :root[data-ui-mode='light'] .metric-library-chip small,
        :root[data-ui-mode='light'] .metric-library-empty {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .source-section-badge {
          background: rgba(255, 255, 255, 0.84);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .hero-panel,
        :root[data-ui-mode='light'] .grouped-results,
        :root[data-ui-mode='light'] .meta-filter-panel,
        :root[data-ui-mode='light'] .chart-container,
        :root[data-ui-mode='light'] .funnel-section,
        :root[data-ui-mode='light'] .campaigns-section,
        :root[data-ui-mode='light'] .ranking-card,
        :root[data-ui-mode='light'] .meta-result-preview-panel,
        :root[data-ui-mode='light'] .metric-library-panel,
        :root[data-ui-mode='light'] .rd-source-filter-bar,
        :root[data-ui-mode='light'] .crm-result-group,
        :root[data-ui-mode='light'] .meta-secondary-result-summary,
        :root[data-ui-mode='light'] .meta-secondary-result-item,
        :root[data-ui-mode='light'] .monday-drilldown-stat.glass-item {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.96)),
            rgba(255, 255, 255, 0.94);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .hero-panel {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.96)),
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent-blue) 10%, transparent), transparent 34%);
        }

        :root[data-ui-mode='light'] .hero-panel h2,
        :root[data-ui-mode='light'] .meta-filter-panel-head h2,
        :root[data-ui-mode='light'] .result-group-head h3,
        :root[data-ui-mode='light'] .meta-result-preview-head h3,
        :root[data-ui-mode='light'] .chart-header h2,
        :root[data-ui-mode='light'] .campaigns-section h2,
        :root[data-ui-mode='light'] .meta-secondary-result-summary strong,
        :root[data-ui-mode='light'] .meta-secondary-result-item strong,
        :root[data-ui-mode='light'] .meta-secondary-result-item b,
        :root[data-ui-mode='light'] .conversion-stat strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .hero-stat,
        :root[data-ui-mode='light'] .conversion-stat,
        :root[data-ui-mode='light'] .template-metric-remove,
        :root[data-ui-mode='light'] .meta-campaign-filter-trigger,
        :root[data-ui-mode='light'] .meta-campaign-filter-trigger-icon,
        :root[data-ui-mode='light'] .meta-result-preview-tab {
          background: rgba(248, 250, 252, 0.92);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .hero-select,
        :root[data-ui-mode='light'] .chart-metric-select {
          background: rgba(255, 255, 255, 0.88);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .meta-filter-kicker,
        :root[data-ui-mode='light'] .meta-result-preview-kicker {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .meta-campaign-filter-trigger:hover,
        :root[data-ui-mode='light'] .meta-campaign-filter-trigger.open,
        :root[data-ui-mode='light'] .meta-result-preview-tab.active {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .template-metric-remove:hover,
        :root[data-ui-mode='light'] .conversion-group-secondary-trigger:hover,
        :root[data-ui-mode='light'] .metric-library-card:hover {
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .template-metric-remove,
        :root[data-ui-mode='light'] .conversion-group-secondary-trigger {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .metric-library-chip {
          background: rgba(255, 255, 255, 0.88);
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08));
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .metric-library-chip.active,
        :root[data-ui-mode='light'] .meta-summary-add-card,
        :root[data-ui-mode='light'] .metric-library-add-icon {
          background: color-mix(in srgb, var(--accent-blue) 8%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
          color: var(--accent-blue);
          box-shadow: none;
        }

        :root[data-ui-mode='light'] .meta-summary-add-card:hover {
          background: color-mix(in srgb, var(--accent-blue) 12%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 32%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .conversion-group-card-active {
          opacity: 1;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 4%, white), rgba(255, 255, 255, 0.96)),
            rgba(255, 255, 255, 0.94);
        }

        :root[data-ui-mode='light'] .conversion-group-card-muted {
          opacity: 0.78;
          filter: none;
        }

        :root[data-ui-mode='light'] .monday-operations-shell,
        :root[data-ui-mode='light'] .monday-command-panel,
        :root[data-ui-mode='light'] .monday-decision-card,
        :root[data-ui-mode='light'] .monday-focus-card,
        :root[data-ui-mode='light'] .interactive-kpi-card,
        :root[data-ui-mode='light'] .ranking-row,
        :root[data-ui-mode='light'] .weekly-time-row,
        :root[data-ui-mode='light'] .weekly-time-owner-row,
        :root[data-ui-mode='light'] .data-table thead th,
        :root[data-ui-mode='light'] .data-table tbody td {
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .monday-command-panel,
        :root[data-ui-mode='light'] .monday-decision-card,
        :root[data-ui-mode='light'] .monday-focus-card,
        :root[data-ui-mode='light'] .interactive-kpi-card,
        :root[data-ui-mode='light'] .ranking-row,
        :root[data-ui-mode='light'] .weekly-time-row,
        :root[data-ui-mode='light'] .weekly-time-owner-row,
        :root[data-ui-mode='light'] .practice-card,
        :root[data-ui-mode='light'] .pipeline-column-metrics div,
        :root[data-ui-mode='light'] .integration-block {
          background: rgba(248, 250, 252, 0.92);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .monday-command-panel {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(248, 250, 252, 0.96)),
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent-blue) 10%, transparent), transparent 36%);
        }

        :root[data-ui-mode='light'] .monday-command-copy h3,
        :root[data-ui-mode='light'] .monday-decision-value,
        :root[data-ui-mode='light'] .monday-focus-value,
        :root[data-ui-mode='light'] .ranking-row strong,
        :root[data-ui-mode='light'] .ranking-row b,
        :root[data-ui-mode='light'] .weekly-time-copy strong,
        :root[data-ui-mode='light'] .weekly-time-row b,
        :root[data-ui-mode='light'] .weekly-time-owner-row strong,
        :root[data-ui-mode='light'] .practice-card strong,
        :root[data-ui-mode='light'] .pipeline-column-card strong,
        :root[data-ui-mode='light'] .pipeline-column-metrics b {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .monday-command-copy p,
        :root[data-ui-mode='light'] .monday-command-filter small,
        :root[data-ui-mode='light'] .monday-decision-title,
        :root[data-ui-mode='light'] .monday-decision-details span,
        :root[data-ui-mode='light'] .monday-focus-helper,
        :root[data-ui-mode='light'] .ranking-row span,
        :root[data-ui-mode='light'] .ranking-metrics span,
        :root[data-ui-mode='light'] .ranking-inline-note,
        :root[data-ui-mode='light'] .weekly-time-copy span,
        :root[data-ui-mode='light'] .weekly-time-owner-row span,
        :root[data-ui-mode='light'] .practice-card span,
        :root[data-ui-mode='light'] .pipeline-column-card span,
        :root[data-ui-mode='light'] .pipeline-column-metrics small {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .monday-command-kicker,
        :root[data-ui-mode='light'] .monday-decision-eyebrow,
        :root[data-ui-mode='light'] .monday-focus-title {
          color: var(--accent-blue);
        }

        :root[data-ui-mode='light'] .interactive-kpi-card .kpi-title,
        :root[data-ui-mode='light'] .interactive-kpi-card .kpi-value,
        :root[data-ui-mode='light'] .interactive-kpi-card .interactive-kpi-action span,
        :root[data-ui-mode='light'] .interactive-kpi-card .interactive-kpi-action i {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .interactive-kpi-card .kpi-trend span,
        :root[data-ui-mode='light'] .interactive-kpi-preview-item {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .interactive-kpi-card-active {
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 6%, white), rgba(255, 255, 255, 0.98)),
            rgba(255, 255, 255, 0.98);
        }

        :root[data-ui-mode='light'] .interactive-kpi-card-disabled {
          background: rgba(248, 250, 252, 0.88);
        }

        :root[data-ui-mode='light'] .ranking-task-chip,
        :root[data-ui-mode='light'] .data-table,
        :root[data-ui-mode='light'] .data-table thead th,
        :root[data-ui-mode='light'] .data-table tbody td {
          background: transparent;
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .data-table thead th {
          color: rgba(71, 85, 105, 0.9);
        }

        :root[data-ui-mode='light'] .data-table tbody td {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .data-table tbody td.campaign-name {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .ranking-empty {
          color: var(--text-secondary);
          border-color: rgba(15, 23, 42, 0.1);
          background: rgba(248, 250, 252, 0.72);
        }

        :root[data-ui-mode='light'] .home-hub-hero-obsidian,
        :root[data-ui-mode='light'] .management-hero,
        :root[data-ui-mode='light'] .clients-intro,
        :root[data-ui-mode='light'] .clients-hero-main,
        :root[data-ui-mode='light'] .hero-panel,
        :root[data-ui-mode='light'] .grouped-results,
        :root[data-ui-mode='light'] .monday-operations-shell,
        :root[data-ui-mode='light'] .monday-command-panel,
        :root[data-ui-mode='light'] .meta-filter-panel,
        :root[data-ui-mode='light'] .management-directory-card,
        :root[data-ui-mode='light'] .client-group-card,
        :root[data-ui-mode='light'] .home-tools-menu,
        :root[data-ui-mode='light'] .home-tools-link,
        :root[data-ui-mode='light'] .clients-metric-card,
        :root[data-ui-mode='light'] .management-stat-card {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.98)) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06) !important;
        }

        :root[data-ui-mode='light'] .home-hub-hero-obsidian {
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--panel-bg-tint) 16%, transparent) 0%, transparent 34%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.96)) !important;
        }

        :root[data-ui-mode='light'] .clients-metric-card-live,
        :root[data-ui-mode='light'] .management-stat-card-live {
          background:
            linear-gradient(180deg, rgba(240, 253, 244, 0.96), rgba(236, 253, 245, 0.98)) !important;
          border-color: rgba(34, 197, 94, 0.16) !important;
        }

        :root[data-ui-mode='light'] .clients-metric-card-score,
        :root[data-ui-mode='light'] .management-stat-card-score {
          background:
            linear-gradient(180deg, rgba(240, 253, 244, 0.96), rgba(236, 253, 245, 0.98)) !important;
          border-color: rgba(16, 185, 129, 0.18) !important;
        }

        :root[data-ui-mode='light'] .home-tools-menu {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.98)) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06) !important;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        :root[data-ui-mode='light'] .home-tools-link {
          background: rgba(255, 255, 255, 0.86) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05) !important;
        }

        :root[data-ui-mode='light'] .home-tools-link:hover,
        :root[data-ui-mode='light'] .home-tools-link.active {
          background:
            linear-gradient(180deg, rgba(240, 249, 255, 0.98), rgba(239, 246, 255, 0.98)) !important;
          border-color: color-mix(in srgb, var(--accent-blue) 28%, rgba(15, 23, 42, 0.08)) !important;
        }

        :root[data-ui-mode='light'] .sidebar-toggle {
          background: rgba(255, 255, 255, 0.88) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          color: #0f172a !important;
          box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08) !important;
        }

        :root[data-ui-mode='light'] .sidebar-toggle:hover {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.98)) !important;
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08)) !important;
          color: #0f172a !important;
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.1) !important;
        }

        :root[data-ui-mode='light'] .home-tools-link strong,
        :root[data-ui-mode='light'] .management-hero h2,
        :root[data-ui-mode='light'] .hero-panel h2,
        :root[data-ui-mode='light'] .monday-command-copy h3,
        :root[data-ui-mode='light'] .page-title h1 {
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .home-tools-link span,
        :root[data-ui-mode='light'] .management-hero p,
        :root[data-ui-mode='light'] .hero-panel p,
        :root[data-ui-mode='light'] .monday-command-copy p,
        :root[data-ui-mode='light'] .monday-command-filter small,
        :root[data-ui-mode='light'] .page-title p {
          color: #475569 !important;
        }

        :root[data-ui-mode='light'] .home-hub-kicker,
        :root[data-ui-mode='light'] .management-hero-kicker,
        :root[data-ui-mode='light'] .meta-filter-kicker,
        :root[data-ui-mode='light'] .monday-command-kicker,
        :root[data-ui-mode='light'] .monday-decision-eyebrow,
        :root[data-ui-mode='light'] .monday-focus-title {
          color: color-mix(in srgb, var(--accent-blue) 72%, #1d4ed8 28%) !important;
        }

        :root[data-ui-mode='light'] .client-create-bar,
        :root[data-ui-mode='light'] .users-toolbar-card,
        :root[data-ui-mode='light'] .client-activity-card,
        :root[data-ui-mode='light'] .client-security-card,
        :root[data-ui-mode='light'] .client-intelligence-feature,
        :root[data-ui-mode='light'] .user-directory-card,
        :root[data-ui-mode='light'] .client-group-card,
        :root[data-ui-mode='light'] .hero-stat,
        :root[data-ui-mode='light'] .operations-meta-card,
        :root[data-ui-mode='light'] .operations-filter-card,
        :root[data-ui-mode='light'] .operations-spotlight-card {
          background: rgba(255, 255, 255, 0.9) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
        }

        :root[data-ui-mode='light'] .client-spotlight-copy strong,
        :root[data-ui-mode='light'] .client-spotlight-grid p,
        :root[data-ui-mode='light'] .user-directory-main strong,
        :root[data-ui-mode='light'] .hero-stat strong,
        :root[data-ui-mode='light'] .operations-meta-value,
        :root[data-ui-mode='light'] .operations-filter-value,
        :root[data-ui-mode='light'] .operations-spotlight-value {
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .client-spotlight-copy span,
        :root[data-ui-mode='light'] .client-spotlight-grid small,
        :root[data-ui-mode='light'] .user-directory-main span,
        :root[data-ui-mode='light'] .user-directory-meta small,
        :root[data-ui-mode='light'] .hero-stat span,
        :root[data-ui-mode='light'] .operations-meta-label,
        :root[data-ui-mode='light'] .operations-filter-label,
        :root[data-ui-mode='light'] .operations-filter-help,
        :root[data-ui-mode='light'] .operations-spotlight-label,
        :root[data-ui-mode='light'] .operations-spotlight-help {
          color: #64748b !important;
        }

        :root[data-ui-mode='light'] .hero-panel,
        :root[data-ui-mode='light'] .grouped-results,
        :root[data-ui-mode='light'] .monday-operations-shell {
          padding: 24px;
        }

        :root[data-ui-mode='light'] .sidebar-collapsed :global(.nav-item)::after {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.98)) !important;
          color: #0f172a !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12) !important;
        }

        :root[data-ui-mode='light'] .sidebar-collapsed :global(.nav-item:hover)::after {
          opacity: 1;
          transform: translateY(-50%) translateX(4px);
        }

        :root[data-ui-mode='light'] .home-hub-hero,
        :root[data-ui-mode='light'] .home-hub-hero-obsidian,
        :root[data-ui-mode='light'] .clients-intro,
        :root[data-ui-mode='light'] .clients-hero-main,
        :root[data-ui-mode='light'] .monday-operations-shell,
        :root[data-ui-mode='light'] .monday-command-panel,
        :root[data-ui-mode='light'] .hero-panel,
        :root[data-ui-mode='light'] .meta-filter-panel,
        :root[data-ui-mode='light'] .grouped-results {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98)) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 22px 44px rgba(15, 23, 42, 0.06) !important;
        }

        :root[data-ui-mode='light'] .clients-metric-card,
        :root[data-ui-mode='light'] .client-create-bar,
        :root[data-ui-mode='light'] .management-directory-card,
        :root[data-ui-mode='light'] .client-activity-card,
        :root[data-ui-mode='light'] .client-security-card,
        :root[data-ui-mode='light'] .client-group-card,
        :root[data-ui-mode='light'] .management-stat-card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.98)) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.05) !important;
        }

        :root[data-ui-mode='light'] .hero-stat,
        :root[data-ui-mode='light'] .operations-meta-card,
        :root[data-ui-mode='light'] .operations-filter-card,
        :root[data-ui-mode='light'] .operations-spotlight-card {
          background: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
        }

        :root[data-ui-mode='light'] .monday-command-panel select,
        :root[data-ui-mode='light'] .hero-select,
        :root[data-ui-mode='light'] .client-create-inline input,
        :root[data-ui-mode='light'] .search-box input,
        :root[data-ui-mode='light'] .compact-filter select {
          background: rgba(255, 255, 255, 0.98) !important;
          color: #0f172a !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
        }

        :root[data-ui-mode='light'] .monday-command-panel h2,
        :root[data-ui-mode='light'] .monday-command-panel h3,
        :root[data-ui-mode='light'] .hero-panel h2,
        :root[data-ui-mode='light'] .meta-filter-panel-head h2,
        :root[data-ui-mode='light'] .management-directory-card h3,
        :root[data-ui-mode='light'] .client-create-bar h3,
        :root[data-ui-mode='light'] .clients-metric-card strong,
        :root[data-ui-mode='light'] .management-stat-card strong {
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .monday-command-panel p,
        :root[data-ui-mode='light'] .hero-panel p,
        :root[data-ui-mode='light'] .meta-filter-panel p,
        :root[data-ui-mode='light'] .management-directory-card p,
        :root[data-ui-mode='light'] .client-create-bar p,
        :root[data-ui-mode='light'] .clients-metric-card span,
        :root[data-ui-mode='light'] .management-stat-card span,
        :root[data-ui-mode='light'] .management-stat-card small,
        :root[data-ui-mode='light'] .clients-metric-card small {
          color: #475569 !important;
        }

        @media (max-width: 1100px) {
          .home-hub-lower-grid {
            grid-template-columns: 1fr;
          }

          .home-hub-analytics-metrics {
            grid-template-columns: 1fr;
          }
        }

        .source-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .source-section-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding: 0 15px;
          border-radius: 999px;
          border: 1px solid currentColor;
          background: rgba(255, 255, 255, 0.025);
          font-weight: 700;
        }

        .source-section-badge i {
          font-size: 20px;
        }

        .source-section-copy {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          text-align: right;
          max-width: 520px;
        }

        .hero-stat {
          padding: 18px;
          border-radius: 16px;
          background: rgba(11, 13, 19, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .hero-stat-empty {
          min-height: 96px;
          align-content: center;
        }

        .hero-stat span {
          display: block;
          color: var(--text-muted);
          font-size: 12px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .hero-stat strong {
          font-size: 20px;
          line-height: 1.2;
        }

        .hero-select-wrap {
          margin-top: 4px;
        }

        .hero-select {
          width: 100%;
          min-height: 46px;
          padding: 0 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
          font: inherit;
          outline: none;
        }

        .feedback-banner,
        .empty-panel {
          padding: 24px;
          margin-bottom: 24px;
        }

        .feedback-banner {
          border: 1px solid rgba(245, 158, 11, 0.32);
          background: rgba(245, 158, 11, 0.1);
          color: #fde68a;
          border-radius: 16px;
        }

        .empty-panel {
          text-align: center;
        }

        .empty-panel h3 {
          margin-bottom: 8px;
          font-size: 22px;
        }

        .empty-panel p {
          color: var(--text-secondary);
          margin-bottom: 18px;
        }

        .chart-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .chart-header-stack,
        .section-header-stack {
          align-items: flex-start;
          gap: 16px;
        }

        .campaigns-section .section-header-stack {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .section-header-with-action {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .intro-list {
          margin-top: 18px;
          padding-left: 18px;
          color: var(--text-primary);
          display: grid;
          gap: 10px;
        }

        .form-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .funnel-section {
          padding: 24px;
          margin-bottom: 24px;
        }

        .grouped-results {
          padding: 24px;
          margin-bottom: 24px;
        }

        .operations-hero-card {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
          gap: 18px;
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
            rgba(8, 12, 22, 0.66);
        }

        .operations-hero-copy {
          display: grid;
          gap: 8px;
          align-content: start;
        }

        .operations-hero-kicker {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .operations-hero-copy h3 {
          font-size: 24px;
          line-height: 1.15;
        }

        .operations-hero-copy p {
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 720px;
        }

        .operations-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .operations-meta-card {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.03);
          display: grid;
          gap: 6px;
          align-content: start;
          min-width: 0;
        }

        .operations-meta-label,
        .operations-meta-value,
        .operations-filter-label,
        .operations-filter-value,
        .operations-filter-help,
        .operations-spotlight-label,
        .operations-spotlight-value,
        .operations-spotlight-help {
          margin: 0;
        }

        .operations-meta-label {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.4;
        }

        .operations-meta-value {
          font-size: 22px;
          line-height: 1.1;
          font-weight: 700;
          word-break: break-word;
        }

        .operations-kpi-shell {
          margin-bottom: 24px;
        }

        .operations-rankings-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .operations-filter-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .operations-filter-card {
          display: grid;
          gap: 8px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.03);
          align-content: start;
          min-width: 0;
        }

        .operations-filter-label,
        .operations-spotlight-label {
          color: var(--text-muted);
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .operations-filter-label {
          display: block;
        }

        .operations-filter-value {
          font-size: 18px;
          line-height: 1.2;
          font-weight: 700;
          word-break: break-word;
        }

        .operations-filter-help {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .operations-spotlight-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .operations-spotlight-card {
          display: grid;
          gap: 8px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.03);
          align-content: start;
          min-width: 0;
        }

        .operations-spotlight-value {
          font-size: 22px;
          line-height: 1.18;
          font-weight: 700;
          word-break: break-word;
        }

        .operations-spotlight-help {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .template-metrics-shell {
          display: grid;
          gap: 16px;
          margin-bottom: 24px;
        }

        .template-metrics-grid {
          margin-top: 0;
        }

        .template-metric-card {
          gap: 0;
        }

        .dashboard-metrics-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 18px;
        }

        .dashboard-metric-card {
          min-width: 0;
        }

        .dashboard-metric-card-sm {
          grid-column: span 3;
        }

        .dashboard-metric-card-lg {
          grid-column: span 6;
        }

        .template-metric-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
        }

        .template-metric-remove {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }

        .template-metric-remove:hover {
          background: rgba(248, 113, 113, 0.12);
          border-color: rgba(248, 113, 113, 0.3);
          color: #fecaca;
          transform: scale(1.04);
        }

        .metric-library-panel {
          padding: 18px;
          border-radius: 18px;
          display: grid;
          gap: 14px;
        }

        .metric-library-anchor {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
        }

        .metric-library-inline-trigger {
          flex: 0 0 auto;
        }

        .metric-library-dropdown {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          width: min(860px, calc(100vw - 72px));
          z-index: 40;
          box-shadow: 0 24px 48px rgba(2, 8, 23, 0.38);
        }

        .metric-library-inline-panel {
          margin-top: 16px;
        }

        .metric-library-panel strong {
          display: block;
          margin-bottom: 4px;
        }

        .metric-library-panel p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .metric-library-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .metric-library-chip {
          min-width: 220px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px dashed rgba(59, 130, 246, 0.38);
          background: rgba(15, 23, 42, 0.6);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          display: grid;
          gap: 4px;
          flex: 1 1 220px;
        }

        .metric-library-chip.active {
          border-style: solid;
          border-color: rgba(96, 165, 250, 0.52);
          background: rgba(59, 130, 246, 0.14);
          box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.12);
        }

        .metric-library-chip span {
          font-weight: 700;
        }

        .metric-library-chip small,
        .metric-library-empty {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .metric-library-empty {
          font-size: 13px;
        }

        .metric-library-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .metric-library-grid-compact {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .metric-library-card {
          width: 100%;
          text-align: left;
          color: inherit;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .metric-library-card-compact {
          min-height: 0;
          padding: 18px;
          gap: 10px;
        }

        .metric-library-card-compact .kpi-value {
          font-size: 32px;
          line-height: 1.05;
        }

        .metric-library-card:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.28);
          background: rgba(59, 130, 246, 0.06);
        }

        .metric-library-add-icon {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(59, 130, 246, 0.24);
          background: rgba(59, 130, 246, 0.08);
          color: #bfdbfe;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .meta-summary-grid {
          align-items: stretch;
        }

        .meta-summary-card,
        .meta-summary-add-card {
          min-height: 210px;
        }

        .meta-summary-add-card {
          border: 1px dashed rgba(96, 165, 250, 0.36);
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.08), rgba(15, 23, 42, 0.28)),
            rgba(255, 255, 255, 0.02);
          align-items: flex-start;
          justify-content: center;
          text-align: left;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .meta-summary-add-card:hover {
          transform: translateY(-2px);
          border-color: rgba(96, 165, 250, 0.5);
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.14), rgba(15, 23, 42, 0.34)),
            rgba(255, 255, 255, 0.03);
        }

        .meta-summary-add-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          margin-bottom: 10px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(96, 165, 250, 0.24);
          color: #bfdbfe;
          font-size: 22px;
        }

        .meta-summary-add-card strong {
          font-size: 18px;
          line-height: 1.2;
          margin-bottom: 6px;
        }

        .meta-summary-add-card span {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .meta-filter-panel {
          padding: 20px 24px;
          margin-bottom: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.015)),
            rgba(8, 12, 22, 0.6);
        }

        .meta-filter-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 16px;
        }

        .meta-filter-panel-head h2 {
          font-size: 26px;
          margin-bottom: 6px;
        }

        .meta-filter-kicker {
          display: inline-block;
          margin-bottom: 8px;
          color: #60a5fa;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .meta-filter-helper {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
          white-space: nowrap;
          padding-top: 22px;
        }

        .floating-filter-apply {
          position: fixed;
          top: 72%;
          right: 24px;
          transform: translateY(-50%);
          z-index: 220;
          min-width: 168px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 18px;
          border: 1px solid rgba(59, 130, 246, 0.34);
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.18), rgba(15, 23, 42, 0.94)),
            rgba(15, 23, 42, 0.96);
          box-shadow: 0 18px 42px rgba(2, 8, 23, 0.45);
          color: #eff6ff;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .floating-filter-apply:hover:not(:disabled) {
          transform: translateY(calc(-50% - 2px));
          box-shadow: 0 22px 48px rgba(2, 8, 23, 0.52);
        }

        .floating-filter-apply:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .meta-filter-chip-row {
          padding-top: 2px;
        }

        .meta-campaign-filter-collapsible {
          margin-top: 18px;
        }

        .meta-campaign-filter-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
          color: inherit;
          text-align: left;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .meta-campaign-filter-trigger:hover,
        .meta-campaign-filter-trigger.open {
          border-color: rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.06);
        }

        .meta-campaign-filter-trigger h3 {
          margin: 0 0 4px;
          font-size: 17px;
        }

        .meta-campaign-filter-trigger p {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .meta-campaign-filter-trigger-icon {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.04);
          color: #dbeafe;
          flex-shrink: 0;
        }

        .meta-campaign-filter-trigger-icon i {
          font-size: 20px;
        }

        .meta-campaign-filter-note {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .rd-source-filter-bar {
          display: grid;
          gap: 14px;
          margin-bottom: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .rd-source-filter-inline {
          margin-top: 18px;
        }

        .rd-source-filter-bar h3 {
          margin-bottom: 6px;
          font-size: 16px;
        }

        .rd-source-filter-bar p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .result-group {
          margin-top: 10px;
        }

        .result-group-head {
          margin-bottom: 16px;
        }

        .result-group-head h3 {
          font-size: 18px;
          margin-bottom: 4px;
        }

        .result-group-head p {
          color: var(--text-muted);
          font-size: 13px;
        }

        .compact-kpi-grid {
          margin-bottom: 0;
        }

        .conversion-groups-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          margin-top: 20px;
        }

        .crm-groups-grid {
          display: grid;
          gap: 18px;
          margin-top: 18px;
        }

        .crm-result-group {
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
        }

        .rd-source-filter-collapsible {
          margin-top: 12px;
          margin-bottom: 12px;
        }

        .rd-source-filter-collapsible + .compact-kpi-grid {
          margin-top: 0;
        }

        .rd-source-list {
          display: grid;
          gap: 10px;
        }

        .rd-source-list-item {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 16px;
        }

        .rd-source-list-item span {
          line-height: 1.45;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .rd-diagnostic-panel {
          margin-top: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .rd-diagnostic-head {
          margin-bottom: 14px;
        }

        .rd-diagnostic-head h4 {
          font-size: 16px;
          margin-bottom: 4px;
        }

        .rd-diagnostic-head p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .rd-diagnostic-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .rd-diagnostic-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          margin-top: 14px;
          color: var(--text-muted);
          font-size: 12px;
        }

        .rd-diagnostic-meta b {
          color: var(--text-main);
          font-weight: 700;
        }

        .conversion-group-card {
          padding: 22px;
          display: grid;
          gap: 16px;
          align-content: start;
          transition: opacity 0.2s ease, filter 0.2s ease, border-color 0.2s ease;
        }

        .conversion-group-card-active {
          opacity: 1;
        }

        .conversion-group-card-muted {
          opacity: 0.58;
          filter: saturate(0.82);
        }

        .conversion-group-head {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 18px;
        }

        .conversion-group-head h3 {
          font-size: 20px;
          margin-bottom: 6px;
        }

        .conversion-group-head p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .conversion-stats {
          display: grid;
          gap: 12px;
        }

        .conversion-group-footer {
          margin-top: auto;
          display: flex;
          justify-content: flex-end;
        }

        .conversion-group-secondary-trigger {
          min-height: 40px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }

        .conversion-group-secondary-trigger:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.28);
          background: rgba(59, 130, 246, 0.06);
          color: var(--text-primary);
        }

        .conversion-group-actions {
          margin-top: auto;
          display: flex;
          justify-content: flex-start;
        }

        .conversion-group-expand {
          min-height: 42px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .meta-result-preview-panel {
          margin-top: 22px;
          padding: 24px;
          display: grid;
          gap: 18px;
        }

        .meta-secondary-result-modal {
          width: min(640px, calc(100vw - 32px));
          display: grid;
          gap: 18px;
        }

        .meta-secondary-result-summary,
        .meta-secondary-result-item {
          padding: 18px 20px;
        }

        .meta-secondary-result-summary {
          display: grid;
          gap: 6px;
        }

        .meta-secondary-result-summary strong {
          font-size: 28px;
          line-height: 1;
        }

        .meta-secondary-result-summary span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .meta-secondary-result-list {
          display: grid;
          gap: 12px;
        }

        .meta-secondary-result-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .meta-secondary-result-item div {
          display: grid;
          gap: 4px;
        }

        .meta-secondary-result-item strong {
          line-height: 1.2;
        }

        .meta-secondary-result-item span {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.45;
        }

        .meta-secondary-result-item b {
          font-size: 26px;
          line-height: 1;
          white-space: nowrap;
        }

        .meta-result-preview-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .meta-result-preview-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .meta-result-preview-head h3 {
          font-size: 24px;
          margin: 6px 0;
        }

        .meta-result-preview-head p {
          color: var(--text-muted);
          line-height: 1.55;
          max-width: 760px;
        }

        .meta-result-preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .meta-result-preview-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .meta-result-preview-tab {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
        }

        .meta-result-preview-tab-muted {
          opacity: 0.46;
        }

        .meta-result-preview-tab.active {
          border-color: var(--accent-blue);
          background: rgba(59, 130, 246, 0.12);
          color: var(--text-primary);
          opacity: 1;
        }

        .meta-result-summary-inline {
          margin-top: 2px;
        }

        .meta-result-inline-chart-wrapper {
          min-height: 340px;
        }

        .conversion-stat {
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .conversion-stat span {
          display: block;
          color: var(--text-muted);
          font-size: 12px;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .conversion-stat strong {
          font-size: 26px;
          line-height: 1.1;
        }

        .funnel-builder {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 18px;
          margin-top: 16px;
        }

        .funnel-library,
        .funnel-dropzone {
          padding: 20px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .funnel-library h3 {
          font-size: 16px;
          margin-bottom: 14px;
        }

        .funnel-chip-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .funnel-chip {
          border: 1px dashed rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 999px;
          padding: 10px 14px;
          cursor: grab;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
        }

        .funnel-steps {
          display: grid;
          gap: 10px;
        }

        .funnel-step {
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
          cursor: grab;
        }

        .funnel-step strong {
          font-size: 26px;
          display: block;
          margin-top: 10px;
        }

        .funnel-step-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .funnel-step-label {
          color: var(--text-secondary);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .funnel-remove {
          background: transparent;
          border: none;
          color: #fda4af;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
        }

        .funnel-connector {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 8px 0;
          color: var(--accent-emerald);
          font-size: 13px;
          font-weight: 600;
        }

        .funnel-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          border: 1px dashed rgba(255, 255, 255, 0.14);
          border-radius: 16px;
          text-align: center;
          padding: 20px;
        }

        .rankings-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .rankings-grid.meta-rankings-stack {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .rankings-grid.meta-rankings-stack > .meta-ranking-card {
          width: 100%;
        }

        .ranking-card {
          padding: 24px;
        }

        .meta-ranking-card {
          padding: 22px;
        }

        .geo-map-panel {
          margin-top: 14px;
        }

        .brazil-map-shell {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.7fr);
          gap: 18px;
          align-items: start;
        }

        .brazil-map-stage {
          position: relative;
          min-height: 460px;
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background:
            radial-gradient(circle at 35% 28%, rgba(59, 130, 246, 0.16), transparent 28%),
            radial-gradient(circle at 70% 68%, rgba(16, 185, 129, 0.12), transparent 30%),
            rgba(255, 255, 255, 0.025);
          overflow: hidden;
          isolation: isolate;
        }

        .brazil-map-silhouette {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(72%, 520px);
          height: auto;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 26px 38px rgba(8, 15, 30, 0.38));
          opacity: 0.98;
        }

        .brazil-map-silhouette path {
          fill: rgba(148, 163, 184, 0.16);
          stroke: rgba(148, 163, 184, 0.5);
          stroke-width: 2.4;
          stroke-linejoin: round;
          stroke-linecap: round;
        }

        .brazil-map-stage::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 46% 40%, rgba(148, 163, 184, 0.08), transparent 28%),
            radial-gradient(circle at 55% 58%, rgba(var(--client-accent-rgb), 0.08), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 28%);
          pointer-events: none;
          z-index: 0;
        }

        .brazil-state-node,
        .brazil-city-node {
          position: absolute;
          transform: translate(-50%, -50%);
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          cursor: pointer;
          z-index: 1;
        }

        .brazil-state-node {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.86);
          border: 1px solid rgba(96, 165, 250, calc(0.3 + (var(--state-intensity, 0.3) * 0.45)));
          box-shadow:
            0 0 0 6px rgba(59, 130, 246, calc(var(--state-intensity, 0.3) * 0.16)),
            0 18px 28px rgba(2, 8, 23, 0.34);
        }

        .brazil-state-node.is-top-performer {
          background: rgba(var(--client-accent-rgb), 0.18);
          border-color: rgba(var(--client-accent-rgb), calc(0.58 + (var(--state-intensity, 0.3) * 0.22)));
          box-shadow:
            0 0 0 7px rgba(var(--client-accent-rgb), 0.18),
            0 0 26px rgba(var(--client-accent-rgb), 0.26),
            0 18px 28px rgba(2, 8, 23, 0.34);
        }

        .brazil-state-node span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: rgba(239, 246, 255, calc(0.72 + (var(--state-intensity, 0.3) * 0.28)));
        }

        .brazil-state-node.is-top-performer span {
          color: rgba(255, 255, 255, 0.96);
        }

        .brazil-city-node {
          min-width: 10px;
          min-height: 10px;
        }

        .brazil-city-node::before {
          content: '';
          display: block;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: rgba(250, 204, 21, 0.94);
          box-shadow:
            0 0 0 7px rgba(250, 204, 21, calc(var(--city-intensity, 0.3) * 0.16)),
            0 0 18px rgba(250, 204, 21, calc(var(--city-intensity, 0.3) * 0.42));
        }

        .brazil-city-node span {
          position: absolute;
          left: 14px;
          top: -4px;
          white-space: nowrap;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          font-size: 11px;
          font-weight: 600;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.18s ease;
        }

        .brazil-city-node:hover span,
        .brazil-city-node:focus-visible span {
          opacity: 1;
        }

        .brazil-map-legend {
          display: grid;
          gap: 14px;
        }

        .brazil-map-legend-card {
          padding: 18px;
          display: grid;
          gap: 12px;
        }

        .brazil-map-legend-card strong {
          font-size: 16px;
        }

        .brazil-map-legend-list {
          display: grid;
          gap: 10px;
        }

        .brazil-map-legend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .brazil-map-legend-row.is-top-performer {
          background: rgba(var(--client-accent-rgb), 0.14);
          border-color: rgba(var(--client-accent-rgb), 0.36);
          box-shadow: 0 0 0 1px rgba(var(--client-accent-rgb), 0.12) inset;
        }

        .brazil-map-legend-row span {
          color: var(--text-secondary);
          line-height: 1.35;
        }

        .brazil-map-legend-row b {
          white-space: nowrap;
        }

        .brazil-map-legend-row-action {
          width: 100%;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.18s ease, background 0.18s ease;
        }

        .brazil-map-legend-row-action:hover {
          border-color: rgba(96, 165, 250, 0.26);
          background: rgba(59, 130, 246, 0.06);
        }

        .ranking-list {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .meta-ranking-layer-stack {
          display: grid;
          gap: 22px;
          margin-top: 14px;
        }

        .meta-ranking-layer-section {
          display: grid;
          gap: 14px;
        }

        .meta-ranking-layer-section + .meta-ranking-layer-section {
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .meta-ranking-layer-head {
          display: grid;
          gap: 4px;
        }

        .meta-ranking-layer-head h3 {
          font-size: 18px;
        }

        .meta-ranking-layer-head p {
          color: var(--text-muted);
          line-height: 1.5;
          font-size: 13px;
        }

        .ranking-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .ranking-row-action {
          width: 100%;
          text-align: left;
          color: inherit;
          font: inherit;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .ranking-row-action:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.28);
          background: rgba(59, 130, 246, 0.06);
        }

        .ranking-row-action:focus-visible {
          outline: 2px solid rgba(96, 165, 250, 0.9);
          outline-offset: 2px;
        }

        .meta-ranking-row {
          align-items: center;
          gap: 18px;
          padding: 16px 18px;
        }

        .ranking-row strong {
          display: block;
          margin-bottom: 4px;
          line-height: 1.2;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .creative-ranking-main {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .creative-ranking-main > div:last-child {
          min-width: 0;
          flex: 1;
        }

        .creative-thumb {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          font-size: 11px;
          text-align: center;
          padding: 6px;
        }

        .creative-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .ranking-row span {
          color: var(--text-muted);
          font-size: 12px;
        }

        .ranking-row b {
          font-size: 14px;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .ranking-row-rich {
          align-items: center;
        }

        .ranking-main-column {
          min-width: 0;
          display: grid;
          gap: 8px;
        }

        .meta-ranking-main-column {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .meta-ranking-main-column strong {
          margin-bottom: 0;
        }

        .meta-ranking-main-column span {
          white-space: nowrap;
        }

        .ranking-metrics {
          display: grid;
          gap: 4px;
          text-align: right;
          min-width: 180px;
        }

        .meta-ranking-metrics {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
          min-width: 0;
          margin-left: auto;
          text-align: left;
        }

        .ranking-metrics span {
          color: var(--text-muted);
          font-size: 12px;
        }

        .ranking-metrics small {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 600;
        }

        .meta-ranking-metrics b,
        .meta-ranking-metrics span,
        .meta-ranking-metrics small {
          white-space: nowrap;
        }

        .meta-ranking-row-rich .creative-ranking-main {
          flex: 1;
        }

        .age-ranking-row {
          align-items: center;
          gap: 20px;
        }

        .age-ranking-main {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1;
        }

        .age-ranking-position {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(96, 165, 250, 0.2);
          color: #dbeafe;
          font-size: 14px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .age-ranking-copy {
          min-width: 0;
          flex: 1;
        }

        .age-ranking-title-row {
          justify-content: space-between;
        }

        .age-ranking-bar-track {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
        }

        .age-ranking-bar-fill {
          display: block;
          height: 100%;
          min-width: 14px;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.95), rgba(59, 130, 246, 0.95));
          box-shadow: 0 0 16px rgba(59, 130, 246, 0.26);
        }

        .age-ranking-tag {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          min-height: 24px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(96, 165, 250, 0.14);
          color: #bfdbfe;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .age-ranking-metrics {
          min-width: 220px;
        }

        .ranking-empty {
          color: var(--text-muted);
          padding: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          text-align: center;
        }

        .ranking-task-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .ranking-task-chip {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          font-size: 12px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ranking-inline-note {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.5;
        }

        .meta-ranking-inline-note {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.6;
        }

        .meta-ranking-inline-note strong {
          color: var(--text-primary);
        }

        .weekly-time-list {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }

        .weekly-time-row {
          display: grid;
          grid-template-columns: minmax(180px, 0.9fr) minmax(180px, 1.4fr) auto;
          gap: 14px;
          align-items: center;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .weekly-time-copy {
          display: grid;
          gap: 4px;
        }

        .weekly-time-copy strong {
          line-height: 1.2;
        }

        .weekly-time-copy span {
          color: var(--text-muted);
          font-size: 12px;
        }

        .weekly-time-bar-track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          overflow: hidden;
        }

        .weekly-time-bar-fill {
          display: block;
          height: 100%;
          min-width: 10px;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(59, 130, 246, 0.9), rgba(139, 92, 246, 0.9));
        }

        .weekly-time-row b {
          white-space: nowrap;
        }

        .weekly-time-row-detailed {
          align-items: start;
        }

        .weekly-time-owner-list {
          grid-column: 1 / -1;
          display: grid;
          gap: 8px;
          padding-top: 2px;
        }

        .weekly-time-owner-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .weekly-time-owner-row span {
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .weekly-time-owner-row strong {
          white-space: nowrap;
          font-size: 13px;
        }

        .practice-list {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }

        .practice-card {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.03);
        }

        .practice-card strong {
          color: var(--accent-blue);
        }

        .practice-card span {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .pipeline-columns-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }

        .sheets-preview-card {
          margin-top: 20px;
        }

        .pipeline-column-card {
          padding: 18px;
          border-radius: 18px;
          display: grid;
          gap: 16px;
        }

        .pipeline-column-card strong {
          display: block;
          font-size: 18px;
          margin-bottom: 6px;
          line-height: 1.25;
        }

        .pipeline-column-card span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .pipeline-column-metrics {
          display: grid;
          gap: 12px;
        }

        .pipeline-column-metrics div {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .pipeline-column-metrics small {
          display: block;
          color: var(--text-muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }

        .pipeline-column-metrics b {
          font-size: 22px;
          line-height: 1.1;
        }

        .campaign-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          justify-content: flex-end;
        }

        .campaigns-section-actions {
          display: grid;
          gap: 14px;
          width: 100%;
        }

        .campaigns-toolbar-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          gap: 12px;
        }

        .campaign-column-controls {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
        }

        .campaign-column-library {
          width: 100%;
          box-shadow: none;
        }

        .campaign-column-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }

        .campaign-column-chip {
          min-width: 0;
          width: 100%;
          flex: unset;
        }

        .compact-filter {
          min-width: 220px;
          flex: 0 0 auto;
        }

        .campaign-filters .search-box {
          width: 320px;
        }

        .integration-block {
          padding: 22px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .integration-heading {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .integration-icon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid;
          background: rgba(255, 255, 255, 0.03);
          font-size: 22px;
          flex-shrink: 0;
        }

        .integration-heading h3 {
          font-size: 18px;
          margin-bottom: 6px;
        }

        .integration-heading p {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .form-actions-space {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
        }

        .users-list {
          display: grid;
          gap: 18px;
        }

        .user-admin-card {
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
        }

        .user-admin-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 18px;
        }

        .user-admin-head strong {
          display: block;
          font-size: 18px;
          margin-bottom: 4px;
        }

        .user-admin-head span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .user-admin-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .user-list-compact {
          display: grid;
          gap: 16px;
        }

        .user-picker-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .user-picker-head span {
          min-width: 34px;
          height: 34px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .user-picker-list {
          display: grid;
          gap: 10px;
          max-height: 340px;
          overflow: auto;
        }

        .user-picker-item {
          width: 100%;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .user-picker-item.active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
          transform: translateY(-1px);
        }

        .user-picker-item strong {
          display: block;
          margin-bottom: 4px;
          font-size: 15px;
        }

        .user-picker-item span {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.4;
          display: block;
          overflow-wrap: anywhere;
        }

        .integration-helper {
          color: var(--text-muted);
          font-size: 13px;
        }

        .users-empty-state {
          min-height: 320px;
          margin-bottom: 0;
          display: grid;
          place-items: center;
        }

        .form-note {
          color: var(--text-muted);
          font-size: 13px;
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-group label {
          display: block;
          color: var(--text-secondary);
          font-size: 13px;
          margin-bottom: 8px;
        }

        .field-helper {
          margin: -2px 0 10px;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .form-alert {
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(245, 158, 11, 0.28);
          background: rgba(245, 158, 11, 0.08);
          color: #fde68a;
          font-size: 14px;
          line-height: 1.6;
        }

        .input-group input:not([type="checkbox"]):not([type="file"]) {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .client-select-input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
          appearance: none;
        }

        .input-group input[type="file"] {
          width: 100%;
          min-height: 48px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
          line-height: 1.3;
        }

        .input-group input:not([type="checkbox"]):focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .client-select-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .logo-preview {
          min-height: 120px;
          border-radius: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          display: grid;
          place-items: center;
          padding: 16px;
          color: var(--text-muted);
          overflow: hidden;
        }

        .logo-preview img {
          max-width: 100%;
          max-height: 90px;
          object-fit: contain;
        }

        .stage-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .qualification-config {
          margin-top: 8px;
        }

        .qualification-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          font: inherit;
        }

        .qualification-toggle strong {
          display: block;
          margin-bottom: 4px;
          font-size: 15px;
        }

        .qualification-toggle span {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .qualification-toggle i {
          font-size: 20px;
          color: var(--text-secondary);
          flex: 0 0 auto;
        }

        .qualification-panel {
          margin-top: 12px;
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .stage-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .stage-chip.active {
          border-color: color-mix(in srgb, var(--accent-blue) 55%, white 15%);
          background: color-mix(in srgb, var(--accent-blue) 16%, transparent);
          color: white;
        }

        .stage-chip input {
          width: 16px;
          height: 16px;
          margin: 0;
          min-height: 16px;
          padding: 0;
          border: none;
          background: transparent;
          flex: 0 0 16px;
          accent-color: var(--accent-blue);
        }

        .stage-chip span {
          font-size: 13px;
          line-height: 1.2;
        }

        .stage-empty {
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 1100px) {
          .hero-panel,
          .form-grid,
          .clients-grid,
          .users-grid,
          .branding-grid,
          .client-identity-layout,
          .funnel-builder,
          .rd-mini-funnel,
          .rankings-grid,
          .conversion-groups-grid,
          .operations-hero-card,
          .operations-filter-grid,
          .operations-spotlight-grid,
          .operations-meta-grid,
          .operations-rankings-grid {
            grid-template-columns: 1fr;
          }

          .weekly-time-row {
            grid-template-columns: 1fr;
          }

          .client-create-grid {
            flex-direction: column;
          }

          .client-create-bar,
          .client-create-inline {
            flex-direction: column;
            align-items: stretch;
          }

          .source-section-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .section-header-with-action {
            flex-direction: column;
            align-items: flex-start;
          }

          .campaigns-toolbar-row {
            flex-direction: column;
            align-items: stretch;
          }

          .campaign-column-controls,
          .campaign-column-controls .btn {
            width: 100%;
          }

          .source-section-copy {
            text-align: left;
            max-width: none;
          }

          .meta-filter-panel-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-filter-helper {
            white-space: normal;
            padding-top: 0;
          }

          .floating-filter-apply {
            top: auto;
            right: 16px;
            bottom: 16px;
            left: 16px;
            min-width: 0;
            transform: none;
          }

          .floating-filter-apply:hover:not(:disabled) {
            transform: translateY(-2px);
          }

          .user-directory-grid {
            grid-template-columns: 1fr;
          }

          .client-directory-grid {
            grid-template-columns: 1fr;
          }

          .client-groups-grid {
            grid-template-columns: 1fr;
          }

          .users-summary-chips {
            justify-content: flex-start;
            max-width: none;
          }

          .users-toolbar-actions,
          .modal-header {
            justify-content: flex-start;
          }

          .modal-card {
            padding: 20px;
          }

          .hero-logo-wrap {
            width: 108px;
            height: 108px;
          }

          .hero-panel h2 {
            font-size: 30px;
          }

          .dashboard-theme-presets {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-metrics-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }

          .dashboard-metric-card-sm,
          .dashboard-metric-card-lg {
            grid-column: span 3;
          }

          .metric-library-grid-compact {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .meta-result-preview-toolbar,
          .meta-result-preview-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-result-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ai-insights-grid,
          .ai-insights-highlight-grid,
          .ai-insights-grid-fallback {
            grid-template-columns: 1fr;
          }

          .ai-insights-context {
            justify-items: start;
          }

          .meta-ranking-body {
            grid-template-columns: 1fr;
          }

          .brazil-map-shell {
            grid-template-columns: 1fr;
          }

          .metric-library-anchor {
            width: 100%;
            align-items: stretch;
          }

          .metric-library-dropdown {
            position: static;
            width: 100%;
          }

          .metric-library-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .sidebar-collapsed {
            width: var(--sidebar-width);
          }

          .main-content-expanded {
            margin-left: 0;
          }

          .dashboard-color-preview-row {
            display: grid;
            grid-template-columns: 1fr;
          }

          .dashboard-rgb-grid,
          .dashboard-theme-presets,
          .dashboard-metrics-grid,
          .integration-management-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-metric-card-sm,
          .dashboard-metric-card-lg {
            grid-column: span 1;
          }

          .header-actions-wrap {
            width: 100%;
            justify-content: flex-start;
          }

          .metric-library-chip {
            min-width: 0;
            width: 100%;
          }

          .form-actions-space {
            flex-direction: column;
            align-items: flex-start;
          }

          .modal-actions {
            width: 100%;
            justify-content: stretch;
          }

          .modal-actions .btn {
            width: 100%;
          }

          .meta-result-toolbar,
          .meta-result-chart-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-result-summary {
            grid-template-columns: 1fr;
          }

          .ai-insights-meta {
            flex-direction: column;
            align-items: flex-start;
          }

          .ai-insights-summary-hero,
          .ai-insights-section-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-result-inline-chart-wrapper {
            min-height: 280px;
          }

          .meta-result-chart-wrapper {
            min-height: 300px;
          }

          .meta-ranking-chart-wrapper {
            min-height: 280px;
          }

          .meta-ranking-detail-stats {
            grid-template-columns: 1fr;
          }

          .ranking-row-action,
          .ranking-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .ranking-metrics {
            min-width: 0;
            text-align: left;
          }

          .meta-secondary-result-item {
            align-items: flex-start;
            flex-direction: column;
          }

          .age-ranking-main {
            width: 100%;
          }

          .age-ranking-metrics {
            min-width: 0;
            width: 100%;
          }

          .brazil-map-stage {
            min-height: 340px;
          }

          .brazil-city-node span {
            opacity: 1;
            position: static;
            display: inline-flex;
            margin-top: 6px;
            margin-left: 10px;
          }
        }
      `}</style>
    </div>
  )
}
