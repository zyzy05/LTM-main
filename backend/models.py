from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

AccessRole = Literal["viewer", "editor"]
DocumentVisibility = Literal["private", "public"]


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=True
    )
    hashed_password: Mapped[str] = mapped_column(String, nullable=True)

    owned_documents: Mapped[list[Document]] = relationship(back_populates="owner")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    visibility: Mapped[DocumentVisibility | None] = mapped_column(
        String, default="private"
    )
    public_role: Mapped[AccessRole | None] = mapped_column(String, default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, onupdate=_utc_now_naive, nullable=True
    )

    owner: Mapped[User | None] = relationship(back_populates="owned_documents")
    collaborators: Mapped[list[DocumentShare]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    yjs_state: Mapped[DocumentYjsState | None] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        uselist=False,
    )
    images: Mapped[list[ImageAsset]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    role: Mapped[AccessRole] = mapped_column(String, default="editor", nullable=True)

    document: Mapped[Document | None] = relationship(back_populates="collaborators")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    content_snapshot: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, nullable=True
    )

    document: Mapped[Document | None] = relationship(back_populates="versions")


class DocumentYjsState(Base):
    __tablename__ = "document_yjs_states"

    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id"), primary_key=True
    )
    state: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, default=b"")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, onupdate=_utc_now_naive, nullable=True
    )

    document: Mapped[Document | None] = relationship(back_populates="yjs_state")


class ImageAsset(Base):
    __tablename__ = "image_assets"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        String, ForeignKey("documents.id"), index=True, nullable=False
    )
    uploader_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    storage_path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, nullable=False
    )

    document: Mapped[Document] = relationship(back_populates="images")


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    token: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    blacklisted_on: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now_naive, nullable=True
    )
