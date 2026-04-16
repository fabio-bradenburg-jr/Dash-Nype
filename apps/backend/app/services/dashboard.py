from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import CampaignSnapshot, Client, ClientStatus, FunnelStage, MetricSnapshot


def _sum(values) -> float:
    return float(sum(float(value) for value in values))


def build_client_dashboard(db: Session, client: Client) -> dict:
    snapshots = (
        db.execute(
            select(MetricSnapshot)
            .where(MetricSnapshot.client_id == client.id)
            .order_by(MetricSnapshot.metric_date.asc())
        )
        .scalars()
        .all()
    )
    recent = snapshots[-7:]

    spend = _sum(row.spend for row in recent)
    impressions = sum(row.impressions for row in recent)
    clicks = sum(row.clicks for row in recent)
    conversions = sum(row.conversions for row in recent)
    revenue = _sum(row.revenue for row in recent)
    cpc = round(spend / max(clicks, 1), 2)
    ctr = round((clicks / max(impressions, 1)) * 100, 2)
    roas = round(revenue / max(spend, 1), 2)
    cpa = round(spend / max(conversions, 1), 2)

    objectives = {
        "purchases": sum(row.purchases for row in recent),
        "leads": sum(row.leads for row in recent),
        "messages": sum(row.messages for row in recent),
    }
    results_by_objective = [
        {
            "objective": key,
            "volume": value,
            "cost_per_result": round(spend / max(value, 1), 2),
        }
        for key, value in objectives.items()
    ]

    time_series = [
        {
            "date": row.metric_date.isoformat(),
            "spend": float(row.spend),
            "conversions": row.conversions,
            "roas": round(float(row.revenue) / max(float(row.spend), 1), 2),
        }
        for row in recent
    ]

    funnel_rows = (
        db.execute(select(FunnelStage).where(FunnelStage.client_id == client.id).order_by(FunnelStage.stage_order.asc()))
        .scalars()
        .all()
    )
    funnel = []
    previous_volume = None
    for row in funnel_rows:
        rate = round((row.volume / previous_volume) * 100, 1) if previous_volume else None
        funnel.append({"stage_name": row.stage_name, "volume": row.volume, "conversion_rate": rate})
        previous_volume = row.volume

    campaigns = (
        db.execute(select(CampaignSnapshot).where(CampaignSnapshot.client_id == client.id).order_by(CampaignSnapshot.metric_date.desc()))
        .scalars()
        .all()
    )

    top_cities = recent[-1].top_cities if recent else []
    top_creatives = recent[-1].top_creatives if recent else []
    age_performance = recent[-1].age_performance if recent else []

    return {
        "overview_metrics": [
            {"label": "Spend", "value": spend, "change": 8.4, "format": "currency"},
            {"label": "Impressions", "value": impressions, "change": 5.2, "format": "number"},
            {"label": "Clicks", "value": clicks, "change": 4.3, "format": "number"},
            {"label": "CPC", "value": cpc, "change": -2.1, "format": "currency"},
            {"label": "CTR", "value": ctr, "change": 1.7, "format": "percent"},
            {"label": "Conversions", "value": conversions, "change": 6.6, "format": "number"},
            {"label": "ROAS", "value": roas, "change": 3.9, "format": "ratio"},
        ],
        "results_by_objective": results_by_objective,
        "time_series": time_series,
        "top_cities": top_cities,
        "top_creatives": top_creatives,
        "age_performance": age_performance,
        "funnel": funnel,
        "campaigns": [
            {
                "campaign_name": row.campaign_name,
                "status": row.status,
                "spend": float(row.spend),
                "conversions": row.conversions,
                "cpa": row.cpa,
                "roas": row.roas,
                "source": row.source.value,
            }
            for row in campaigns[:8]
        ],
    }


def build_operations_dashboard(db: Session, tenant_id: str) -> dict:
    clients = db.execute(select(Client).where(Client.tenant_id == tenant_id)).scalars().all()
    total_clients = len(clients)
    active_clients = len([client for client in clients if client.status == ClientStatus.ACTIVE])
    churn_rate = round(((total_clients - active_clients) / max(total_clients, 1)) * 100, 2)
    average_ltv = round(sum(float(client.ltv) for client in clients) / max(total_clients, 1), 2)

    recent_threshold = date.today() - timedelta(days=7)
    recent_snapshots = db.execute(
        select(MetricSnapshot).where(MetricSnapshot.tenant_id == tenant_id, MetricSnapshot.metric_date >= recent_threshold)
    ).scalars().all()

    revenue_by_client: dict[str, float] = defaultdict(float)
    spend_by_client: dict[str, float] = defaultdict(float)
    conversions_by_client: dict[str, int] = defaultdict(int)
    for row in recent_snapshots:
        revenue_by_client[row.client_id] += float(row.revenue)
        spend_by_client[row.client_id] += float(row.spend)
        conversions_by_client[row.client_id] += row.conversions

    total_revenue = round(sum(revenue_by_client.values()), 2)
    total_spend = round(sum(spend_by_client.values()), 2)
    average_roi = round(total_revenue / max(total_spend, 1), 2)
    cac = round(total_spend / max(sum(conversions_by_client.values()), 1), 2)

    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "churn_rate": churn_rate,
        "average_ltv": average_ltv,
        "cac": cac,
        "total_revenue": total_revenue,
        "average_roi": average_roi,
    }
