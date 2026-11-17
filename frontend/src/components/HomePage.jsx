import { documentDate, documentPreview } from "../utils/document.js";

export default function HomePage({
  documents,
  ownedDocumentIds,
  loading,
  creating,
  onCreateDocument,
  onOpenDocument,
}) {
  return (
    <section className="home-page" aria-labelledby="home-title">
      <header className="home-header">
        <div>
          <p className="eyebrow">KHÔNG GIAN GHI CHÉP</p>
          <h1 id="home-title">Tài liệu của bạn</h1>
          <p className="home-subtitle">Tất cả tài liệu bạn sở hữu và được chia sẻ ở cùng một nơi.</p>
        </div>
        <button className="primary-button" disabled={creating} onClick={onCreateDocument} type="button">
          + &nbsp; Tạo tài liệu
        </button>
      </header>

      <section className="home-library" aria-labelledby="home-library-title">
        <div className="home-library-heading">
          <h2 id="home-library-title">Tất cả tài liệu</h2>
          {!loading && <span className="home-document-count">{documents.length}</span>}
        </div>
        {loading ? (
          <p className="home-empty-message">Đang tải tài liệu…</p>
        ) : documents.length ? (
          <div className="home-document-grid">
            {documents.map((document) => (
              <button
                aria-label={`Mở tài liệu ${document.title}`}
                className="home-document-card"
                key={document.id}
                onClick={() => onOpenDocument(document.id)}
                type="button"
              >
                <span className="home-card-topline">
                  <span className="home-document-icon" aria-hidden="true">▤</span>
                  <span className="home-document-date">{documentDate(document.updated_at)}</span>
                </span>
                <span className="home-document-title">{document.title}</span>
                <span className="home-document-preview">
                  {documentPreview(document.content).trim() || "Tài liệu chưa có nội dung."}
                </span>
                <span className="home-document-owner">
                  {ownedDocumentIds.has(document.id) ? "Của bạn" : "Được chia sẻ"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty-state">
            <div className="empty-illustration" aria-hidden="true">
              <span className="illustration-sheet" />
              <span className="illustration-lines" />
              <span className="illustration-pencil">✳</span>
            </div>
            <h2>Chưa có tài liệu nào</h2>
            <p className="home-empty-message">Tạo tài liệu đầu tiên để bắt đầu ghi lại ý tưởng của bạn.</p>
            <button className="primary-button" disabled={creating} onClick={onCreateDocument} type="button">
              + &nbsp; Tạo tài liệu
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
