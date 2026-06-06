import { SignJWT, jwtVerify } from 'jose'

const PRIMARY_ADMIN_EMAIL = 'fbrandenburgjunior@gmail.com'

function secretKey() {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'change-me')
}

export function isPrimaryAdminEmail(email: string) {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL
}

export async function createLocalAccessToken(payload: {
  sub: string
  tenant_id: string
  role: string
  email?: string
  full_name?: string
  provider?: string
  can_edit_integrations?: boolean
}) {
  return new SignJWT({
    role: payload.role,
    tenant_id: payload.tenant_id,
    email: payload.email,
    full_name: payload.full_name,
    provider: payload.provider,
    can_edit_integrations: Boolean(payload.can_edit_integrations),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('12h')
    .sign(secretKey())
}

export async function createPreviewAccessToken() {
  return createLocalAccessToken({
    sub: 'preview-user',
    tenant_id: 'tenant-demo',
    role: 'admin',
  })
}

export async function verifyLocalAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey())
  return payload
}

export async function getLocalSessionUser(token: string) {
  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '')

  if (!userId) {
    throw new Error('Sessão inválida')
  }

  if (userId === 'preview-user') {
    return {
      id: 'preview-user',
      email: 'preview@nype.orbit',
      full_name: 'Acesso Preview',
      role: String(payload.role || 'admin'),
      tenant_id: String(payload.tenant_id || 'tenant-demo'),
      can_edit_integrations: true,
    }
  }

  return {
    id: userId.replace(/^supabase:/, ''),
    email: String(payload.email || ''),
    full_name: String(payload.full_name || 'Usuário'),
    role: String(payload.role || 'operator').toLowerCase(),
    tenant_id: String(payload.tenant_id || ''),
    can_edit_integrations: Boolean(payload.can_edit_integrations),
  }
}
