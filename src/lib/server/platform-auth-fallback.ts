import { randomUUID, pbkdf2Sync, randomBytes } from 'crypto'

import { SignJWT, jwtVerify } from 'jose'
import { Pool } from 'pg'

const PRIMARY_ADMIN_EMAIL = 'fabiobrandenburgjr@gmail.com'

function isPrimaryAdminEmail(email: string) {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL
}

type UserRow = {
  id: string
  tenant_id: string
  email: string
  full_name: string
  password_hash: string
  role: string
  is_active: boolean
}

let pool: Pool | null = null

export function hasLocalDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL)
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não configurada')
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://') })
  }
  return pool
}

function secretKey() {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'change-me')
}

function hashPassword(password: string, salt?: string) {
  const saltValue = salt || randomBytes(16).toString('base64url')
  const digest = pbkdf2Sync(password, saltValue, 120_000, 32, 'sha256').toString('base64url')
  return `${saltValue}$${digest}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt] = storedHash.split('$')
  return hashPassword(password, salt) === storedHash
}

function slugFromName(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workspace'
  )
}

function roleForPlatformDatabase(role: string) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'master' || normalized === 'admin') return 'ADMIN'
  if (normalized === 'cliente' || normalized === 'client') return 'CLIENT'
  return 'OPERATOR'
}

function isRecoverablePlatformDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase()
  return (
    message.includes('tenant or user not found') ||
    message.includes('database_url não configurada') ||
    message.includes('password authentication failed') ||
    message.includes('connection terminated') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('timeout')
  )
}

function buildSupabaseOnlyPlatformUser(input: { user_id: string; tenant_id: string; email?: string | null; role?: string | null }) {
  const email = String(input.email || '').trim().toLowerCase()
  const requestedRole = String(input.role || 'operator').toLowerCase()
  return {
    user_id: `supabase:${input.user_id}`,
    tenant_id: input.tenant_id || input.user_id,
    role: isPrimaryAdminEmail(email) ? 'master' : requestedRole === 'master' || requestedRole === 'admin' ? 'viewer' : requestedRole,
  }
}

export async function ensurePlatformUserForSupabase(input: {
  user_id: string
  tenant_id: string
  tenant_name?: string | null
  email?: string | null
  full_name?: string | null
  role?: string | null
}) {
  if (!hasLocalDatabaseConfig()) {
    return buildSupabaseOnlyPlatformUser(input)
  }

  let db: Pool
  try {
    db = getPool()
  } catch (error) {
    if (isRecoverablePlatformDatabaseError(error)) {
      return buildSupabaseOnlyPlatformUser(input)
    }
    throw error
  }
  const tenantId = input.tenant_id || input.user_id
  const tenantName = String(input.tenant_name || 'Workspace principal').trim() || 'Workspace principal'
  const email = String(input.email || '').trim().toLowerCase()
  const fullName = String(input.full_name || email || 'Usuário').trim()
  const requestedRole = roleForPlatformDatabase(String(input.role || 'operator'))
  const role = isPrimaryAdminEmail(email) ? 'ADMIN' : requestedRole === 'ADMIN' ? 'VIEWER' : requestedRole

  await db.query('begin')
  try {
    await db.query(
      `insert into tenants (id, name, slug, primary_color, accent_color, background_color, dark_mode, created_at, updated_at)
       values ($1, $2, $3, '#0f766e', '#fb7185', '#f8fafc', false, now(), now())
       on conflict (id) do update set
         name = excluded.name,
         updated_at = now()`,
      [tenantId, tenantName, slugFromName(`${tenantName}-${tenantId.slice(0, 8)}`)]
    )

    const existing = email
      ? await db.query<UserRow>(
          'select id, tenant_id, email, full_name, password_hash, role, is_active from users where id = $1 or email = $2 limit 1',
          [input.user_id, email]
        )
      : await db.query<UserRow>(
          'select id, tenant_id, email, full_name, password_hash, role, is_active from users where id = $1 limit 1',
          [input.user_id]
        )
    const platformUserId = existing.rows[0]?.id || input.user_id

    await db.query(
      `insert into users (id, tenant_id, email, full_name, password_hash, role, is_active, created_at)
       values ($1, $2, $3, $4, $5, $6, true, now())
       on conflict (id) do update set
         tenant_id = excluded.tenant_id,
         email = excluded.email,
         full_name = excluded.full_name,
         role = excluded.role,
         is_active = true`,
      [
        platformUserId,
        tenantId,
        email || `${platformUserId}@supabase.local`,
        fullName,
        existing.rows[0]?.password_hash || hashPassword(randomUUID()),
        role,
      ]
    )

    await db.query('commit')

    return {
      user_id: platformUserId,
      tenant_id: tenantId,
      role: role.toLowerCase(),
    }
  } catch (error) {
    try {
      await db.query('rollback')
    } catch {
      // A conexão local pode falhar antes da transação abrir. Nesse caso,
      // mantemos o login Supabase vivo e seguimos com um usuário derivado da sessão.
    }

    if (isRecoverablePlatformDatabaseError(error)) {
      return buildSupabaseOnlyPlatformUser(input)
    }

    throw error
  }
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

export async function registerWithLocalDatabase(input: {
  full_name: string
  company_name: string
  email: string
  password: string
}) {
  const db = getPool()
  const email = input.email.trim().toLowerCase()
  const fullName = input.full_name.trim()
  const companyName = input.company_name.trim()
  const password = input.password.trim()

  if (!email || !fullName || !companyName || password.length < 6) {
    throw new Error('Dados inválidos para criar a conta')
  }

  const existingUser = await db.query('select id from users where email = $1 limit 1', [email])
  if (existingUser.rowCount) {
    throw new Error('Já existe uma conta com este e-mail')
  }

  const baseSlug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workspace'

  let slug = baseSlug
  let counter = 1
  while ((await db.query('select id from tenants where slug = $1 limit 1', [slug])).rowCount) {
    counter += 1
    slug = `${baseSlug}-${counter}`
  }

  const tenantId = randomUUID()
  const userId = randomUUID()
  const role = isPrimaryAdminEmail(email) ? 'ADMIN' : 'VIEWER'

  await db.query('begin')
  try {
    await db.query(
      `insert into tenants (id, name, slug, primary_color, accent_color, background_color, dark_mode, created_at, updated_at)
       values ($1, $2, $3, '#0f766e', '#fb7185', '#f8fafc', false, now(), now())`,
      [tenantId, companyName, slug]
    )

    await db.query(
      `insert into users (id, tenant_id, email, full_name, password_hash, role, is_active, created_at)
       values ($1, $2, $3, $4, $5, $6, true, now())`,
      [userId, tenantId, email, fullName, hashPassword(password), role]
    )
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  return createLocalAccessToken({ sub: userId, tenant_id: tenantId, role: role.toLowerCase(), email, full_name: fullName })
}

export async function loginWithLocalDatabase(input: { email: string; password: string }) {
  const db = getPool()
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()

  const result = await db.query<UserRow>(
    'select id, tenant_id, email, full_name, password_hash, role, is_active from users where email = $1 limit 1',
    [email]
  )
  const user = result.rows[0]

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    throw new Error('Credenciais inválidas')
  }

  return createLocalAccessToken({ sub: user.id, tenant_id: user.tenant_id, role: user.role.toLowerCase(), email: user.email, full_name: user.full_name })
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

  if (userId.startsWith('supabase:')) {
    return {
      id: userId.replace('supabase:', ''),
      email: String(payload.email || ''),
      full_name: String(payload.full_name || 'Usuário'),
      role: String(payload.role || 'operator').toLowerCase(),
      tenant_id: String(payload.tenant_id || ''),
      can_edit_integrations: Boolean(payload.can_edit_integrations),
    }
  }

  const db = getPool()
  const result = await db.query<UserRow>(
    'select id, tenant_id, email, full_name, password_hash, role, is_active from users where id = $1 limit 1',
    [userId]
  )
  const user = result.rows[0]
  if (!user || !user.is_active) {
    throw new Error('Usuário não encontrado')
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role.toLowerCase(),
    tenant_id: user.tenant_id,
  }
}
