-- Nype SaaS platform seed for Supabase SQL Editor
-- Run after supabase_platform_schema.sql

DO $$
DECLARE
  tenant_id TEXT := 'tenant_agency_hub';
  master_user_id TEXT := 'user_master_agency_hub';
  client_id TEXT := 'client_nebula_systems';
  integration_meta_id TEXT := 'integration_meta_nebula';
  integration_monday_id TEXT := 'integration_monday_nebula';
  task_1_id TEXT := 'task_recovery_plan';
  task_2_id TEXT := 'task_stakeholder_review';
  reference_date TIMESTAMP := '2026-04-01 00:00:00';
BEGIN
  INSERT INTO "Tenant" ("id", "name", "slug", "themePreference", "createdAt", "updatedAt")
  VALUES (tenant_id, 'Agency Hub', 'agency-hub', 'light', NOW(), NOW())
  ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "themePreference" = EXCLUDED."themePreference",
    "updatedAt" = NOW();

  INSERT INTO "User" (
    "id",
    "tenantId",
    "email",
    "fullName",
    "passwordHash",
    "role",
    "themePreference",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    master_user_id,
    tenant_id,
    'master@agencyhub.ai',
    'Master User',
    '$2b$10$placeholder.hash.for.local.development',
    'MASTER',
    'light',
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT ("tenantId", "email") DO UPDATE SET
    "fullName" = EXCLUDED."fullName",
    "role" = EXCLUDED."role",
    "themePreference" = EXCLUDED."themePreference",
    "isActive" = TRUE,
    "updatedAt" = NOW();

  INSERT INTO "DashboardAccess" ("id", "tenantId", "userId", "dashboard", "canRead", "canEdit")
  VALUES
    ('dashboard_home_master', tenant_id, master_user_id, 'HOME', TRUE, TRUE),
    ('dashboard_general_master', tenant_id, master_user_id, 'GENERAL', TRUE, TRUE),
    ('dashboard_client_master', tenant_id, master_user_id, 'CLIENT', TRUE, TRUE),
    ('dashboard_executive_master', tenant_id, master_user_id, 'EXECUTIVE', TRUE, TRUE),
    ('dashboard_operations_master', tenant_id, master_user_id, 'OPERATIONS', TRUE, TRUE)
  ON CONFLICT ("userId", "dashboard") DO UPDATE SET
    "canRead" = EXCLUDED."canRead",
    "canEdit" = EXCLUDED."canEdit";

  INSERT INTO "Client" (
    "id",
    "tenantId",
    "name",
    "companyName",
    "cnpj",
    "ownerName",
    "ownerEmail",
    "goals",
    "history",
    "status",
    "manuallyFlaggedAtRisk",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    client_id,
    tenant_id,
    'Nebula Systems',
    'Nebula Systems LTDA',
    '12.345.678/0001-10',
    'Elena Rossi',
    'elena@nebula.com',
    '{"roi": 3, "margin": 25}'::jsonb,
    '{"segment": "Enterprise SaaS"}'::jsonb,
    'AT_RISK',
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "companyName" = EXCLUDED."companyName",
    "status" = EXCLUDED."status",
    "manuallyFlaggedAtRisk" = EXCLUDED."manuallyFlaggedAtRisk",
    "updatedAt" = NOW();

  INSERT INTO "UserClientAccess" ("id", "userId", "clientId", "canRead", "canEdit")
  VALUES ('user_client_access_master_nebula', master_user_id, client_id, TRUE, TRUE)
  ON CONFLICT ("userId", "clientId") DO UPDATE SET
    "canRead" = EXCLUDED."canRead",
    "canEdit" = EXCLUDED."canEdit";

  INSERT INTO "FinancialMetric" (
    "id", "clientId", "referenceDate", "fee", "ltv", "investment", "revenue", "marginPercent", "createdAt"
  )
  VALUES (
    'financial_metric_nebula_20260401', client_id, reference_date, 12000, 428500, 84200, 97600, 18.4, NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "fee" = EXCLUDED."fee",
    "ltv" = EXCLUDED."ltv",
    "investment" = EXCLUDED."investment",
    "revenue" = EXCLUDED."revenue",
    "marginPercent" = EXCLUDED."marginPercent";

  INSERT INTO "PerformanceMetric" (
    "id", "clientId", "referenceDate", "roi", "roiWithoutFee", "mmf", "spend", "conversions", "createdAt"
  )
  VALUES (
    'performance_metric_nebula_20260401', client_id, reference_date, 0.8, 0.65, 1.4, 84200, 124, NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "roi" = EXCLUDED."roi",
    "roiWithoutFee" = EXCLUDED."roiWithoutFee",
    "mmf" = EXCLUDED."mmf",
    "spend" = EXCLUDED."spend",
    "conversions" = EXCLUDED."conversions";

  INSERT INTO "EngagementMetric" (
    "id", "clientId", "referenceDate", "meetingAttendanceRate", "crmUsageRate", "stakeholderAlignmentScore", "createdAt"
  )
  VALUES (
    'engagement_metric_nebula_20260401', client_id, reference_date, 52, 40, 45, NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "meetingAttendanceRate" = EXCLUDED."meetingAttendanceRate",
    "crmUsageRate" = EXCLUDED."crmUsageRate",
    "stakeholderAlignmentScore" = EXCLUDED."stakeholderAlignmentScore";

  INSERT INTO "OperationalMetric" (
    "id", "clientId", "referenceDate", "tasksOpen", "tasksLate", "averageResolutionHours", "productivityIndex", "createdAt"
  )
  VALUES (
    'operational_metric_nebula_20260401', client_id, reference_date, 17, 8, 33, 58, NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "tasksOpen" = EXCLUDED."tasksOpen",
    "tasksLate" = EXCLUDED."tasksLate",
    "averageResolutionHours" = EXCLUDED."averageResolutionHours",
    "productivityIndex" = EXCLUDED."productivityIndex";

  INSERT INTO "QualityMetric" (
    "id", "clientId", "referenceDate", "csat", "nps", "createdAt"
  )
  VALUES (
    'quality_metric_nebula_20260401', client_id, reference_date, 3.7, 6.4, NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "csat" = EXCLUDED."csat",
    "nps" = EXCLUDED."nps";

  INSERT INTO "HealthMetric" (
    "id",
    "clientId",
    "referenceDate",
    "score",
    "band",
    "performanceWeight",
    "financialWeight",
    "engagementWeight",
    "operationalWeight",
    "qualityWeight",
    "createdAt"
  )
  VALUES (
    'health_metric_nebula_20260401',
    client_id,
    reference_date,
    48,
    'RISK',
    11.4,
    13.5,
    8.8,
    8.7,
    5.1,
    NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "score" = EXCLUDED."score",
    "band" = EXCLUDED."band",
    "performanceWeight" = EXCLUDED."performanceWeight",
    "financialWeight" = EXCLUDED."financialWeight",
    "engagementWeight" = EXCLUDED."engagementWeight",
    "operationalWeight" = EXCLUDED."operationalWeight",
    "qualityWeight" = EXCLUDED."qualityWeight";

  INSERT INTO "ChurnMetric" (
    "id", "clientId", "referenceDate", "score", "band", "reasons", "createdAt"
  )
  VALUES (
    'churn_metric_nebula_20260401',
    client_id,
    reference_date,
    100,
    'HIGH',
    '["ROI abaixo de 1","ROI em queda","Baixa participação em reuniões","Uso insuficiente do CRM","Stakeholder desalinhado","Tarefas atrasadas acima do aceitável","CSAT abaixo de 4","NPS abaixo de 7","Margem abaixo de 20%","Risco marcado manualmente"]'::jsonb,
    NOW()
  )
  ON CONFLICT ("clientId", "referenceDate") DO UPDATE SET
    "score" = EXCLUDED."score",
    "band" = EXCLUDED."band",
    "reasons" = EXCLUDED."reasons";

  INSERT INTO "Alert" ("id", "clientId", "type", "severity", "title", "description", "isResolved", "createdAt", "updatedAt")
  VALUES
    ('alert_low_roi_nebula', client_id, 'LOW_ROI', 'HIGH', 'LOW_ROI', 'ROI abaixo do ponto de equilíbrio.', FALSE, NOW(), NOW()),
    ('alert_perf_drop_nebula', client_id, 'PERFORMANCE_DROP', 'MEDIUM', 'PERFORMANCE_DROP', 'Queda recente de performance identificada.', FALSE, NOW(), NOW()),
    ('alert_client_disengaged_nebula', client_id, 'CLIENT_DISENGAGED', 'MEDIUM', 'CLIENT_DISENGAGED', 'Sinais de desengajamento do cliente.', FALSE, NOW(), NOW()),
    ('alert_ops_bottleneck_nebula', client_id, 'OPERATIONAL_BOTTLENECK', 'HIGH', 'OPERATIONAL_BOTTLENECK', 'Backlog operacional acima do limite.', FALSE, NOW(), NOW()),
    ('alert_low_margin_nebula', client_id, 'LOW_MARGIN', 'HIGH', 'LOW_MARGIN', 'Margem operacional ruim para o contrato atual.', FALSE, NOW(), NOW()),
    ('alert_manual_risk_nebula', client_id, 'MANUAL_RISK', 'CRITICAL', 'MANUAL_RISK', 'Time marcou risco manualmente.', FALSE, NOW(), NOW())
  ON CONFLICT ("id") DO UPDATE SET
    "severity" = EXCLUDED."severity",
    "description" = EXCLUDED."description",
    "isResolved" = FALSE,
    "updatedAt" = NOW();

  INSERT INTO "Integration" (
    "id", "tenantId", "clientId", "provider", "status", "externalAccountId", "credentials", "settings", "lastSyncAt", "createdAt", "updatedAt"
  )
  VALUES
    (integration_meta_id, tenant_id, client_id, 'META_ADS', 'CONNECTED', 'act_123456', NULL, '{"syncWindow":"30d"}'::jsonb, NOW(), NOW(), NOW()),
    (integration_monday_id, tenant_id, client_id, 'MONDAY', 'SYNCING', 'board_9988', NULL, '{"boardName":"Client Delivery"}'::jsonb, NOW(), NOW(), NOW())
  ON CONFLICT ("id") DO UPDATE SET
    "status" = EXCLUDED."status",
    "externalAccountId" = EXCLUDED."externalAccountId",
    "settings" = EXCLUDED."settings",
    "lastSyncAt" = EXCLUDED."lastSyncAt",
    "updatedAt" = NOW();

  INSERT INTO "Task" (
    "id", "tenantId", "clientId", "assignedUserId", "title", "description", "status", "priority", "dueDate", "estimatedHours", "spentHours", "createdAt", "updatedAt"
  )
  VALUES
    (
      task_1_id,
      tenant_id,
      client_id,
      master_user_id,
      'Recovery plan for ROI decline',
      'Create and execute the first turnaround plan for the account.',
      'IN_PROGRESS',
      'URGENT',
      '2026-04-07 00:00:00',
      12,
      4,
      NOW(),
      NOW()
    ),
    (
      task_2_id,
      tenant_id,
      client_id,
      master_user_id,
      'Stakeholder alignment review',
      'Review relationship risk and schedule the executive checkpoint.',
      'OPEN',
      'HIGH',
      '2026-04-09 00:00:00',
      6,
      0,
      NOW(),
      NOW()
    )
  ON CONFLICT ("id") DO UPDATE SET
    "status" = EXCLUDED."status",
    "priority" = EXCLUDED."priority",
    "dueDate" = EXCLUDED."dueDate",
    "estimatedHours" = EXCLUDED."estimatedHours",
    "spentHours" = EXCLUDED."spentHours",
    "updatedAt" = NOW();
END $$;
