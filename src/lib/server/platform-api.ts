import 'server-only'

import type { ClientDetailResponse, ExecutiveOverviewResponse, HomeOverviewResponse, OperationsOverviewResponse } from '@/lib/types/platform'
import { getSupabaseClientDetail, getSupabaseExecutiveOverview, getSupabaseHomeOverview, getSupabaseOperationsOverview } from './supabase-platform'

const API_URL = process.env.PLATFORM_API_URL ?? 'http://localhost:4000/api'
const API_TOKEN = process.env.PLATFORM_API_TOKEN
const DEFAULT_TENANT_ID = process.env.PLATFORM_TENANT_ID ?? 'agency-hub'

async function request<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function getHomeOverview(): Promise<HomeOverviewResponse> {
  try {
    const supabaseResponse = await getSupabaseHomeOverview()
    if (supabaseResponse) {
      return supabaseResponse
    }
  } catch {}

  const response = await request<HomeOverviewResponse>(`/dashboards/home?tenantId=${DEFAULT_TENANT_ID}`)

  if (response) {
    return response
  }

  return {
    clientsCount: 1284,
    unresolvedAlerts: 12,
    activeTasks: 42,
    riskClients: [
      {
        id: 'mock-nebula',
        name: 'Nebula Media',
        companyName: 'Nebula Media',
        status: 'AT_RISK',
        healthScore: 24,
        churnScore: 84,
        alerts: [
          {
            type: 'LOW_ROI',
            severity: 'HIGH',
            description: 'Conversion rates dipped below benchmark for three straight weeks.',
          },
        ],
      },
    ],
  }
}

export async function getExecutiveOverview(): Promise<ExecutiveOverviewResponse> {
  try {
    const supabaseResponse = await getSupabaseExecutiveOverview()
    if (supabaseResponse) {
      return supabaseResponse
    }
  } catch {}

  const response = await request<ExecutiveOverviewResponse>(`/dashboards/executive?tenantId=${DEFAULT_TENANT_ID}`)

  if (response) {
    return response
  }

  return {
    totals: {
      revenue: 97600,
      investment: 84200,
      fee: 12000,
      averageRoi: 2.8,
      highRisk: 8,
    },
  }
}

export async function getOperationsOverview(): Promise<OperationsOverviewResponse> {
  try {
    const supabaseResponse = await getSupabaseOperationsOverview()
    if (supabaseResponse) {
      return supabaseResponse
    }
  } catch {}

  return {
    totals: {
      activeDemands: 42,
      criticalDemands: 8,
      warningDemands: 12,
      healthyDemands: 22,
      teamMembers: 18,
      completedTasks: 342,
      productivityVelocity: 84.2,
    },
    teamMembers: [
      { id: '1', fullName: 'Sarah Jenkins', role: 'Senior Strategist', performanceScore: 98 },
      { id: '2', fullName: 'Marcus Chen', role: 'Lead Developer', performanceScore: 94 },
      { id: '3', fullName: 'Alina Vosh', role: 'UI/UX Designer', performanceScore: 88 },
      { id: '4', fullName: 'Jordan Smith', role: 'Project Manager', performanceScore: 82 },
    ],
    tasks: [
      { id: '1', title: 'Client Q4 Audit', description: 'Portfolio A', priority: 'URGENT', status: 'OPEN', dueDate: '2023-10-24', clientName: 'Portfolio A' },
      { id: '2', title: 'API Middleware Sync', description: 'Internal Ops', priority: 'MEDIUM', status: 'OPEN', dueDate: '2023-10-28', clientName: null },
      { id: '3', title: 'Onboarding Assets', description: 'Creative', priority: 'LOW', status: 'OPEN', dueDate: '2023-11-02', clientName: null },
    ],
    recentActivity: [
      { tone: '#4744e5', text: 'Sarah Jenkins completed Q4 Design Specs', time: '2 mins ago' },
      { tone: '#00864d', text: 'New task added to Development Queue', time: '15 mins ago' },
      { tone: '#ba1a1a', text: 'Deadline alert triggered for Internal Audit', time: '1 hour ago' },
      { tone: '#5a5e6f', text: 'Weekly report exported by Alex', time: '3 hours ago' },
    ],
  }
}

export async function getClientDetail(clientId: string): Promise<ClientDetailResponse | null> {
  try {
    const supabaseResponse = await getSupabaseClientDetail(clientId)
    if (supabaseResponse) {
      return supabaseResponse
    }
  } catch {}

  return null
}
