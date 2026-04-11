from __future__ import annotations

from dataclasses import dataclass


@dataclass
class HealthScoreResult:
    score: int
    band: str


def calculate_health_score(*, current_conversions: int, previous_conversions: int, cpa: float, target_cpa: float, roas: float, target_roas: float, inactive_days: int) -> HealthScoreResult:
    score = 100

    if previous_conversions > 0:
        delta = (current_conversions - previous_conversions) / previous_conversions
        if delta <= -0.25:
            score -= 30
        elif delta < 0:
            score -= 15

    if cpa > target_cpa:
        score -= 25 if cpa >= target_cpa * 1.25 else 15

    if roas < target_roas:
        score -= 25 if roas <= max(target_roas * 0.7, 0.5) else 15

    if inactive_days >= 10:
        score -= 20
    elif inactive_days >= 5:
        score -= 10

    score = max(0, min(100, score))
    band = "green" if score >= 75 else "yellow" if score >= 50 else "red"
    return HealthScoreResult(score=score, band=band)
