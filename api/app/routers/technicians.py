from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.dependencies import get_supabase, require_analyst
from ..schemas.auth import UserProfile
from ..schemas.technicians import TechnicianCreate, TechnicianProfile
from ..services.technicians_service import (
    create_technician,
    list_technicians,
    toggle_technician_active,
)

router = APIRouter(prefix="/api/technicians", tags=["technicians"])
limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=list[TechnicianProfile])
@limiter.limit("60/minute")
def list_technicians_endpoint(
    request: Request,
    _user: UserProfile = Depends(require_analyst),
):
    sb = get_supabase()
    return list_technicians(sb)


@router.post("", response_model=TechnicianProfile, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_technician_endpoint(
    request: Request,
    body: TechnicianCreate,
    _user: UserProfile = Depends(require_analyst),
):
    try:
        return create_technician(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch("/{technician_id}/toggle-active", response_model=TechnicianProfile)
@limiter.limit("20/minute")
def toggle_active_endpoint(
    request: Request,
    technician_id: str,
    _user: UserProfile = Depends(require_analyst),
):
    sb = get_supabase()
    # Fetch current state, then flip it
    current = (
        sb.table("profiles")
        .select("is_active")
        .eq("id", technician_id)
        .eq("role", "technician")
        .limit(1)
        .execute()
    )
    current_rows = current.data or []
    if not current_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
    result = toggle_technician_active(sb, technician_id, not current_rows[0]["is_active"])
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
    return result
