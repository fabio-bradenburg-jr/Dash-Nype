from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import User
from app.schemas.settings import ThemeSettingsResponse, ThemeSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/theme", response_model=ThemeSettingsResponse)
def get_theme(user: User = Depends(get_current_user)):
    tenant = user.tenant
    return ThemeSettingsResponse(
        primary_color=tenant.primary_color,
        accent_color=tenant.accent_color,
        background_color=tenant.background_color,
        dark_mode=tenant.dark_mode,
    )


@router.put("/theme", response_model=ThemeSettingsResponse)
def update_theme(payload: ThemeSettingsUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant = user.tenant
    tenant.primary_color = payload.primary_color
    tenant.accent_color = payload.accent_color
    tenant.background_color = payload.background_color
    tenant.dark_mode = payload.dark_mode
    db.commit()
    return payload
