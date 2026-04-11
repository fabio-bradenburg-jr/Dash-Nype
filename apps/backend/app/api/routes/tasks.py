from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import Client, Task, TaskStatus, User
from app.schemas.client import TaskResponse
from app.schemas.task import TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/clients/{client_id}", response_model=TaskResponse)
def create_task(client_id: str, payload: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    task = Task(tenant_id=user.tenant_id, client_id=client_id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status.value,
        due_date=task.due_date,
        assignee_name=task.assignee.full_name if task.assignee else None,
    )


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(task_id: str, payload: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task or task.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Task not found")
    changes = payload.model_dump(exclude_none=True)
    if "status" in changes:
        changes["status"] = TaskStatus(changes["status"])
    for key, value in changes.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status.value,
        due_date=task.due_date,
        assignee_name=task.assignee.full_name if task.assignee else None,
    )


@router.get("", response_model=list[TaskResponse])
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tasks = db.execute(select(Task).where(Task.tenant_id == user.tenant_id).order_by(Task.created_at.asc())).scalars().all()
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
