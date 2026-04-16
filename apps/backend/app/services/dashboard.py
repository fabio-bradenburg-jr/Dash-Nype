from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import CampaignSnapshot, Client, ClientStatus, FunnelStage, MetricSnapshot


def _sum(values) -> float:
    return float(sum(float(value) for value in values))


def _metric(key: str, label: str, value: float, previous_value: float, fmt: str) -> dict:
    current = float(value or 0)
    previous = float(previous_value or 0)
    if previous == 0:
        change = 0.0 if current == 0 else 100.0
    else:
        change = round(((current - previous) / abs(previous)) * 100, 1)

    return {
        "key": key,
        "label": label,
        "value": round(current, 2),
        "change": change,
        "format": fmt,
    }


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
    previous = snapshots[-14:-7]

    spend = _sum(row.spend for row in recent)
    impressions = sum(row.impressions for row in recent)
    clicks = sum(row.clicks for row in recent)
    conversions = sum(row.conversions for row in recent)
    revenue = _sum(row.revenue for row in recent)
    purchases = sum(row.purchases for row in recent)
    leads = sum(row.leads for row in recent)
    messages = sum(row.messages for row in recent)
    cpc = round(spend / max(clicks, 1), 2)
    cpm = round((spend / max(impressions, 1)) * 1000, 2)
    ctr = round((clicks / max(impressions, 1)) * 100, 2)
    roas = round(revenue / max(spend, 1), 2)
    cpa = round(spend / max(conversions, 1), 2)
    conversion_rate = round((conversions / max(clicks, 1)) * 100, 2)
    average_ticket = round(revenue / max(purchases, 1), 2) if purchases else 0
    cost_per_purchase = round(spend / max(purchases, 1), 2) if purchases else 0
    cost_per_lead = round(spend / max(leads, 1), 2) if leads else 0
    cost_per_message = round(spend / max(messages, 1), 2) if messages else 0
    clicks_without_conversion = max(clicks - conversions, 0)
    # The old dashboard showed reach/frequency when Meta returned them. The SaaS snapshot
    # does not store reach separately yet, so we keep the same fields with safe fallbacks.
    reach = impressions
    frequency = 1.0 if reach else 0.0

    previous_spend = _sum(row.spend for row in previous)
    previous_impressions = sum(row.impressions for row in previous)
    previous_clicks = sum(row.clicks for row in previous)
    previous_conversions = sum(row.conversions for row in previous)
    previous_revenue = _sum(row.revenue for row in previous)
    previous_purchases = sum(row.purchases for row in previous)
    previous_leads = sum(row.leads for row in previous)
    previous_messages = sum(row.messages for row in previous)
    previous_cpc = round(previous_spend / max(previous_clicks, 1), 2)
    previous_cpm = round((previous_spend / max(previous_impressions, 1)) * 1000, 2)
    previous_ctr = round((previous_clicks / max(previous_impressions, 1)) * 100, 2)
    previous_roas = round(previous_revenue / max(previous_spend, 1), 2)
    previous_cpa = round(previous_spend / max(previous_conversions, 1), 2)
    previous_conversion_rate = round((previous_conversions / max(previous_clicks, 1)) * 100, 2)
    previous_average_ticket = round(previous_revenue / max(previous_purchases, 1), 2) if previous_purchases else 0
    previous_cost_per_purchase = round(previous_spend / max(previous_purchases, 1), 2) if previous_purchases else 0
    previous_cost_per_lead = round(previous_spend / max(previous_leads, 1), 2) if previous_leads else 0
    previous_cost_per_message = round(previous_spend / max(previous_messages, 1), 2) if previous_messages else 0
    previous_clicks_without_conversion = max(previous_clicks - previous_conversions, 0)

    objectives = {
        "purchases": purchases,
        "leads": leads,
        "messages": messages,
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
            "purchases": row.purchases,
            "leads": row.leads,
            "messages": row.messages,
            "cpa": round(float(row.spend) / max(row.conversions, 1), 2),
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
            _metric("spend", "Investimento", spend, previous_spend, "currency"),
            _metric("impressions", "Impressões", impressions, previous_impressions, "number"),
            _metric("cpm", "CPM", cpm, previous_cpm, "currency"),
            _metric("reach", "Alcance", reach, previous_impressions, "number"),
            _metric("frequency", "Frequência", frequency, 1.0 if previous_impressions else 0.0, "decimal"),
            _metric("clicks", "Cliques no link", clicks, previous_clicks, "number"),
            _metric("cpc", "CPC", cpc, previous_cpc, "currency"),
            _metric("ctr", "CTR", ctr, previous_ctr, "percent"),
            _metric("totalConversions", "Conversões totais", conversions, previous_conversions, "number"),
            _metric("conversionRate", "Taxa de conversão", conversion_rate, previous_conversion_rate, "percent"),
            _metric("purchaseValue", "Faturamento", revenue, previous_revenue, "currency"),
            _metric("purchases", "Compras", purchases, previous_purchases, "number"),
            _metric("costPerPurchase", "Custo por compra", cost_per_purchase, previous_cost_per_purchase, "currency"),
            _metric("averageTicket", "Ticket médio", average_ticket, previous_average_ticket, "currency"),
            _metric("leads", "Leads", leads, previous_leads, "number"),
            _metric("costPerLead", "Custo por lead", cost_per_lead, previous_cost_per_lead, "currency"),
            _metric("messages", "Mensagens iniciadas", messages, previous_messages, "number"),
            _metric("costPerMessage", "Custo por mensagem", cost_per_message, previous_cost_per_message, "currency"),
            _metric("clicksWithoutConversion", "Cliques sem conversão", clicks_without_conversion, previous_clicks_without_conversion, "number"),
            _metric("roas", "ROAS consolidado", roas, previous_roas, "ratio"),
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
                "purchases": row.conversions if row.roas > 0 else 0,
                "leads": 0,
                "messages": 0,
                "purchase_value": round(float(row.spend) * row.roas, 2),
                "clicks": 0,
                "impressions": 0,
                "reach": 0,
                "ctr": 0,
                "cpc": 0,
                "cpm": 0,
                "frequency": 0,
                "conversion_rate": 0,
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
