import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

import { API_URL, WS_URL } from "../api/client.js";
import CollaborativeCanvas from "./editor/CollaborativeCanvas.jsx";
import { colorForUser } from "./editor/extensions.jsx";

function awarenessPayload(awareness, clientIds) {
  return JSON.stringify({
    type: "awareness",
    update: Array.from(encodeAwarenessUpdate(awareness, clientIds)),
  });
}

export default function DocumentEditor({
  document,
  token,
  username,
  onDocumentUpdated,
  isOwner,
  formatting,
  onFormattingChange,
}) {
  const [connection, setConnection] = useState("connecting");
  const [saveState, setSaveState] = useState("saved");
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(document.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [visibility, setVisibility] = useState(document.visibility || "private");
  const [publicRole, setPublicRole] = useState(document.public_role || "viewer");
  const [shareUsername, setShareUsername] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [sharedUsers, setSharedUsers] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [syncDoc, setSyncDoc] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [accessRole, setAccessRole] = useState(document.access_role);
  const yDocRef = useRef(null);
  const awarenessRef = useRef(null);
  const socketRef = useRef(null);
  const readyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const onDocumentUpdatedRef = useRef(onDocumentUpdated);
  const documentRef = useRef(document);
  const canEdit = accessRole === "editor";
  const canEditRef = useRef(canEdit);
  onDocumentUpdatedRef.current = onDocumentUpdated;
  documentRef.current = document;
  canEditRef.current = canEdit;

  useEffect(() => {
    setAccessRole(document.access_role);
  }, [document.id, document.access_role]);

  useEffect(() => {
    setVisibility(document.visibility || "private");
    setPublicRole(document.public_role || "viewer");
  }, [document.id, document.visibility, document.public_role]);

  useEffect(() => {
    setTitleDraft(document.title);
    setEditingTitle(false);
    setTitleError("");
  }, [document.id, document.title]);

  useEffect(() => {
    if (!permissionsOpen || !isOwner) return undefined;
    let active = true;
    setLoadingShares(true);
    fetch(`${API_URL}/api/documents/${document.id}/shares`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh sách chia sẻ.");
        return response.json();
      })
      .then((users) => {
        if (active) setSharedUsers(users);
      })
      .catch((loadError) => {
        if (active) setPermissionMessage(loadError.message);
      })
      .finally(() => {
        if (active) setLoadingShares(false);
      });

    return () => {
      active = false;
    };
  }, [document.id, isOwner, permissionsOpen, token]);

  const saveContent = useCallback((html) => {
    setSaveState("saving");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/api/documents/${document.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: html }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.detail || `Lỗi lưu tài liệu (${response.status})`);
        }
        const updated = await response.json();
        setSaveState("saved");
        setError("");
        onDocumentUpdatedRef.current(updated);
      } catch (saveError) {
        setSaveState("error");
        setError(`Không thể lưu tài liệu: ${saveError.message}`);
      }
    }, 650);
  }, [document.id, token]);

  useEffect(() => {
    const yDoc = new Y.Doc();
    const awareness = new Awareness(yDoc);
    let disposed = false;
    let reconnectTimer;
    let reconnectAttempts = 0;
    let participantRefreshFrame = 0;
    let socket;
    yDocRef.current = yDoc;
    awarenessRef.current = awareness;
    socketRef.current = null;
    readyRef.current = false;
    setSyncDoc(null);
    setParticipants([]);
    setConnection("connecting");
    setSaveState("saved");
    setError("");
    const localUser = { name: username, color: colorForUser(username) };

    const refreshParticipants = () => {
      const currentParticipants = Array.from(awareness.getStates().entries())
        .filter(([, state]) => state?.user?.name)
        .map(([clientId, state]) => ({
          clientId,
          name: state.user.name,
          color: state.user.color || colorForUser(state.user.name),
          isCurrentUser: clientId === yDoc.clientID,
        }));
      window.cancelAnimationFrame(participantRefreshFrame);
      participantRefreshFrame = window.requestAnimationFrame(() => {
        setParticipants(currentParticipants);
      });
    };
    const sendAwareness = () => {
      const activeSocket = socketRef.current;
      if (activeSocket?.readyState === WebSocket.OPEN) {
        activeSocket.send(awarenessPayload(awareness, [yDoc.clientID]));
      }
    };
    const onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      refreshParticipants();
      if (origin === "remote") return;
      const clients = [...added, ...updated, ...removed];
      const activeSocket = socketRef.current;
      if (clients.length && activeSocket?.readyState === WebSocket.OPEN) {
        activeSocket.send(awarenessPayload(awareness, clients));
      }
    };
    const onDocumentUpdate = (update, origin) => {
      const activeSocket = socketRef.current;
      if (
        origin !== "remote"
        && activeSocket?.readyState === WebSocket.OPEN
        && canEditRef.current
      ) {
        activeSocket.send(update);
      }
    };
    const connectSocket = () => {
      if (disposed) return;
      const activeSocket = new WebSocket(
        `${WS_URL}/ws/documents/${encodeURIComponent(document.id)}?token=${encodeURIComponent(token)}&client_id=${yDoc.clientID}`,
      );
      socket = activeSocket;
      activeSocket.binaryType = "arraybuffer";
      socketRef.current = activeSocket;
      setConnection("connecting");

      const onOpen = () => {
        reconnectAttempts = 0;
        setConnection("connected");
        awareness.setLocalStateField("user", localUser);
        if (canEditRef.current) {
          activeSocket.send(Y.encodeStateAsUpdate(yDoc));
        }
        sendAwareness();
        activeSocket.send(JSON.stringify({ type: "awareness-request" }));
      };
      const onMessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          try {
            Y.applyUpdate(yDoc, new Uint8Array(event.data), "remote");
            if (!readyRef.current) {
              readyRef.current = true;
              setSyncDoc({ documentId: document.id, yDoc });
            }
          } catch {
            setError("Không thể đồng bộ nội dung tài liệu.");
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "awareness") {
            applyAwarenessUpdate(awareness, Uint8Array.from(payload.update), "remote");
          } else if (payload.type === "awareness-request") {
            sendAwareness();
          } else if (payload.type === "participants") {
            const activeClientIds = new Set(
              (payload.sessions || []).map((session) => Number(session.client_id)),
            );
            const staleClientIds = Array.from(awareness.getStates().keys())
              .filter((clientId) => clientId !== yDoc.clientID && !activeClientIds.has(clientId));
            if (staleClientIds.length) {
              removeAwarenessStates(awareness, staleClientIds, "remote");
            }
          } else if (payload.type === "error") {
            setError(payload.message);
          } else if (payload.type === "permission") {
            if (payload.role === "editor" || payload.role === "viewer") {
              setAccessRole(payload.role);
              onDocumentUpdatedRef.current({
                ...documentRef.current,
                access_role: payload.role,
              });
            }
          }
        } catch {
          setError("Không thể đồng bộ con trỏ cộng tác.");
        }
      };
      const onError = () => activeSocket.close();
      const onClose = () => {
        activeSocket.removeEventListener("open", onOpen);
        activeSocket.removeEventListener("message", onMessage);
        activeSocket.removeEventListener("error", onError);
        activeSocket.removeEventListener("close", onClose);
        if (socketRef.current === activeSocket) socketRef.current = null;
        setConnection("disconnected");
        awareness.setLocalState(null);
        if (disposed) return;
        reconnectAttempts += 1;
        const delay = Math.min(1000 * (2 ** Math.min(reconnectAttempts - 1, 4)), 15000);
        reconnectTimer = window.setTimeout(connectSocket, delay);
      };
      activeSocket.addEventListener("open", onOpen);
      activeSocket.addEventListener("message", onMessage);
      activeSocket.addEventListener("error", onError);
      activeSocket.addEventListener("close", onClose);
    };

    awareness.on("update", onAwarenessUpdate);
    refreshParticipants();
    connectSocket();
    const keepAwarenessAlive = window.setInterval(sendAwareness, 15000);
    yDoc.on("update", onDocumentUpdate);

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(saveTimerRef.current);
      window.clearInterval(keepAwarenessAlive);
      yDoc.off("update", onDocumentUpdate);
      awareness.off("update", onAwarenessUpdate);
      socket?.close();
      awareness.destroy();
      yDoc.destroy();
      yDocRef.current = null;
      awarenessRef.current = null;
      socketRef.current = null;
      readyRef.current = false;
      window.cancelAnimationFrame(participantRefreshFrame);
    };
  }, [document.id, token, username]);

  async function saveVisibility(event) {
    event.preventDefault();
    setPermissionBusy(true);
    setPermissionMessage("");
    try {
      const response = await fetch(`${API_URL}/api/documents/${document.id}/visibility`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visibility,
          public_role: visibility === "public" ? publicRole : null,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "Không thể cập nhật quyền.");
      }
      onDocumentUpdated(await response.json());
      setPermissionMessage("Đã cập nhật quyền truy cập.");
    } catch (permissionError) {
      setPermissionMessage(permissionError.message);
    } finally {
      setPermissionBusy(false);
    }
  }

  async function shareDocument(event) {
    event.preventDefault();
    setPermissionBusy(true);
    setPermissionMessage("");
    try {
      const response = await fetch(`${API_URL}/api/documents/${document.id}/share`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: shareUsername.trim(), role: shareRole }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || "Không thể chia sẻ tài liệu.");
      }
      const usersResponse = await fetch(`${API_URL}/api/documents/${document.id}/shares`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!usersResponse.ok) {
        throw new Error("Đã chia sẻ nhưng không thể tải lại danh sách.");
      }
      setSharedUsers(await usersResponse.json());
      const activeSocket = socketRef.current;
      if (activeSocket?.readyState === WebSocket.OPEN) {
        activeSocket.send(JSON.stringify({
          type: "permissions-changed",
          username: shareUsername.trim(),
        }));
      }
      setPermissionMessage(`Đã chia sẻ tài liệu với ${shareUsername.trim()}.`);
      setShareUsername("");
    } catch (permissionError) {
      setPermissionMessage(permissionError.message);
    } finally {
      setPermissionBusy(false);
    }
  }

  async function saveTitle(event) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) {
      setTitleError("Tên tài liệu không được để trống.");
      return;
    }
    if (title === document.title) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    setTitleError("");
    try {
      const response = await fetch(`${API_URL}/api/documents/${document.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail || `Không thể đổi tên (${response.status})`);
      }
      onDocumentUpdated(await response.json());
      setEditingTitle(false);
    } catch (renameError) {
      setTitleError(renameError.message);
    } finally {
      setSavingTitle(false);
    }
  }

  return (
    <section className="editor-panel">
      <header className="document-header">
        <div className="document-heading">
          <span className="file-icon" aria-hidden="true">▤</span>
          {editingTitle ? (
            <form className="document-title-form" onSubmit={saveTitle}>
              <input
                aria-label="Tên tài liệu"
                autoFocus
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setTitleDraft(document.title);
                    setEditingTitle(false);
                  }
                }}
                value={titleDraft}
              />
              <button aria-label="Lưu tên tài liệu" disabled={savingTitle} type="submit">✓</button>
            </form>
          ) : (
            <>
              <h1>{document.title}</h1>
              {canEdit && (
                <button
                  aria-label="Đổi tên tài liệu"
                  className="document-title-edit"
                  onClick={() => {
                    setTitleDraft(document.title);
                    setTitleError("");
                    setEditingTitle(true);
                  }}
                  title="Đổi tên tài liệu"
                  type="button"
                >
                  ✎
                </button>
              )}
            </>
          )}
        </div>
        <div className="document-header-actions">
          {isOwner && (
            <button
              aria-expanded={permissionsOpen}
              className="permission-toggle"
              onClick={() => {
                setPermissionsOpen((open) => !open);
                setPermissionMessage("");
              }}
              type="button"
            >
              Quyền truy cập
            </button>
          )}
          <div
            aria-label={`${participants.length} người tham gia tài liệu`}
            className="active-participants"
          >
            <span className="participant-count">{participants.length} người tham gia</span>
            <div className="participant-avatars">
              {participants.map((participant) => (
                <span
                  aria-label={`${participant.name}${participant.isCurrentUser ? " (bạn)" : ""}`}
                  className="participant-avatar"
                  key={participant.clientId}
                  style={{ backgroundColor: participant.color }}
                  title={`${participant.name}${participant.isCurrentUser ? " (bạn)" : ""}`}
                >
                  {participant.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          <span className={`connection-dot ${connection}`} />
          <span>{connection === "connected" ? "Đã kết nối" : connection === "connecting" ? "Đang kết nối" : "Mất kết nối"}</span>
          <span className="status-divider">·</span>
          <span>{saveState === "saving" ? "Đang lưu…" : saveState === "error" ? "Lỗi lưu" : "Đã lưu"}</span>
          {!canEdit && <span className="read-only-badge">Chỉ xem</span>}
        </div>
      </header>

      {titleError && <p className="editor-error title-error" role="alert">{titleError}</p>}
      {permissionsOpen && isOwner && (
        <section className="permissions-panel" aria-label="Quyền truy cập tài liệu">
          <form className="permission-section" onSubmit={saveVisibility}>
            <div>
              <h2>Truy cập công khai</h2>
              <p>Cho phép mọi người có liên kết xem hoặc chỉnh sửa tài liệu.</p>
            </div>
            <label className="permission-control">
              <span>Chế độ</span>
              <select onChange={(event) => setVisibility(event.target.value)} value={visibility}>
                <option value="private">Riêng tư</option>
                <option value="public">Công khai</option>
              </select>
            </label>
            {visibility === "public" && (
              <label className="permission-control">
                <span>Quyền công khai</span>
                <select onChange={(event) => setPublicRole(event.target.value)} value={publicRole}>
                  <option value="viewer">Chỉ xem</option>
                  <option value="editor">Được chỉnh sửa</option>
                </select>
              </label>
            )}
            <button className="small-primary-button" disabled={permissionBusy} type="submit">Lưu quyền</button>
          </form>
          <form className="permission-section share-form" onSubmit={shareDocument}>
            <div>
              <h2>Chia sẻ với người dùng</h2>
              <p>Nhập tên đăng nhập và cấp quyền xem hoặc chỉnh sửa.</p>
            </div>
            <label className="permission-control">
              <span>Tên đăng nhập</span>
              <input onChange={(event) => setShareUsername(event.target.value)} required value={shareUsername} />
            </label>
            <label className="permission-control">
              <span>Quyền</span>
              <select onChange={(event) => setShareRole(event.target.value)} value={shareRole}>
                <option value="viewer">Chỉ xem</option>
                <option value="editor">Được chỉnh sửa</option>
              </select>
            </label>
            <button className="small-primary-button" disabled={permissionBusy} type="submit">Chia sẻ</button>
          </form>
          <div className="shared-users">
            <h2>Người được phép truy cập</h2>
            {loadingShares ? <p>Đang tải danh sách…</p> : sharedUsers.length ? (
              <ul>
                {sharedUsers.map((user) => (
                  <li key={user.username}>
                    <span className="shared-user-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
                    <span className="shared-user-name">{user.username}</span>
                    <span className="shared-user-role">{user.role === "editor" ? "Được chỉnh sửa" : "Chỉ xem"}</span>
                  </li>
                ))}
              </ul>
            ) : <p>Chưa chia sẻ với người dùng nào.</p>}
          </div>
          {permissionMessage && <p className="permission-message" role="status">{permissionMessage}</p>}
        </section>
      )}
      {error && <p className="editor-error" role="alert">{error}</p>}
      {syncDoc?.documentId === document.id ? (
        <CollaborativeCanvas
          awareness={awarenessRef.current}
          canEdit={canEdit}
          document={document}
          formatting={formatting}
          onFormattingChange={onFormattingChange}
          onSaveState={saveContent}
          token={token}
          username={username}
          yDoc={syncDoc.yDoc}
          key={document.id}
        />
      ) : (
        <div className="editor-loading">Đang mở tài liệu…</div>
      )}
    </section>
  );
}
