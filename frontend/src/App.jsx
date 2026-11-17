import { useCallback, useEffect, useRef, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import DocumentSidebar from "./components/DocumentSidebar.jsx";
import DocumentEditor from "./components/DocumentEditor.jsx";
import HomePage from "./components/HomePage.jsx";
import { getErrorMessage, request } from "./api/client.js";
import {
  DEFAULT_FORMATTING,
  FORMATTING_KEY,
  loadFormattingPreferences,
} from "./utils/formattingPreferences.js";

const TOKEN_KEY = "giay_access_token";
const USER_KEY = "giay_username";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [username, setUsername] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [documents, setDocuments] = useState([]);
  const [formatting, setFormatting] = useState(loadFormattingPreferences);
  const [ownedDocumentIds, setOwnedDocumentIds] = useState(() => new Set());
  const [activeDocument, setActiveDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutInProgress = useRef(false);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const onDocumentUpdated = useCallback((updated) => {
    setActiveDocument((current) => current?.id === updated.id
      ? { ...updated, access_role: updated.access_role || current.access_role }
      : current);
    setDocuments((current) =>
      current.map((document) => document.id === updated.id
        ? { ...updated, access_role: updated.access_role || document.access_role }
        : document),
    );
  }, []);

  const clearAuthentication = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUsername("");
    setDocuments([]);
    setOwnedDocumentIds(new Set());
    setActiveDocument(null);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("/api/documents/", token);
      setDocuments([...result.owned, ...result.shared]);
      setOwnedDocumentIds(new Set(result.owned.map((document) => document.id)));
    } catch (loadError) {
      if (loadError?.status === 401) {
        clearAuthentication();
        return;
      }
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [clearAuthentication, token]);

  useEffect(() => {
    if (token) loadDocuments();
  }, [token, loadDocuments]);

  useEffect(() => {
    sessionStorage.setItem(FORMATTING_KEY, JSON.stringify(formatting));
  }, [formatting]);

  function authenticate(accessToken, name) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, name);
    setError("");
    setToken(accessToken);
    setUsername(name);
  }

  async function openDocument(id) {
    setError("");
    try {
      const result = await request(`/api/documents/${id}`, token);
      setActiveDocument(result);
    } catch (openError) {
      setError(getErrorMessage(openError));
    }
  }

  function goHome() {
    setActiveDocument(null);
    setEditingDocumentId(null);
    setContextMenu(null);
    setError("");
  }

  function startRenaming(event, document) {
    event.stopPropagation();
    setEditingDocumentId(document.id);
    setTitleDraft(document.title);
    setError("");
  }

  async function saveTitle(event, document) {
    event?.preventDefault();
    event?.stopPropagation();
    const title = titleDraft.trim();
    if (!title) {
      setError("Tên tài liệu không được để trống.");
      return;
    }
    if (title === document.title) {
      setEditingDocumentId(null);
      return;
    }

    setSavingTitle(true);
    setError("");
    try {
      const updated = await request(`/api/documents/${document.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ title }),
      });
      onDocumentUpdated(updated);
      setEditingDocumentId(null);
    } catch (renameError) {
      setError(`Không thể đổi tên tài liệu: ${getErrorMessage(renameError)}`);
    } finally {
      setSavingTitle(false);
    }
  }

  async function deleteDocument(document) {
    setContextMenu(null);
    // if (!window.confirm(`Xóa tài liệu "${document.title}"? Thao tác này không thể hoàn tác.`)) return;
    setDeletingDocumentId(document.id);
    setError("");
    try {
      await request(`/api/documents/${document.id}`, token, { method: "DELETE" });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setOwnedDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
      setActiveDocument((current) => current?.id === document.id ? null : current);
    } catch (deleteError) {
      setError(`Không thể xóa tài liệu: ${getErrorMessage(deleteError)}`);
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function createDocument() {
    setCreating(true);
    setError("");
    try {
      const result = await request("/api/documents/", token, {
        method: "POST",
        body: JSON.stringify({ title: "Tài liệu chưa có tiêu đề" }),
      });
      setDocuments((current) => [result, ...current]);
      setOwnedDocumentIds((current) => new Set([...current, result.id]));
      setActiveDocument({ ...result, access_role: "editor" });
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    setLoggingOut(true);
    setError("");
    try {
      await request("/api/auth/logout", token, { method: "POST" });
    } catch (logoutError) {
      setError(`Đã đăng xuất khỏi thiết bị này nhưng không thể thu hồi phiên trên máy chủ: ${getErrorMessage(logoutError)}`);
    } finally {
      clearAuthentication();
      setFormatting(DEFAULT_FORMATTING);
      logoutInProgress.current = false;
      setLoggingOut(false);
    }
  }

  if (!token) return <AuthScreen onAuthenticated={authenticate} sessionError={error} />;

  return (
    <main
      className={`workspace ${activeDocument ? "editor-workspace" : ""}`}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <DocumentSidebar
        activeDocument={activeDocument}
        documents={documents}
        ownedDocumentIds={ownedDocumentIds}
        loading={loading}
        creating={creating}
        editingDocumentId={editingDocumentId}
        titleDraft={titleDraft}
        savingTitle={savingTitle}
        contextMenu={contextMenu}
        deletingDocumentId={deletingDocumentId}
        loggingOut={loggingOut}
        username={username}
        onGoHome={goHome}
        onCreateDocument={createDocument}
        onOpenDocument={openDocument}
        onStartRenaming={startRenaming}
        onTitleDraftChange={setTitleDraft}
        onCancelRename={() => setEditingDocumentId(null)}
        onSaveTitle={saveTitle}
        onContextMenuChange={setContextMenu}
        onDeleteDocument={deleteDocument}
        onLogout={logout}
      />

      <div className={`main-area ${activeDocument ? "" : "main-area-home"}`}>
        {error && <div className="global-error" role="alert">{error}</div>}
        {activeDocument ? (
          <DocumentEditor
            document={activeDocument}
            isOwner={ownedDocumentIds.has(activeDocument.id)}
            onDocumentUpdated={onDocumentUpdated}
            formatting={formatting}
            onFormattingChange={setFormatting}
            token={token}
            username={username}
          />
        ) : (
          <HomePage
            documents={documents}
            ownedDocumentIds={ownedDocumentIds}
            loading={loading}
            creating={creating}
            onCreateDocument={createDocument}
            onOpenDocument={openDocument}
          />
        )}
      </div>
    </main>
  );
}
