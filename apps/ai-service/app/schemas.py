from typing import List, Optional

from pydantic import BaseModel, Field


class AlertPayload(BaseModel):
    type: str
    severity: str
    message: str


class AnalyzeClientRequest(BaseModel):
    clientId: str
    clientName: str
    industry: Optional[dict] = None
    healthScore: float = Field(ge=0, le=100)
    healthBand: str
    churnScore: float = Field(ge=0)
    churnBand: str
    reasons: List[str] = []
    alerts: List[AlertPayload] = []


class AnalyzeClientResponse(BaseModel):
    summary: str
    risk_reason: str
    recommendations: List[str]
    urgency: str
