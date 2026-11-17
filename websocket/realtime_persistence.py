from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend import models
from backend.database import begin_immediate_transaction


def get_saved_state(db: Session, document_id: str) -> Optional[bytes]:
    state = (
        db.query(models.DocumentYjsState)
        .filter(models.DocumentYjsState.document_id == document_id)
        .first()
    )
    return bytes(state.state) if state else None


def save_state(
    db: Session,
    document_id: str,
    state_bytes: bytes,
) -> None:
    begin_immediate_transaction(db)
    state = (
        db.query(models.DocumentYjsState)
        .filter(models.DocumentYjsState.document_id == document_id)
        .first()
    )
    if state is None:
        state = models.DocumentYjsState(document_id=document_id)
        db.add(state)

    state.state = state_bytes
    state.updated_at = datetime.utcnow()

    document = (
        db.query(models.Document)
        .filter(models.Document.id == document_id)
        .first()
    )
    if document is None:
        raise ValueError(f"Document {document_id} no longer exists")

    document.updated_at = datetime.utcnow()
    db.commit()
