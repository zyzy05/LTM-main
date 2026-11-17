import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas
from ..database import get_db
from ..image_storage import (
    IMAGE_FORMATS,
    IMAGE_STORAGE_DIRECTORY,
    MAX_IMAGE_SIZE_BYTES,
    detect_image_type,
    resolve_image_path,
    safe_image_filename,
)
from ..permissions import check_document_access

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Images"])


@router.post(
    "/api/documents/{document_id}/images",
    response_model=schemas.ImageAssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document_image(
    document_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> schemas.ImageAssetResponse:
    document = crud.get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "editor"):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền thêm hình ảnh",
        )

    contents = await file.read(MAX_IMAGE_SIZE_BYTES + 1)
    await file.close()
    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Ảnh vượt quá giới hạn 2 MiB")

    content_type = detect_image_type(contents)
    if content_type is None or file.content_type != content_type:
        raise HTTPException(
            status_code=415,
            detail="Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP hợp lệ",
        )

    asset_id = str(uuid.uuid4())
    suffix = IMAGE_FORMATS[content_type][0]
    storage_path = f"uploads/{asset_id}{suffix}"
    image_path = resolve_image_path(storage_path)
    IMAGE_STORAGE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    image_path.write_bytes(contents)

    image = models.ImageAsset(
        id=asset_id,
        document_id=document_id,
        uploader_id=current_user.id,
        filename=safe_image_filename(file.filename),
        storage_path=storage_path,
        content_type=content_type,
        size_bytes=len(contents),
    )
    db.add(image)
    try:
        db.commit()
        db.refresh(image)
    except SQLAlchemyError:
        db.rollback()
        try:
            image_path.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            logger.exception(
                "Could not remove image after metadata save failed: %s",
                image_path,
            )
        raise

    return schemas.ImageAssetResponse(
        id=image.id,
        filename=image.filename,
        content_type=image.content_type,
        size_bytes=image.size_bytes,
        url=f"/api/images/{image.id}",
    )


@router.get("/api/images/{image_id}", response_class=FileResponse)
def get_document_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    image = db.query(models.ImageAsset).filter_by(id=image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hình ảnh")
    if not check_document_access(image.document, current_user.id, "viewer"):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xem hình ảnh",
        )

    image_path = resolve_image_path(image.storage_path)
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Tệp hình ảnh không tồn tại")
    return FileResponse(
        image_path,
        media_type=image.content_type,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
