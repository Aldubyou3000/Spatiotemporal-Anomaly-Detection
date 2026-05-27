from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.config import settings
from ..core.dependencies import get_current_user
from ..schemas.auth import LoginRequest, LoginResponse
from ..services.auth_service import login, refresh_session

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

_ACCESS_MAX_AGE = 30 * 60
_REFRESH_MAX_AGE = 7 * 24 * 60 * 60


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        "access_token", access_token,
        httponly=True, secure=settings.cookie_secure, samesite="lax",
        max_age=_ACCESS_MAX_AGE,
    )
    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, secure=settings.cookie_secure, samesite="lax",
        max_age=_REFRESH_MAX_AGE,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login_endpoint(request: Request, body: LoginRequest, response: Response):
    try:
        result = login(body.credential, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    _set_auth_cookies(response, result["access_token"], result["refresh_token"])
    return {"user": result["user"]}


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh_endpoint(request: Request, response: Response, refresh_token: str | None = Cookie(default=None)):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        result = refresh_session(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    _set_auth_cookies(response, result["access_token"], result["refresh_token"])
    return {"ok": True}


@router.get("/me")
def me_endpoint(user: dict = Depends(get_current_user)):
    return user


@router.post("/logout")
def logout_endpoint(response: Response, _user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", httponly=True, secure=settings.cookie_secure, samesite="lax")
    response.delete_cookie("refresh_token", httponly=True, secure=settings.cookie_secure, samesite="lax")
    return {"ok": True}
