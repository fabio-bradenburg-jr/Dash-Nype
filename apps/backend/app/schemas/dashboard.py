from typing import Optional

from pydantic import BaseModel


class MetricCard(BaseModel):
    label: str
    value: float
    change: float
    format: str


class ObjectivePerformance(BaseModel):
    objective: str
    volume: int
    cost_per_result: float


class TimeSeriesPoint(BaseModel):
    date: str
    spend: float
    conversions: int
    roas: float


class FunnelStagePayload(BaseModel):
    stage_name: str
    volume: int
    conversion_rate: Optional[float] = None


class CampaignRow(BaseModel):
    campaign_name: str
    status: str
    spend: float
    conversions: int
    cpa: float
    roas: float
    source: str


class ClientDashboardResponse(BaseModel):
    overview_metrics: list[MetricCard]
    results_by_objective: list[ObjectivePerformance]
    time_series: list[TimeSeriesPoint]
    top_cities: list[dict]
    top_creatives: list[dict]
    age_performance: list[dict]
    funnel: list[FunnelStagePayload]
    campaigns: list[CampaignRow]
    health_score: int
    health_band: str


class OperationsDashboardResponse(BaseModel):
    total_clients: int
    active_clients: int
    churn_rate: float
    average_ltv: float
    cac: float
    total_revenue: float
    average_roi: float
    client_health: list[dict]
