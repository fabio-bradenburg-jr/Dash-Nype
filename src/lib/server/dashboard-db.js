import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'nype.sqlite')

let database

function getDatabasePath() {
  return process.env.SQLITE_PATH || DEFAULT_DB_PATH
}

function ensureDatabase() {
  if (database) {
    return database
  }

  const databasePath = getDatabasePath()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS dashboard_preferences (
      user_id TEXT PRIMARY KEY,
      theme_color TEXT NOT NULL DEFAULT 'blue',
      metric_1 TEXT NOT NULL DEFAULT 'spend',
      metric_2 TEXT NOT NULL DEFAULT 'roas',
      active_client_id TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dashboard_clients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      dashboard_color TEXT,
      logo_url TEXT,
      meta_ad_account_id TEXT,
      google_ads_account_id TEXT,
      tiktok_ads_account_id TEXT,
      linkedin_ads_account_id TEXT,
      rd_station_account_id TEXT,
      salesforce_account_id TEXT,
      agendor_account_id TEXT,
      rd_qualified_stages TEXT,
      funnel_steps TEXT,
      meta_access_token TEXT,
      google_ads_token TEXT,
      tiktok_ads_token TEXT,
      linkedin_ads_token TEXT,
      clickup_token TEXT,
      rd_station_token TEXT,
      salesforce_token TEXT,
      agendor_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS dashboard_clients_user_id_idx
      ON dashboard_clients (user_id);
  `)

  const columns = database.prepare(`PRAGMA table_info(dashboard_clients)`).all()
  const columnNames = new Set(columns.map((column) => column.name))

  const optionalColumns = [
    ['funnel_steps', 'TEXT'],
    ['rd_station_account_id', 'TEXT'],
    ['salesforce_account_id', 'TEXT'],
    ['agendor_account_id', 'TEXT'],
    ['rd_station_token', 'TEXT'],
    ['salesforce_token', 'TEXT'],
    ['agendor_token', 'TEXT'],
    ['dashboard_color', 'TEXT'],
    ['logo_url', 'TEXT'],
    ['rd_qualified_stages', 'TEXT'],
  ]

  optionalColumns.forEach(([name, type]) => {
    if (!columnNames.has(name)) {
      database.exec(`ALTER TABLE dashboard_clients ADD COLUMN ${name} ${type}`)
    }
  })

  return database
}

function mapClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    dashboardColor: row.dashboard_color || 'blue',
    logoUrl: row.logo_url || '',
    metaAdAccountId: row.meta_ad_account_id || '',
    googleAdsAccountId: row.google_ads_account_id || '',
    tiktokAdsAccountId: row.tiktok_ads_account_id || '',
    linkedInAdsAccountId: row.linkedin_ads_account_id || '',
    rdStationAccountId: row.rd_station_account_id || '',
    salesforceAccountId: row.salesforce_account_id || '',
    agendorAccountId: row.agendor_account_id || '',
    rdQualifiedStages: row.rd_qualified_stages ? JSON.parse(row.rd_qualified_stages) : [],
    funnelSteps: row.funnel_steps ? JSON.parse(row.funnel_steps) : ['impressions', 'clicks', 'leads', 'purchases'],
    integrations: {
      metaAccessToken: row.meta_access_token || '',
      metaAdAccountId: row.meta_ad_account_id || '',
      googleAdsToken: row.google_ads_token || '',
      tiktokAdsToken: row.tiktok_ads_token || '',
      linkedinAdsToken: row.linkedin_ads_token || '',
      clickUpToken: row.clickup_token || '',
      rdStationToken: row.rd_station_token || '',
      salesforceToken: row.salesforce_token || '',
      agendorToken: row.agendor_token || '',
    },
  }
}

export function getDashboardState(userId) {
  const db = ensureDatabase()

  const preferenceRow = db
    .prepare(`
      SELECT theme_color, metric_1, metric_2, active_client_id
      FROM dashboard_preferences
      WHERE user_id = ?
    `)
    .get(userId)

  const clientRows = db
    .prepare(`
      SELECT *
      FROM dashboard_clients
      WHERE user_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `)
    .all(userId)

  return {
    themeColor: preferenceRow?.theme_color || 'blue',
    metric1: preferenceRow?.metric_1 || 'spend',
    metric2: preferenceRow?.metric_2 || 'roas',
    activeClientId: preferenceRow?.active_client_id || clientRows[0]?.id || '',
    clients: clientRows.map(mapClientRow),
  }
}

export function saveDashboardState(userId, state) {
  const db = ensureDatabase()
  const clients = Array.isArray(state.clients) ? state.clients : []

  db.exec('BEGIN')

  try {
    db.prepare(`
      INSERT INTO dashboard_preferences (user_id, theme_color, metric_1, metric_2, active_client_id, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        theme_color = excluded.theme_color,
        metric_1 = excluded.metric_1,
        metric_2 = excluded.metric_2,
        active_client_id = excluded.active_client_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      userId,
      state.themeColor || 'blue',
      state.metric1 || 'spend',
      state.metric2 || 'roas',
      state.activeClientId || clients[0]?.id || ''
    )

    const existingIds = clients.map((client) => client.id).filter(Boolean)

    if (existingIds.length > 0) {
      const placeholders = existingIds.map(() => '?').join(', ')
      db.prepare(`
        DELETE FROM dashboard_clients
        WHERE user_id = ?
          AND id NOT IN (${placeholders})
      `).run(userId, ...existingIds)
    } else {
      db.prepare(`DELETE FROM dashboard_clients WHERE user_id = ?`).run(userId)
    }

    const upsertStatement = db.prepare(`
      INSERT INTO dashboard_clients (
        id,
        user_id,
        name,
        dashboard_color,
        logo_url,
        meta_ad_account_id,
        google_ads_account_id,
        tiktok_ads_account_id,
        linkedin_ads_account_id,
        rd_station_account_id,
        salesforce_account_id,
        agendor_account_id,
        rd_qualified_stages,
        funnel_steps,
        meta_access_token,
        google_ads_token,
        tiktok_ads_token,
        linkedin_ads_token,
        clickup_token,
        rd_station_token,
        salesforce_token,
        agendor_token,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        name = excluded.name,
        dashboard_color = excluded.dashboard_color,
        logo_url = excluded.logo_url,
        meta_ad_account_id = excluded.meta_ad_account_id,
        google_ads_account_id = excluded.google_ads_account_id,
        tiktok_ads_account_id = excluded.tiktok_ads_account_id,
        linkedin_ads_account_id = excluded.linkedin_ads_account_id,
        rd_station_account_id = excluded.rd_station_account_id,
        salesforce_account_id = excluded.salesforce_account_id,
        agendor_account_id = excluded.agendor_account_id,
        rd_qualified_stages = excluded.rd_qualified_stages,
        funnel_steps = excluded.funnel_steps,
        meta_access_token = excluded.meta_access_token,
        google_ads_token = excluded.google_ads_token,
        tiktok_ads_token = excluded.tiktok_ads_token,
        linkedin_ads_token = excluded.linkedin_ads_token,
        clickup_token = excluded.clickup_token,
        rd_station_token = excluded.rd_station_token,
        salesforce_token = excluded.salesforce_token,
        agendor_token = excluded.agendor_token,
        updated_at = CURRENT_TIMESTAMP
    `)

    for (const client of clients) {
      upsertStatement.run(
        client.id,
        userId,
        client.name || 'Novo cliente',
        client.dashboardColor || 'blue',
        client.logoUrl || '',
        client.metaAdAccountId || '',
        client.googleAdsAccountId || '',
        client.tiktokAdsAccountId || '',
        client.linkedInAdsAccountId || '',
        client.rdStationAccountId || '',
        client.salesforceAccountId || '',
        client.agendorAccountId || '',
        JSON.stringify(Array.isArray(client.rdQualifiedStages) ? client.rdQualifiedStages : []),
        JSON.stringify(Array.isArray(client.funnelSteps) ? client.funnelSteps : []),
        client.integrations?.metaAccessToken || '',
        client.integrations?.googleAdsToken || '',
        client.integrations?.tiktokAdsToken || '',
        client.integrations?.linkedinAdsToken || '',
        client.integrations?.clickUpToken || '',
        client.integrations?.rdStationToken || '',
        client.integrations?.salesforceToken || '',
        client.integrations?.agendorToken || ''
      )
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return getDashboardState(userId)
}
