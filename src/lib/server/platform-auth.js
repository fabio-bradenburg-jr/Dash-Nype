import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

export async function requirePlatformPageSession() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const adminSupabase = createAdminClient()
  const access = await getAccessContext(supabase, user, { adminSupabase })

  return {
    user,
    access,
  }
}

export async function requirePlatformRouteAccess(options = {}) {
  const { requireManageClients = false } = options
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return { error: error.message || 'Não foi possível validar a sessão.', status: 401 }
  }

  if (!user) {
    return { error: 'Não autenticado.', status: 401 }
  }

  const adminSupabase = createAdminClient()
  const access = await getAccessContext(supabase, user, { adminSupabase })

  if (requireManageClients && !access.canManageClients) {
    return { error: 'Você não tem permissão para gerenciar esta área.', status: 403 }
  }

  return {
    user,
    access,
  }
}
