from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class ClientBase(BaseModel):
    name: str
    company: str
    niche: str
    average_ticket: float
    main_goal: str
    ltv: float
    start_date: date
    status: str = "onboarding"
    target_roas: float = 2.5
    business_data: dict = Field(default_factory=dict)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    niche: Optional[str] = None
    average_ticket: Optional[float] = None
    main_goal: Optional[str] = None
    ltv: Optional[float] = None
    start_date: Optional[date] = None
    status: Optional[str] = None
    target_roas: Optional[float] = None
    business_data: Optional[dict] = None


class ClientResponse(ClientBase):
    id: str
    tenant_id: str
    health_score: int
    health_band: str
    last_sync_at: Optional[str] = None


class ChecklistItemResponse(BaseModel):
    id: str
    key: str
    label: str
    completed: bool


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    due_date: Optional[date] = None
    assignee_name: Optional[str] = None
