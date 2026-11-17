import { documentDate } from "../utils/document.js";

export default function DocumentSidebar({
  activeDocument,
  documents,
  ownedDocumentIds,
  loading,
  creating,
  editingDocumentId,
  titleDraft,
  savingTitle,
  contextMenu,
  deletingDocumentId,
  loggingOut,
  username,
  onGoHome,
  onCreateDocument,
  onOpenDocument,
  onStartRenaming,
  onTitleDraftChange,
  onCancelRename,
  onSaveTitle,
  onContextMenuChange,
  onDeleteDocument,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <button
        aria-current={activeDocument ? undefined : "page"}
        aria-label="Về trang chủ"
        className="sidebar-brand"
        onClick={onGoHome}
        title="Trang chủ"
        type="button"
      >
        <span className="brand-mark small" aria-hidden="true">idoc</span>
        <span>idoc</span>
      </button>
      <div className="sidebar-section">
        <div className="section-heading">
          <span>{activeDocument ? "Document tabs" : "TÀI LIỆU CỦA BẠN"}</span>
          <button
            aria-label="Tạo tài liệu mới"
            className="icon-button"
            disabled={creating}
            onClick={onCreateDocument}
            title="Tạo tài liệu mới"
            type="button"
          >
            +
          </button>
        </div>
        <button className="new-document" disabled={creating} onClick={onCreateDocument} type="button">
          <span>＋</span> Tài liệu mới
        </button>
        <div className="document-list">
          {loading ? (
            <p className="list-hint">Đang tải tài liệu…</p>
          ) : documents.length ? (
            documents.map((document) => (
              <div
                className={`document-item ${activeDocument?.id === document.id ? "active" : ""}`}
                key={document.id}
                onContextMenu={(event) => {
                  if (!ownedDocumentIds.has(document.id)) return;
                  event.preventDefault();
                  onContextMenuChange({
                    document,
                    x: Math.min(event.clientX, window.innerWidth - 180),
                    y: Math.min(event.clientY, window.innerHeight - 60),
                  });
                }}
              >
                {editingDocumentId === document.id ? (
                  <form
                    className="rename-form"
                    onSubmit={(event) => onSaveTitle(event, document)}
                  >
                    <input
                      aria-label="Tên tài liệu"
                      autoFocus
                      onChange={(event) => onTitleDraftChange(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") onCancelRename();
                      }}
                      value={titleDraft}
                    />
                    <button aria-label="Lưu tên" disabled={savingTitle} type="submit">✓</button>
                  </form>
                ) : (
                  <>
                    <button
                      className="document-open-button"
                      onClick={() => onOpenDocument(document.id)}
                      type="button"
                    >
                      <span className="document-item-icon">▤</span>
                      <span className="document-item-copy">
                        <span className="document-item-title">{document.title}</span>
                        <span className="document-item-date">{documentDate(document.updated_at)}</span>
                      </span>
                    </button>
                    <button
                      aria-label={`Đổi tên ${document.title}`}
                      className="rename-button"
                      onClick={(event) => onStartRenaming(event, document)}
                      title="Đổi tên"
                      type="button"
                    >
                      ✎
                    </button>
                    {ownedDocumentIds.has(document.id) && (
                      <button
                        aria-label={`Xóa tài liệu ${document.title}`}
                        className="delete-document-button"
                        disabled={deletingDocumentId === document.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteDocument(document);
                        }}
                        title="Xóa tài liệu"
                        type="button"
                      >
                        {deletingDocumentId === document.id ? (
                          "…"
                        ) : (
                          <svg
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="m19 6-1 14H6L5 6" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="list-hint">Chưa có tài liệu nào.</p>
          )}
        </div>
      </div>
      {contextMenu && ownedDocumentIds.has(contextMenu.document.id) && (
        <div
          className="document-context-menu"
          onClick={(event) => event.stopPropagation()}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="delete-document-action"
            disabled={deletingDocumentId === contextMenu.document.id}
            onClick={() => onDeleteDocument(contextMenu.document)}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true"></span>
            {deletingDocumentId === contextMenu.document.id ? "Đang xóa…" : "Xóa tài liệu"}
          </button>
        </div>
      )}
      <div className="sidebar-footer">
        <div className="user-avatar">{username.slice(0, 1).toUpperCase() || "B"}</div>
        <span className="user-name">{username}</span>
        <button
          className="text-button logout-button"
          disabled={loggingOut}
          onClick={onLogout}
          type="button"
        >
          {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </div>
    </aside>
  );
}
