import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .. import auth as auth_service, models, schemas
from ..database import begin_immediate_transaction, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = (
        db.query(models.User)
        .filter(models.User.username == user.username)
        .first()
    )
    if existing_user is not None:
        raise HTTPException(status_code=400, detail="Username đã tồn tại")

    db_user = models.User(
        username=user.username,
        hashed_password=auth_service.get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = (
        db.query(models.User)
        .filter(models.User.username == form_data.username)
        .first()
    )
    if user is None or not auth_service.verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Sai username hoặc password")

    access_token = auth_service.create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(
            minutes=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(auth_service.security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    try:
        begin_immediate_transaction(db)
        is_blacklisted = (
            db.query(models.TokenBlacklist)
            .filter(models.TokenBlacklist.token == token)
            .first()
        )
        if is_blacklisted is None:
            db.add(models.TokenBlacklist(token=token))
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if "database is locked" not in str(exc.orig).lower():
            raise
        logger.exception("Database remained locked while revoking a session")
        raise HTTPException(
            status_code=503,
            detail="Cơ sở dữ liệu đang bận. Vui lòng thử lại sau.",
        ) from exc

    return {"message": "Đăng xuất thành công!"}
