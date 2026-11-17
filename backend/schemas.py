from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List, Literal


class DocumentCreate(BaseModel):
    title: str

class DocumentResponse(BaseModel):
    id: str
    title: str
    content: str
    owner_id: Optional[str] = None
    visibility: Optional[str] = "private"
    public_role: Optional[str] = None
    access_role: Optional[Literal["viewer", "editor"]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserDocumentsResponse(BaseModel):
    owned: List[DocumentResponse]
    shared: List[DocumentResponse]

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class DocumentVisibilityUpdate(BaseModel):
    visibility: Literal["private", "public"]
    public_role: Optional[Literal["viewer", "editor"]] = None


class VersionCreate(BaseModel):
    user_id: str
    content_snapshot: str

class DocumentVersionResponse(BaseModel):
    id: str
    document_id: str
    user_id: str
    content_snapshot: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)



class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str


class ShareCreate(BaseModel):
    username: str
    role: Literal["editor", "viewer"] = "viewer"


class DocumentShareResponse(BaseModel):
    username: str
    role: Literal["editor", "viewer"]


class ImageAssetResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    url: str
