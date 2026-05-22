from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import encrypt_secret, hash_password
from app.models.entities import (
    ChecklistItem,
    ChecklistKey,
    Client,
    ClientStatus,
    FunnelStage,
    Integration,
    IntegrationProvider,
    ObjectiveType,
    Task,
    Tenant,
    User,
    UserRole,
)
from app.services.integrations import run_mock_sync


def seed_database(db: Session) -> None:
    exists = db.execute(select(Tenant).where(Tenant.slug == "nype-demo")).scalar_one_or_none()
    if exists:
        return

    tenant = Tenant(
        name="Nype Demo Agency",
        slug="nype-demo",
        primary_color="#0f766e",
        accent_color="#f97316",
        background_color="#f8fafc",
        dark_mode=False,
    )
    db.add(tenant)
    db.flush()

    admin = User(
        tenant_id=tenant.id,
        email="admin@nype.demo",
        full_name="Fabio Admin",
        password_hash=hash_password("admin123"),
        role=UserRole.ADMIN,
    )
    operator = User(
        tenant_id=tenant.id,
        email="operator@nype.demo",
        full_name="Ana Operator",
        password_hash=hash_password("operator123"),
        role=UserRole.OPERATOR,
    )
    db.add_all([admin, operator])
    db.flush()

    clients = [
        Client(
            tenant_id=tenant.id,
            name="Pulse Clinic",
            company="Pulse Clinic",
            niche="Healthcare",
            average_ticket=850.0,
            main_goal=ObjectiveType.LEADS,
            ltv=6800.0,
            start_date=date.today() - timedelta(days=120),
            status=ClientStatus.ACTIVE,
            target_roas=2.2,
            business_data={"monthly_budget": 12000, "sales_cycle_days": 14},
        ),
        Client(
            tenant_id=tenant.id,
            name="Solar Forge",
            company="Solar Forge",
            niche="Industry",
            average_ticket=4200.0,
            main_goal=ObjectiveType.SALES,
            ltv=25000.0,
            start_date=date.today() - timedelta(days=180),
            status=ClientStatus.ACTIVE,
            target_roas=3.1,
            business_data={"monthly_budget": 20000, "sales_cycle_days": 30},
        ),
        Client(
            tenant_id=tenant.id,
            name="Modo Aura",
            company="Modo Aura",
            niche="Fashion",
            average_ticket=230.0,
            main_goal=ObjectiveType.MESSAGES,
            ltv=5200.0,
            start_date=date.today() - timedelta(days=75),
            status=ClientStatus.ONBOARDING,
            target_roas=2.8,
            business_data={"monthly_budget": 9000, "sales_cycle_days": 7},
        ),
    ]
    db.add_all(clients)
    db.flush()

    for client in clients:
        db.add_all(
            [
                ChecklistItem(client_id=client.id, key=ChecklistKey.PIXEL_INSTALLED, label="Pixel installed", completed=True),
                ChecklistItem(client_id=client.id, key=ChecklistKey.CREATIVES_DELIVERED, label="Creatives delivered", completed=client.name != "Modo Aura"),
                ChecklistItem(client_id=client.id, key=ChecklistKey.LANDING_PAGE_READY, label="Landing page ready", completed=client.status == ClientStatus.ACTIVE),
            ]
        )
        db.add_all(
            [
                Task(
                    tenant_id=tenant.id,
                    client_id=client.id,
                    assignee_id=operator.id,
                    title="Create campaigns",
                    description="Launch the next acquisition sprint.",
                    due_date=date.today() + timedelta(days=2),
                ),
                Task(
                    tenant_id=tenant.id,
                    client_id=client.id,
                    assignee_id=admin.id,
                    title="Adjust creatives",
                    description="Prepare refreshed hooks for top audience segments.",
                    due_date=date.today() + timedelta(days=4),
                ),
                Task(
                    tenant_id=tenant.id,
                    client_id=client.id,
                    assignee_id=operator.id,
                    title="Optimize performance",
                    description="Review budget split and CPA trends.",
                    due_date=date.today() + timedelta(days=6),
                ),
            ]
        )

        db.add_all(
            [
                FunnelStage(client_id=client.id, stage_name="Impressions", stage_order=1, volume=42000),
                FunnelStage(client_id=client.id, stage_name="Clicks", stage_order=2, volume=2400),
                FunnelStage(client_id=client.id, stage_name="Leads", stage_order=3, volume=320 if client.main_goal != ObjectiveType.MESSAGES else 480),
                FunnelStage(client_id=client.id, stage_name="Purchases", stage_order=4, volume=92 if client.main_goal == ObjectiveType.SALES else 54),
            ]
        )

    db.flush()

    integrations = [
        Integration(
            tenant_id=tenant.id,
            client_id=clients[0].id,
            provider=IntegrationProvider.META_ADS,
            account_name="Pulse Meta",
            external_account_id="meta-001",
            access_token_encrypted=encrypt_secret("meta-demo-token"),
        ),
        Integration(
            tenant_id=tenant.id,
            client_id=clients[0].id,
            provider=IntegrationProvider.AGENDOR,
            account_name="Pulse Agendor",
            external_account_id="agendor-001",
            access_token_encrypted=encrypt_secret("agendor-demo-token"),
        ),
        Integration(
            tenant_id=tenant.id,
            client_id=clients[1].id,
            provider=IntegrationProvider.GOOGLE_ADS,
            account_name="Solar Google",
            external_account_id="google-002",
            access_token_encrypted=encrypt_secret("google-demo-token"),
        ),
        Integration(
            tenant_id=tenant.id,
            client_id=clients[2].id,
            provider=IntegrationProvider.LINKEDIN_ADS,
            account_name="Aura LinkedIn",
            external_account_id="linkedin-003",
            access_token_encrypted=encrypt_secret("linkedin-demo-token"),
        ),
    ]
    db.add_all(integrations)
    db.flush()

    for integration in integrations:
        run_mock_sync(db, integration)

    db.commit()
