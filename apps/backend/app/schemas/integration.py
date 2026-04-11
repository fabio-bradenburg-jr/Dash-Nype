from typing import Optional

from pydantic import BaseModel


class IntegrationCreate(BaseModel):
    client_id: str
    provider: str
    account_name: str
    external_account_id: str
    access_token: str


class IntegrationResponse(BaseModel):
    id: str
    client_id: str
    provider: str
    status: str
    account_name: str
    external_account_id: str
    last_sync_at: Optional[str] = None
