from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas
from ..database import get_db
from ..permissions import check_document_access

router = APIRouter(prefix="/api/documents", tags=["Version History"])


@router.post(
    "/{document_id}/versions",
    response_model=schemas.DocumentVersionResponse,
)
def create_document_version(
    document_id: str,
    version_data: schemas.VersionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "editor"):
        raise HTTPException(status_code=403, detail="Không có quyền sửa")

    return crud.save_document_version(
        db=db,
        document_id=document_id,
        user_id=current_user.id,
        current_content=version_data.content_snapshot,
    )


@router.get(
    "/{document_id}/history",
    response_model=List[schemas.DocumentVersionResponse],
)
def get_document_history(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "viewer"):
        raise HTTPException(status_code=403, detail="Không có quyền xem lịch sử")
    return crud.get_document_versions(db=db, document_id=document_id)


@router.post(
    "/{document_id}/restore/{version_id}",
    response_model=schemas.DocumentResponse,
)
def restore_document_to_version(
    document_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    document = crud.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not check_document_access(document, current_user.id, "editor"):
        raise HTTPException(
            status_code=403,
            detail="Không có quyền khôi phục tài liệu",
        )

    restored_document = crud.restore_version(
        db=db,
        document_id=document_id,
        version_id=version_id,
    )
    if restored_document is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy mốc lịch sử để khôi phục",
        )
    return restored_document
