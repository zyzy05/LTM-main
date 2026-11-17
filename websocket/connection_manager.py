import asyncio
from collections import defaultdict
from typing import DefaultDict, Set

from fastapi import WebSocket, WebSocketDisconnect


class DocumentConnectionManager:
    def __init__(self) -> None:
        self._connections: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, document_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[document_id].add(websocket)

    async def disconnect(self, document_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._connections.get(document_id)
            if clients is None:
                return
            clients.discard(websocket)
            if not clients:
                self._connections.pop(document_id, None)

    async def clients(self, document_id: str) -> list[WebSocket]:
        async with self._lock:
            return list(self._connections.get(document_id, set()))

    async def count(self, document_id: str) -> int:
        async with self._lock:
            return len(self._connections.get(document_id, set()))

    async def _remove_failed_client(self, document_id: str, client: WebSocket) -> None:
        await self.disconnect(document_id, client)

    async def broadcast(
        self,
        document_id: str,
        payload: bytes,
        sender: WebSocket,
    ) -> None:
        clients = await self.clients(document_id)
        failed: list[WebSocket] = []
        for client in clients:
            if client is sender:
                continue
            try:
                await client.send_bytes(payload)
            except (WebSocketDisconnect, RuntimeError, OSError):
                failed.append(client)

        for client in failed:
            await self._remove_failed_client(document_id, client)

    async def broadcast_text(
        self,
        document_id: str,
        payload: str,
        sender: WebSocket,
    ) -> None:
        clients = await self.clients(document_id)
        failed: list[WebSocket] = []
        for client in clients:
            if client is sender:
                continue
            try:
                await client.send_text(payload)
            except (WebSocketDisconnect, RuntimeError, OSError):
                failed.append(client)

        for client in failed:
            await self._remove_failed_client(document_id, client)
