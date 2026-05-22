from fastapi import FastAPI

from app.schemas import AnalyzeClientRequest, AnalyzeClientResponse
from app.services.risk_engine import build_summary


app = FastAPI(
    title="Nype AI Service",
    version="0.1.0",
    description="Microservico de IA para leitura de risco, churn e recomendacoes operacionais.",
)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.post("/analyze-client", response_model=AnalyzeClientResponse)
def analyze_client(payload: AnalyzeClientRequest):
    return build_summary(payload)
