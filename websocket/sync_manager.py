import asyncio
from dataclasses import dataclass

from y_py import YDoc, apply_update, encode_state_as_update

from backend import models
from backend.database import SessionLocal
from .realtime_persistence import (
    get_saved_state,
    save_state,
)


@dataclass
class DocumentSyncState:
    document: YDoc
    lock: asyncio.Lock


class YjsDocumentStore:
    """Keeps active YDocs in memory and persists their binary Yjs state."""

    def __init__(self) -> None:
        self._documents: dict[str, DocumentSyncState] = {}
        self._lock = asyncio.Lock()

    async def get_or_load(self, document_id: str) -> DocumentSyncState:
        async with self._lock:
            current = self._documents.get(document_id)
            if current is not None:
                return current

            db = SessionLocal()
            try:
                state_bytes = get_saved_state(db, document_id)
                document = YDoc()
                if state_bytes:
                    apply_update(document, state_bytes)
                else:
                    source = db.query(models.Document).filter_by(id=document_id).first()
                    if source is None:
                        raise ValueError("Document does not exist")
                    with document.begin_transaction() as transaction:
                        document.get_text("content").insert(
                            transaction,
                            0,
                            source.content or "",
                        )
            finally:
                db.close()

            current = DocumentSyncState(document=document, lock=asyncio.Lock())
            self._documents[document_id] = current
            return current

    async def initial_update(self, document_id: str) -> bytes:
        state = await self.get_or_load(document_id)
        async with state.lock:
            return bytes(encode_state_as_update(state.document))

    async def apply_and_persist(self, document_id: str, update: bytes) -> None:
        state = await self.get_or_load(document_id)
        async with state.lock:
            apply_update(state.document, update)
            snapshot = bytes(encode_state_as_update(state.document))

            db = SessionLocal()
            try:
                save_state(db, document_id, snapshot)
            finally:
                db.close()

    async def unload(self, document_id: str) -> None:
        async with self._lock:
            self._documents.pop(document_id, None)
