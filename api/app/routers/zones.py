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
from ..services.zones_service import ZoneProcessingError, run_pipeline_multi

logger = logging.getLogger("zones.router")

router = APIRouter(prefix="/api/zones", tags=["zones"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/process", response_model=ProcessResult)
async def process_zones(
    files: list[UploadFile] = File(
        ...,
        description=(
            "One or more CSVs: raw HMDAS station files (auto-detected and converted) "
            "and/or a combined CSV (station_id, date, latitude, longitude, rainfall)."
        ),
    ),
    contamination: float = Query(
        0.05,
        ge=0.01,
        le=0.5,
        description="Expected fraction of anomalies (Zone C LOF contamination).",
    ),
    _user: UserProfile = Depends(require_analyst),
) -> ProcessResult:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded.",
        )

    payload: list[tuple[str, bytes]] = []
    total_bytes = 0
    for upload in files:
        name = upload.filename or "upload.csv"
        if not name.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Only .csv files are accepted — '{name}' is not a CSV.",
            )
        contents = await upload.read()
        if not contents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded file '{name}' is empty.",
            )
        total_bytes += len(contents)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Combined upload exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
            )
        payload.append((name, contents))

    try:
        return await run_in_threadpool(run_pipeline_multi, payload, contamination)
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
