"""
Zones pipeline router.

Accepts a CSV upload, runs Zone A → B → C in a worker thread (CPU-bound),
and returns the structured result. Analyst-only.
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..core.dependencies import require_analyst
from ..schemas.auth import UserProfile
from ..schemas.zones import ProcessResult
from ..services.zones_service import ZoneProcessingError, run_pipeline

logger = logging.getLogger("zones.router")

router = APIRouter(prefix="/api/zones", tags=["zones"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/process", response_model=ProcessResult)
async def process_zones(
    file: UploadFile = File(..., description="CSV: station_id, date, latitude, longitude, rainfall"),
    contamination: float = Query(
        0.05,
        ge=0.01,
        le=0.5,
        description="Expected fraction of anomalies (Zone C LOF contamination).",
    ),
    _user: UserProfile = Depends(require_analyst),
) -> ProcessResult:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .csv files are accepted.",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        return await run_in_threadpool(run_pipeline, contents, contamination)
    except ZoneProcessingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("[zones] pipeline failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The pipeline could not process this file. Please check the file and try again.",
        ) from exc
