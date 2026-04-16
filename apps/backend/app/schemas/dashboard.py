from typing import Optional

from pydantic import BaseModel


class MetricCard(BaseModel):
    key: str | None = None
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
    purchases: int = 0
    leads: int = 0
    messages: int = 0
    cpa: float = 0


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
    purchases: int = 0
    leads: int = 0
    messages: int = 0
    purchase_value: float = 0
    clicks: int = 0
    impressions: int = 0
    reach: int = 0
    ctr: float = 0
    cpc: float = 0
    cpm: float = 0
    frequency: float = 0
    conversion_rate: float = 0


class ClientDashboardResponse(BaseModel):
    overview_metrics: list[MetricCard]
    results_by_objective: list[ObjectivePerformance]
    time_series: list[TimeSeriesPoint]
    top_cities: list[dict]
    top_creatives: list[dict]
    age_performance: list[dict]
    funnel: list[FunnelStagePayload]
    campaigns: list[CampaignRow]


class OperationsDashboardResponse(BaseModel):
    total_clients: int
    active_clients: int
    churn_rate: float
    average_ltv: float
    cac: float
    total_revenue: float
    average_roi: float
