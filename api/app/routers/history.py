from datetime import date
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from ..core.dependencies import get_supabase, require_analyst
from ..schemas.auth import UserProfile
from ..schemas.history import HistoryList, HistoryRun, ReviewChange, SavedReview
from ..schemas.zones import ProcessResult
from ..services import history_service as service
from .auth import _require_csrf

router = APIRouter(prefix="/api/history", tags=["history"], dependencies=[Depends(require_analyst)])


@router.get("", response_model=HistoryList)
def list_history(search: str = Query("", max_length=200), start: date | None = None, end: date | None = None,
                 limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0, le=100_000),
                 sort: Literal["latest", "oldest"] = "latest"):
    return service.list_runs(get_supabase(), search, start, end, limit, offset, sort)


@router.get("/{run_id}", response_model=HistoryRun)
def get_history(run_id: UUID):
    return service.get_run(get_supabase(), str(run_id))


@router.get("/{run_id}/results", response_model=ProcessResult)
def get_results(run_id: UUID):
    return service.get_result(get_supabase(), str(run_id))


@router.get("/{run_id}/reviews", response_model=list[SavedReview])
def get_reviews(run_id: UUID):
    return service.get_reviews(get_supabase(), str(run_id))


@router.patch("/{run_id}/reviews", response_model=SavedReview, dependencies=[Depends(_require_csrf)])
def save_review(run_id: UUID, body: ReviewChange, user: UserProfile = Depends(require_analyst)):
    return service.save_review(get_supabase(), str(run_id), body, UserProfile.model_validate(user))


@router.get("/{run_id}/tickets")
def get_tickets(run_id: UUID, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0, le=100_000),
                 sort: Literal["latest", "oldest"] = "latest"):
    return service.linked_tickets(get_supabase(), str(run_id), limit, offset)
