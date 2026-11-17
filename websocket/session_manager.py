import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect

from .connection_manager import DocumentConnectionManager


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClientSession:
    session_id: str
    document_id: str
    client_id: int
    user_id: str
    username: str
    status: str
    connected_at: str
    websocket: WebSocket

    def to_payload(self) -> dict[str, str | int]:
        return {
            "session_id": self.session_id,
            "client_id": self.client_id,
            "user_id": self.user_id,
            "username": self.username,
            "status": self.status,
            "connected_at": self.connected_at,
        }


class SessionManager(DocumentConnectionManager):
    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[str, dict[str, ClientSession]] = {}
        self._session_lock = asyncio.Lock()

    async def connect(
        self,
        document_id: str,
        websocket: WebSocket,
        client_id: int,
        user_id: str,
        username: str,
    ) -> ClientSession:
        session = ClientSession(
            session_id=str(uuid.uuid4()),
            document_id=document_id,
            client_id=client_id,
            user_id=user_id,
            username=username,
            status="connected",
            connected_at=datetime.now(timezone.utc).isoformat(),
            websocket=websocket,
        )
        await super().connect(document_id, websocket)
        async with self._session_lock:
            self._sessions.setdefault(document_id, {})[session.session_id] = session
        return session

    async def disconnect(self, document_id: str, websocket: WebSocket) -> None:
        await super().disconnect(document_id, websocket)
        async with self._session_lock:
            sessions = self._sessions.get(document_id)
            if sessions is None:
                return
            for session_id, session in list(sessions.items()):
                if session.websocket is websocket:
                    sessions.pop(session_id)
            if not sessions:
                self._sessions.pop(document_id, None)

    async def sessions(self, document_id: str) -> list[ClientSession]:
        async with self._session_lock:
            return list(self._sessions.get(document_id, {}).values())

    async def _remove_failed_client(self, document_id: str, client: WebSocket) -> None:
        await self.disconnect(document_id, client)
        await self.broadcast_presence(document_id)

    async def broadcast_presence(self, document_id: str) -> None:
        while True:
            payload = {
                "type": "participants",
                "sessions": [
                    session.to_payload()
                    for session in await self.sessions(document_id)
                ],
            }
            failed: list[WebSocket] = []
            for client in await self.clients(document_id):
                try:
                    await client.send_json(payload)
                except (WebSocketDisconnect, RuntimeError, OSError):
                    failed.append(client)
            if not failed:
                return
            for client in failed:
                logger.debug("Removing disconnected session for document %s", document_id)
                await self.disconnect(document_id, client)
