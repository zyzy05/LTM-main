import json
from typing import Optional

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend import auth, crud
from .session_manager import SessionManager
from backend.database import SessionLocal
from .sync_manager import YjsDocumentStore


session_manager = SessionManager()
document_store = YjsDocumentStore()


def _authorize(document_id: str, token: Optional[str]) -> Optional[tuple[str, str, bool]]:
    if not token:
        return None
    db: Session = SessionLocal()
    try:
        document = crud.get_document(db, document_id)
        if document is None:
            return None
        try:
            user = auth.get_current_user_from_token(token, db)
        except HTTPException:
            return None
        role = crud.get_document_access_role(document, user.id)
        if role is None:
            return None
        return user.id, user.username, role == "editor"
    finally:
        db.close()


def _resolve_permission_change(
    document_id: str,
    owner_id: str,
    target_username: str,
) -> Optional[tuple[str, Optional[str]]]:
    db: Session = SessionLocal()
    try:
        document = crud.get_document(db, document_id)
        if document is None or document.owner_id != owner_id:
            return None
        target_user = crud.get_user_by_username(db, target_username)
        if target_user is None:
            return None
        return (
            target_user.id,
            crud.get_document_access_role(document, target_user.id),
        )
    finally:
        db.close()


async def document_websocket(websocket: WebSocket, document_id: str) -> None:
    token = websocket.query_params.get("token")
    authorization = await run_in_threadpool(_authorize, document_id, token)
    if authorization is None:
        await websocket.close(code=1008, reason="Invalid document or access denied")
        return

    client_id_value = websocket.query_params.get("client_id")
    try:
        client_id = int(client_id_value) if client_id_value is not None else -1
    except ValueError:
        client_id = -1
    if client_id < 0:
        await websocket.close(code=1008, reason="Invalid client identifier")
        return

    user_id, username, can_edit = authorization
    await websocket.accept()
    await session_manager.connect(document_id, websocket, client_id, user_id, username)
    await session_manager.broadcast_presence(document_id)
    try:
        await websocket.send_bytes(await document_store.initial_update(document_id))
        while True:
            message = await websocket.receive()
            if message.get("bytes") is not None:
                update = message["bytes"]
                if not update:
                    continue
                latest_permission = await run_in_threadpool(
                    _authorize, document_id, token
                )
                if latest_permission is None:
                    await websocket.close(code=1008, reason="Read-only access")
                    return
                if not latest_permission[2]:
                    await websocket.send_json(
                        {"type": "permission", "role": "viewer"}
                    )
                    continue
                try:
                    await document_store.apply_and_persist(document_id, update)
                except (ValueError, RuntimeError):
                    await websocket.send_json(
                        {"type": "error", "message": "Invalid Yjs update"}
                    )
                    continue
                await session_manager.broadcast(document_id, update, websocket)
            elif message.get("text") is not None:
                if message["text"] == "ping":
                    await websocket.send_text("pong")
                    continue
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    continue
                if payload.get("type") == "permissions-changed":
                    target_username = payload.get("username")
                    if not isinstance(target_username, str) or not target_username:
                        continue
                    permission_change = await run_in_threadpool(
                        _resolve_permission_change,
                        document_id,
                        user_id,
                        target_username,
                    )
                    if permission_change is None:
                        continue
                    target_user_id, role = permission_change
                    for session in await session_manager.sessions(document_id):
                        if session.user_id != target_user_id:
                            continue
                        try:
                            if role is None:
                                await session.websocket.close(
                                    code=1008,
                                    reason="Document access revoked",
                                )
                            else:
                                await session.websocket.send_json(
                                    {"type": "permission", "role": role}
                                )
                        except (WebSocketDisconnect, RuntimeError, OSError):
                            await session_manager.disconnect(
                                document_id, session.websocket
                            )
                    continue
                if payload.get("type") in {"awareness", "awareness-request"}:
                    await session_manager.broadcast_text(
                        document_id, message["text"], websocket
                    )
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await session_manager.disconnect(document_id, websocket)
        await session_manager.broadcast_presence(document_id)
