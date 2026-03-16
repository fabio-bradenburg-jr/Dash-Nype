import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDashboardState, saveDashboardState } from '@/lib/server/dashboard-store'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const state = await getDashboardState(supabase, user.id)
    return NextResponse.json(state)
  } catch (error) {
    console.error('Dashboard state GET error:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o estado do dashboard.' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await request.json()
    const savedState = await saveDashboardState(supabase, user.id, body)

    return NextResponse.json(savedState)
  } catch (error) {
    console.error('Dashboard state PUT error:', error)
    return NextResponse.json({ error: 'Não foi possível salvar o estado do dashboard.' }, { status: 500 })
  }
}
