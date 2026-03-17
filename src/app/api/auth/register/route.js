import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'

export async function POST(request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '').trim()
    const fullName = String(body.fullName || '').trim()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Informe email e senha para criar a conta.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      userId: data.user?.id || null,
    })
  } catch (error) {
    console.error('Auth register error:', error)

    return NextResponse.json(
      { error: error.message || 'Não foi possível criar a conta.' },
      { status: 500 }
    )
  }
}
