
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from . import models, schemas


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_document(
    db: Session, doc: schemas.DocumentCreate, owner_id: str
) -> models.Document:
    db_doc = models.Document(title=doc.title, owner_id=owner_id)
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


def get_all_documents(db: Session) -> list[models.Document]:
    return db.query(models.Document).order_by(models.Document.updated_at.desc()).all()


def get_document(db: Session, document_id: str) -> models.Document | None:
    return db.query(models.Document).filter(models.Document.id == document_id).first()


def get_document_access_role(
    document: models.Document, user_id: str
) -> models.AccessRole | None:
    if document.owner_id == user_id:
        return "editor"

    collaborator = next(
        (share for share in document.collaborators if share.user_id == user_id),
        None,
    )
    if collaborator is not None:
        return collaborator.role

    if document.visibility == "public":
        return document.public_role or "viewer"

    return None


def update_document(
    db: Session, document_id: str, doc_update: schemas.DocumentUpdate
) -> models.Document | None:
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if db_doc is not None:
        if doc_update.title is not None:
            db_doc.title = doc_update.title
        if doc_update.content is not None:
            db_doc.content = doc_update.content

        db_doc.updated_at = _utc_now_naive()
        db.commit()
        db.refresh(db_doc)
    return db_doc


def delete_document(db: Session, document_id: str) -> bool:
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if db_doc is not None:
        db.delete(db_doc)
        db.commit()
        return True
    return False


def get_user_documents(
    db: Session, user_id: str
) -> dict[str, list[models.Document]]:
    owned_docs = db.query(models.Document).filter(models.Document.owner_id == user_id).all()
    shared_links = (
        db.query(models.DocumentShare)
        .filter(models.DocumentShare.user_id == user_id)
        .all()
    )
    shared_docs = [
        link.document for link in shared_links if link.document is not None
    ]
    return {"owned": owned_docs, "shared": shared_docs}


def get_document_versions(
    db: Session, document_id: str
) -> list[models.DocumentVersion]:
    return (
        db.query(models.DocumentVersion)
        .filter(models.DocumentVersion.document_id == document_id)
        .order_by(models.DocumentVersion.created_at.desc())
        .all()
    )


def save_document_version(
    db: Session, document_id: str, user_id: str, current_content: str
) -> models.DocumentVersion:
    version = models.DocumentVersion(
        document_id=document_id,
        user_id=user_id,
        content_snapshot=current_content,
    )
    db.add(version)
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if doc is not None:
        doc.content = current_content
        doc.updated_at = _utc_now_naive()

    db.commit()
    db.refresh(version)
    return version


def restore_version(
    db: Session, document_id: str, version_id: str
) -> models.Document | None:
    old_version = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.id == version_id,
        models.DocumentVersion.document_id == document_id,
    ).first()
    if old_version is None:
        return None
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if doc is not None:
        doc.content = old_version.content_snapshot
        doc.updated_at = _utc_now_naive()
        db.commit()
        db.refresh(doc)
    return doc


def get_user_by_username(db: Session, username: str) -> models.User | None:
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    db_user = models.User(username=user.username)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def share_document(
    db: Session,
    document_id: str,
    target_user_id: str,
    role: models.AccessRole,
) -> models.DocumentShare:
    existing_share = db.query(models.DocumentShare).filter(
        models.DocumentShare.document_id == document_id,
        models.DocumentShare.user_id == target_user_id,
    ).first()

    if existing_share is not None:
        existing_share.role = role
        db.commit()
        db.refresh(existing_share)
        return existing_share

    new_share = models.DocumentShare(
        document_id=document_id,
        user_id=target_user_id,
        role=role,
    )
    db.add(new_share)
    db.commit()
    db.refresh(new_share)
    return new_share


def get_document_shares(
    db: Session, document_id: str
) -> list[dict[str, str]]:
    shares = (
        db.query(models.DocumentShare, models.User.username)
        .join(models.User, models.User.id == models.DocumentShare.user_id)
        .filter(models.DocumentShare.document_id == document_id)
        .all()
    )
    return [{"username": username, "role": share.role} for share, username in shares]


def update_document_visibility(
    db: Session,
    document_id: str,
    visibility_data: schemas.DocumentVisibilityUpdate,
) -> models.Document | None:
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if db_doc is not None:
        db_doc.visibility = visibility_data.visibility
        db_doc.public_role = visibility_data.public_role
        db_doc.updated_at = _utc_now_naive()
        db.commit()
        db.refresh(db_doc)
    return db_doc