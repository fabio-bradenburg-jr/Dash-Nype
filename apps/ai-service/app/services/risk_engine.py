from app.schemas import AnalyzeClientRequest, AnalyzeClientResponse


def build_summary(payload: AnalyzeClientRequest) -> AnalyzeClientResponse:
    risk_reason = ", ".join(payload.reasons[:3]) if payload.reasons else "sem sinais críticos explícitos"

    if payload.churnScore >= 61:
        urgency = "high"
        recommendations = [
            "Executar plano de recuperação com owner definido em até 48 horas.",
            "Reposicionar investimento para canais com melhor eficiência marginal.",
            "Agendar reunião executiva com stakeholder principal e apresentar plano de reversão.",
        ]
    elif payload.churnScore >= 31:
        urgency = "medium"
        recommendations = [
            "Revisar gargalos operacionais e corrigir tarefas atrasadas da carteira.",
            "Aumentar cadência de acompanhamento com o cliente nas próximas duas semanas.",
            "Monitorar ROI e engajamento em janela semanal até estabilização.",
        ]
    else:
        urgency = "low"
        recommendations = [
            "Manter monitoramento contínuo com revisões quinzenais.",
            "Explorar oportunidades de expansão com base em performance e margem.",
            "Registrar aprendizados para replicar a estratégia em contas similares.",
        ]

    summary = (
        f"Cliente {payload.clientName} com health score {payload.healthScore:.0f} "
        f"({payload.healthBand}) e churn score {payload.churnScore:.0f} ({payload.churnBand})."
    )

    return AnalyzeClientResponse(
        summary=summary,
        risk_reason=(
            f"Risco concentrado em {risk_reason}."
            if payload.reasons
            else "Sem risco crítico dominante, mas o monitoramento deve seguir ativo."
        ),
        recommendations=recommendations,
        urgency=urgency,
    )
