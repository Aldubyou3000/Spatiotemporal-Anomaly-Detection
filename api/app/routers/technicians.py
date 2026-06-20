import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.dependencies import _client_ip, get_supabase, require_analyst
from ..services.audit_service import audit
from ..schemas.auth import UserProfile
from ..schemas.technicians import TechnicianCreate, TechnicianProfile
from ..services.technicians_service import (
    create_technician,
    list_technicians,
    toggle_technician_active,
)

logger = logging.getLogger("technicians.router")

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
    user: UserProfile = Depends(require_analyst),
):
    try:
        technician = create_technician(body)
    except ValueError as e:
        # Clean, already-translated, user-safe message from the service layer.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        # Anything else is unexpected — log via the global handler, return generic.
        logger.exception("[technicians] unexpected error creating technician")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the technician account. Please try again.",
        )
    audit.account_created(
        actor_id=str(user["id"]),
        new_user_id=str(technician["id"]),
        ip=_client_ip(request),
    )
    return technician


@router.patch("/{technician_id}/toggle-active", response_model=TechnicianProfile)
@limiter.limit("20/minute")
def toggle_active_endpoint(
    request: Request,
    technician_id: str,
    user: UserProfile = Depends(require_analyst),
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
    new_active = not current_rows[0]["is_active"]
    result = toggle_technician_active(sb, technician_id, new_active)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
    audit.account_toggled(
        actor_id=str(user["id"]),
        target_id=technician_id,
        is_active=new_active,
        ip=_client_ip(request),
    )
    return result
