import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas
from ..database import begin_immediate_transaction, get_db
from ..image_storage import resolve_image_path
from ..permissions import check_document_access

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.post("/", response_model=schemas.DocumentResponse)
def create_document(
    document: schemas.DocumentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return crud.create_document(db=db, doc=document, owner_id=current_user.id)


@router.get("/", response_model=schemas.UserDocumentsResponse)
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return crud.get_user_documents(db=db, user_id=current_user.id)


@router.get("/{document_id}", response_model=schemas.DocumentResponse)
def open_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "viewer"):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xem tài liệu này",
        )

    response = schemas.DocumentResponse.model_validate(document)
    response.access_role = crud.get_document_access_role(
        document, current_user.id
    )
    return response


@router.put("/{document_id}", response_model=schemas.DocumentResponse)
def update_document(
    document_id: str,
    document_update: schemas.DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "editor"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền sửa")
    return crud.update_document(db, document_id, document_update)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    image_paths: list[Path] = []
    try:
        begin_immediate_transaction(db)
        document = crud.get_document(db, document_id)
        if document is None:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail="Không tìm thấy tài liệu để xóa",
            )
        if document.owner_id != current_user.id:
            db.rollback()
            raise HTTPException(
                status_code=403,
                detail="Chỉ người tạo ra tài liệu mới được phép xóa",
            )

        image_paths = [
            resolve_image_path(image.storage_path)
            for image in db.query(models.ImageAsset)
            .filter_by(document_id=document_id)
            .all()
        ]
        crud.delete_document(db, document_id=document_id)
    except OperationalError as exc:
        db.rollback()
        if "database is locked" not in str(exc.orig).lower():
            raise
        logger.exception(
            "Database remained locked while deleting document %s",
            document_id,
        )
        raise HTTPException(
            status_code=503,
            detail="Cơ sở dữ liệu đang bận. Vui lòng thử lại sau.",
        ) from exc

    for image_path in image_paths:
        try:
            image_path.unlink()
        except FileNotFoundError:
            continue
        except OSError as exc:
            logger.exception(
                "Could not remove deleted document image: %s",
                image_path,
            )
            raise HTTPException(
                status_code=500,
                detail="Không thể xóa tệp hình ảnh",
            ) from exc
    return None


@router.post(
    "/{document_id}/share",
    response_model=schemas.DocumentShareResponse,
)
def share_document(
    document_id: str,
    share_data: schemas.ShareCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if document.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Chỉ chủ sở hữu mới có quyền chia sẻ",
        )

    target_user = crud.get_user_by_username(db, username=share_data.username)
    if target_user is None:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy người dùng có tên '{share_data.username}'",
        )
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Bạn không thể tự chia sẻ cho chính mình",
        )

    shared = crud.share_document(
        db=db,
        document_id=document_id,
        target_user_id=target_user.id,
        role=share_data.role,
    )
    return {"username": target_user.username, "role": shared.role}


@router.get(
    "/{document_id}/shares",
    response_model=List[schemas.DocumentShareResponse],
)
def get_document_shares(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if document.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Chỉ chủ sở hữu mới có quyền xem danh sách chia sẻ",
        )
    return crud.get_document_shares(db, document_id)


@router.patch(
    "/{document_id}/visibility",
    response_model=schemas.DocumentResponse,
)
def change_document_visibility(
    document_id: str,
    visibility_data: schemas.DocumentVisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if document.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Chỉ chủ sở hữu tài liệu mới có quyền thay đổi trạng thái chia sẻ",
        )
    if visibility_data.visibility == "public" and not visibility_data.public_role:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng xác định quyền (viewer/editor) khi bật chế độ Public",
        )
    return crud.update_document_visibility(
        db,
        document_id=document_id,
        visibility_data=visibility_data,
    )
