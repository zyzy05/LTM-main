from fastapi import FastAPI, WebSocket

from .websocket import document_websocket


app = FastAPI(title="Collaborative Editor WebSocket")


@app.websocket("/ws/documents/{document_id}")
async def document_sync_websocket(websocket: WebSocket, document_id: str) -> None:
    await document_websocket(websocket, document_id)


# Run with: python -m uvicorn websocket.ws_main:app --host 127.0.0.1 --port 1234
