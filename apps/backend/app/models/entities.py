from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    CLIENT = "client"


class ClientStatus(str, enum.Enum):
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    PAUSED = "paused"


class ObjectiveType(str, enum.Enum):
    LEADS = "leads"
    SALES = "sales"
    MESSAGES = "messages"


class IntegrationProvider(str, enum.Enum):
    META_ADS = "meta_ads"
    GOOGLE_ADS = "google_ads"
    LINKEDIN_ADS = "linkedin_ads"
    AGENDOR = "agendor"


class IntegrationStatus(str, enum.Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    SYNCING = "syncing"
    ERROR = "error"


class HealthBand(str, enum.Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class ChecklistKey(str, enum.Enum):
    PIXEL_INSTALLED = "pixel_installed"
    CREATIVES_DELIVERED = "creatives_delivered"
    LANDING_PAGE_READY = "landing_page_ready"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    primary_color: Mapped[str] = mapped_column(String(20), default="#0f766e")
    accent_color: Mapped[str] = mapped_column(String(20), default="#fb7185")
    background_color: Mapped[str] = mapped_column(String(20), default="#f8fafc")
    dark_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    clients: Mapped[list["Client"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.OPERATOR)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship(back_populates="users")
    tasks: Mapped[list["Task"]] = relationship(back_populates="assignee")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    company: Mapped[str] = mapped_column(String(160), nullable=False)
    niche: Mapped[str] = mapped_column(String(120), nullable=False)
    average_ticket: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    main_goal: Mapped[ObjectiveType] = mapped_column(Enum(ObjectiveType), nullable=False)
    ltv: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    start_date: Mapped[date] = mapped_column(Date, default=date.today)
    status: Mapped[ClientStatus] = mapped_column(Enum(ClientStatus), default=ClientStatus.ONBOARDING)
    target_roas: Mapped[float] = mapped_column(Float, default=2.5)
    business_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship(back_populates="clients")
    integrations: Mapped[list["Integration"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    metric_snapshots: Mapped[list["MetricSnapshot"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    campaign_snapshots: Mapped[list["CampaignSnapshot"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    funnel_stages: Mapped[list["FunnelStage"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    checklist_items: Mapped[list["ChecklistItem"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship(back_populates="client", cascade="all, delete-orphan")


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    provider: Mapped[IntegrationProvider] = mapped_column(Enum(IntegrationProvider), nullable=False)
    status: Mapped[IntegrationStatus] = mapped_column(Enum(IntegrationStatus), default=IntegrationStatus.CONNECTED)
    account_name: Mapped[str] = mapped_column(String(160), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    external_account_id: Mapped[str] = mapped_column(String(160), nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship(back_populates="integrations")


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    source: Mapped[IntegrationProvider] = mapped_column(Enum(IntegrationProvider))
    metric_date: Mapped[date] = mapped_column(Date, index=True)
    spend: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    conversions: Mapped[int] = mapped_column(Integer, default=0)
    messages: Mapped[int] = mapped_column(Integer, default=0)
    leads: Mapped[int] = mapped_column(Integer, default=0)
    purchases: Mapped[int] = mapped_column(Integer, default=0)
    revenue: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    top_cities: Mapped[list] = mapped_column(JSON, default=list)
    top_creatives: Mapped[list] = mapped_column(JSON, default=list)
    age_performance: Mapped[list] = mapped_column(JSON, default=list)

    client: Mapped["Client"] = relationship(back_populates="metric_snapshots")


class CampaignSnapshot(Base):
    __tablename__ = "campaign_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    source: Mapped[IntegrationProvider] = mapped_column(Enum(IntegrationProvider))
    campaign_name: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="ACTIVE")
    spend: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    conversions: Mapped[int] = mapped_column(Integer, default=0)
    cpa: Mapped[float] = mapped_column(Float, default=0)
    roas: Mapped[float] = mapped_column(Float, default=0)
    metric_date: Mapped[date] = mapped_column(Date, index=True)

    client: Mapped["Client"] = relationship(back_populates="campaign_snapshots")


class FunnelStage(Base):
    __tablename__ = "funnel_stages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    stage_name: Mapped[str] = mapped_column(String(80), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    volume: Mapped[int] = mapped_column(Integer, default=0)

    client: Mapped["Client"] = relationship(back_populates="funnel_stages")


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    key: Mapped[ChecklistKey] = mapped_column(Enum(ChecklistKey), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    client: Mapped["Client"] = relationship(back_populates="checklist_items")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.TODO)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship(back_populates="tasks")
    assignee: Mapped["User"] = relationship(back_populates="tasks")
