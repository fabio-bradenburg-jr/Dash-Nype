from __future__ import annotations

from datetime import date, timedelta
from random import Random

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.entities import CampaignSnapshot, Integration, IntegrationProvider, IntegrationStatus, MetricSnapshot


OBJECTIVE_MAP = {
    "purchases": "conversions",
    "leads": "conversions",
    "conversions": "conversions",
    "messages": "messages",
}


def normalize_metric_name(metric_name: str) -> str:
    return OBJECTIVE_MAP.get(metric_name, metric_name)


def mock_campaign_payload(provider: IntegrationProvider, client_name: str) -> list[dict]:
    seed = Random(f"{provider.value}:{client_name}")
    campaigns = []
    objectives = ["purchases", "leads", "messages"]
    for idx in range(3):
        spend = round(seed.uniform(140, 540), 2)
        conversions = seed.randint(8, 36)
        revenue = round(spend * seed.uniform(1.8, 4.8), 2)
        campaigns.append(
            {
                "campaign_name": f"{client_name} | {provider.value.replace('_', ' ').title()} #{idx + 1}",
                "status": "ACTIVE" if idx < 2 else "LEARNING",
                "objective": objectives[idx],
                "spend": spend,
                "impressions": seed.randint(8_000, 35_000),
                "clicks": seed.randint(650, 2_400),
                "conversions": conversions,
                "revenue": revenue,
                "top_cities": [{"city": city, "value": seed.randint(8, 40)} for city in ["Sao Paulo", "Rio", "Campinas"]],
                "top_creatives": [{"creative": f"UGC {idx + 1}", "roas": round(seed.uniform(1.3, 4.2), 2)} for idx in range(3)],
                "age_performance": [{"range": bucket, "roas": round(seed.uniform(1.1, 4.5), 2)} for bucket in ["18-24", "25-34", "35-44"]],
            }
        )
    return campaigns


def run_mock_sync(db: Session, integration: Integration) -> None:
    client = integration.client
    today = date.today()
    seed_payload = mock_campaign_payload(integration.provider, client.name)

    db.execute(
        delete(CampaignSnapshot).where(
            CampaignSnapshot.client_id == client.id,
            CampaignSnapshot.source == integration.provider,
        )
    )

    for offset in range(14):
        day = today - timedelta(days=13 - offset)
        multiplier = 0.85 + (offset / 20)
        daily_spend = 0.0
        daily_impressions = 0
        daily_clicks = 0
        daily_conversions = 0
        daily_messages = 0
        daily_leads = 0
        daily_purchases = 0
        daily_revenue = 0.0
        cities = []
        creatives = []
        ages = []

        for campaign in seed_payload:
            spend = round(campaign["spend"] * multiplier / 3, 2)
            conversions = max(1, int(campaign["conversions"] * multiplier / 3))
            objective = campaign["objective"]
            revenue = round(campaign["revenue"] * multiplier / 3, 2)
            daily_spend += spend
            daily_impressions += int(campaign["impressions"] * multiplier / 3)
            daily_clicks += int(campaign["clicks"] * multiplier / 3)
            daily_conversions += conversions
            daily_revenue += revenue

            if objective == "messages":
                daily_messages += conversions
            elif objective == "leads":
                daily_leads += conversions
            else:
                daily_purchases += conversions

            cities.extend(campaign["top_cities"])
            creatives.extend(campaign["top_creatives"])
            ages.extend(campaign["age_performance"])

            if offset == 13:
                db.add(
                    CampaignSnapshot(
                        tenant_id=integration.tenant_id,
                        client_id=client.id,
                        source=integration.provider,
                        campaign_name=campaign["campaign_name"],
                        status=campaign["status"],
                        spend=spend,
                        conversions=conversions,
                        cpa=round(spend / max(conversions, 1), 2),
                        roas=round(revenue / max(spend, 1), 2),
                        metric_date=day,
                    )
                )

        db.add(
            MetricSnapshot(
                tenant_id=integration.tenant_id,
                client_id=client.id,
                source=integration.provider,
                metric_date=day,
                spend=round(daily_spend, 2),
                impressions=daily_impressions,
                clicks=daily_clicks,
                conversions=daily_conversions,
                messages=daily_messages,
                leads=daily_leads,
                purchases=daily_purchases,
                revenue=round(daily_revenue, 2),
                top_cities=cities[:3],
                top_creatives=creatives[:3],
                age_performance=ages[:3],
            )
        )

    integration.status = IntegrationStatus.CONNECTED
    integration.last_sync_at = __import__("datetime").datetime.utcnow()
