import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, user, { adminSupabase })
  if (!accessContext.workspaceId) return { error: NextResponse.json({ error: 'Sem workspace.' }, { status: 403 }) }
  return { user, accessContext, adminSupabase }
}

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// GET: all completions for a given week across all GR users in workspace
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get('week_start') || getWeekStart()

    const { data, error } = await ctx.adminSupabase
      .from('gr_task_completions')
      .select('*')
      .eq('workspace_id', ctx.accessContext.workspaceId)
      .eq('week_start', weekStart)

    if (error) throw error

    return NextResponse.json({ completions: data || [], weekStart })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: toggle a task completion for a user+week
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error

    const body = await request.json()
    const userId = String(body.userId || ctx.user.id)
    const taskId = String(body.taskId || '').trim()
    const weekStart = String(body.weekStart || getWeekStart()).trim()
    const completed = Boolean(body.completed)

    if (!taskId) return NextResponse.json({ error: 'taskId obrigatório.' }, { status: 400 })

    if (completed) {
      const { error } = await ctx.adminSupabase
        .from('gr_task_completions')
        .upsert(
          { workspace_id: ctx.accessContext.workspaceId, user_id: userId, task_id: taskId, week_start: weekStart, completed_at: new Date().toISOString() },
          { onConflict: 'workspace_id,user_id,task_id,week_start' }
        )
      if (error) throw error
    } else {
      const { error } = await ctx.adminSupabase
        .from('gr_task_completions')
        .delete()
        .eq('workspace_id', ctx.accessContext.workspaceId)
        .eq('user_id', userId)
        .eq('task_id', taskId)
        .eq('week_start', weekStart)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}