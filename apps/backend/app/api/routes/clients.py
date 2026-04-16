from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import ChecklistItem, Client, ClientStatus, ObjectiveType, Task, User
from app.schemas.client import ChecklistItemResponse, ClientCreate, ClientResponse, ClientUpdate, TaskResponse
from app.services.dashboard import build_client_dashboard

router = APIRouter(prefix="/clients", tags=["clients"])


def _serialize_client(client: Client, db: Session) -> ClientResponse:
    dashboard = build_client_dashboard(db, client)
    last_sync = max((integration.last_sync_at for integration in client.integrations if integration.last_sync_at), default=None)
    return ClientResponse(
        id=client.id,
        tenant_id=client.tenant_id,
        name=client.name,
        company=client.company,
        niche=client.niche,
        average_ticket=float(client.average_ticket),
        main_goal=client.main_goal.value,
        ltv=float(client.ltv),
        start_date=client.start_date,
        status=client.status.value,
        target_roas=client.target_roas,
        business_data=client.business_data,
        last_sync_at=last_sync.isoformat() if last_sync else None,
    )


@router.get("", response_model=list[ClientResponse])
def list_clients(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    clients = db.execute(select(Client).where(Client.tenant_id == user.tenant_id).order_by(Client.created_at.desc())).scalars().all()
    return [_serialize_client(client, db) for client in clients]


@router.post("", response_model=ClientResponse)
def create_client(payload: ClientCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["main_goal"] = ObjectiveType(data["main_goal"])
    data["status"] = ClientStatus(data["status"])
    client = Client(tenant_id=user.tenant_id, **data)
    db.add(client)
    db.commit()
    db.refresh(client)
    return _serialize_client(client, db)


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    return _serialize_client(client, db)


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(client_id: str, payload: ClientUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        if key == "main_goal":
            value = ObjectiveType(value)
        if key == "status":
            value = ClientStatus(value)
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    return _serialize_client(client, db)


@router.delete("/{client_id}")
def delete_client(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
    return {"status": "deleted"}


@router.get("/{client_id}/checklist", response_model=list[ChecklistItemResponse])
def client_checklist(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    items = db.execute(select(ChecklistItem).where(ChecklistItem.client_id == client_id)).scalars().all()
    return [ChecklistItemResponse(id=item.id, key=item.key.value, label=item.label, completed=item.completed) for item in items]


@router.get("/{client_id}/tasks", response_model=list[TaskResponse])
def client_tasks(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    tasks = db.execute(select(Task).where(Task.client_id == client_id).order_by(Task.created_at.asc())).scalars().all()
    return [
        TaskResponse(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status.value,
            due_date=task.due_date,
            assignee_name=task.assignee.full_name if task.assignee else None,
        )
        for task in tasks
    ]
