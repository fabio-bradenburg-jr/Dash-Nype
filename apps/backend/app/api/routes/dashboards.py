from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import Client, User
from app.schemas.dashboard import ClientDashboardResponse, OperationsDashboardResponse
from app.services.dashboard import build_client_dashboard, build_operations_dashboard

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("/clients/{client_id}", response_model=ClientDashboardResponse)
def client_dashboard(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientDashboardResponse(**build_client_dashboard(db, client))


@router.get("/operations", response_model=OperationsDashboardResponse)
def operations_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return OperationsDashboardResponse(**build_operations_dashboard(db, user.tenant_id))
