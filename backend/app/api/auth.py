"""
Auth routes — sign-up and log-in.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.models.models import User
from app.schemas import SignUpRequest, LoginRequest, TokenResponse, UserOut
from app.core.security import hash_password, verify_password, create_access_token, get_current_user, set_auth_cookie

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignUpRequest, response: Response, db: DBSession = Depends(get_db)):
    # check duplicate
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role)
    set_auth_cookie(response, token)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id, user.role)
    set_auth_cookie(response, token)
    return UserOut.model_validate(user)


@router.get("/me", response_model=UserOut)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return UserOut.model_validate(current_user)


@router.post("/logout")
def logout(response: Response):
    """Clear the httpOnly auth cookie."""
    response.delete_cookie(
        key="auth_token",
        path="/",
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
    )
    return {"message": "Logged out successfully"}
