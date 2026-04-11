from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import encrypt_secret
from app.db.session import get_db
from app.models.entities import Client, Integration, IntegrationProvider, User
from app.schemas.integration import IntegrationCreate, IntegrationResponse
from app.services.integrations import run_mock_sync

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("", response_model=list[IntegrationResponse])
def list_integrations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Integration).where(Integration.tenant_id == user.tenant_id)).scalars().all()
    return [
        IntegrationResponse(
            id=row.id,
            client_id=row.client_id,
            provider=row.provider.value,
            status=row.status.value,
            account_name=row.account_name,
            external_account_id=row.external_account_id,
            last_sync_at=row.last_sync_at.isoformat() if row.last_sync_at else None,
        )
        for row in rows
    ]


@router.post("", response_model=IntegrationResponse)
def create_integration(payload: IntegrationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, payload.client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")

    integration = Integration(
        tenant_id=user.tenant_id,
        client_id=payload.client_id,
        provider=IntegrationProvider(payload.provider),
        account_name=payload.account_name,
        external_account_id=payload.external_account_id,
        access_token_encrypted=encrypt_secret(payload.access_token),
    )
    db.add(integration)
    db.commit()
    db.refresh(integration)

    return IntegrationResponse(
        id=integration.id,
        client_id=integration.client_id,
        provider=integration.provider.value,
        status=integration.status.value,
        account_name=integration.account_name,
        external_account_id=integration.external_account_id,
        last_sync_at=integration.last_sync_at.isoformat() if integration.last_sync_at else None,
    )


@router.post("/{integration_id}/sync")
def sync_integration(integration_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    integration = db.get(Integration, integration_id)
    if not integration or integration.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Integration not found")
    run_mock_sync(db, integration)
    db.commit()
    return {"status": "synced", "integration_id": integration.id}
