from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Optional
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet

from app.core.config import get_settings


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt_value = salt or base64.urlsafe_b64encode(os.urandom(16)).decode("utf-8")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_value.encode("utf-8"), 120_000)
    return f"{salt_value}${base64.urlsafe_b64encode(digest).decode('utf-8')}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, _ = stored_hash.split("$", 1)
    candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, stored_hash)


def create_access_token(subject: str, tenant_id: str, role: str) -> str:
    settings = get_settings()
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "tenant_id": tenant_id, "role": role, "exp": expire_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def _fernet() -> Fernet:
    settings = get_settings()
    digest = hashlib.sha256(settings.integration_token_secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(secret: str) -> str:
    return _fernet().decrypt(secret.encode("utf-8")).decode("utf-8")
