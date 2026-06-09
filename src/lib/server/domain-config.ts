/** Maps each allowed domain to the email of its workspace owner. */
export const DOMAIN_OWNER_EMAIL: Record<string, string> = {
  'app.assessorialp.com.br': 'fabio@assessorialp.com.br',
}

export const ALLOWED_DOMAINS = Object.keys(DOMAIN_OWNER_EMAIL)

export function parseDomain(host: string): string {
  return (host || '').split(':')[0].toLowerCase()
}

/** Returns the workspace owner email for this host, or null if domain is not allowed. */
export function getOwnerEmailForHost(host: string): string | null {
  const domain = parseDomain(host)
  // In local development default to the assessorialp workspace
  if (domain === 'localhost' || domain.endsWith('.localhost')) {
    return DOMAIN_OWNER_EMAIL['app.assessorialp.com.br']
  }
  return DOMAIN_OWNER_EMAIL[domain] ?? null
}

/** Resolves the workspace_id that belongs to the domain's owner email. */
export async function resolveWorkspaceForHost(
  adminSupabase: any,
  host: string
): Promise<{ workspaceId: string | null; ownerEmail: string | null }> {
  const ownerEmail = getOwnerEmailForHost(host)
  if (!ownerEmail) return { workspaceId: null, ownerEmail: null }

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('workspace_id')
    .eq('email', ownerEmail)
    .maybeSingle()

  return { workspaceId: profile?.workspace_id ?? null, ownerEmail }
}
