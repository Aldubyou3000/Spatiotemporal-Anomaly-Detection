"""
Zones pipeline router.

Accepts a CSV upload, runs Zone A → B → C in a worker thread (CPU-bound),
and returns the structured result. Analyst-only.
"""
import logging
import threading
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from ..core.dependencies import require_analyst_or_bearer
from ..core.limiter import limiter
from ..schemas.auth import UserProfile
from ..schemas.zones import ProcessResult
from ..services.zones_service import ZoneProcessingError, run_pipeline_multi

logger = logging.getLogger("zones.router")

router = APIRouter(prefix="/api/zones", tags=["zones"])
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

# ── Async job store — in-process, single-worker (matches SSE broker)
# job_id -> {status, result, error, created_at}
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 600  # 10 min
_JOB_MAX = 50


def _gc_jobs() -> None:
    now = time.time()
    with _jobs_lock:
        expired = [jid for jid, j in _jobs.items() if now - j.get("created_at", 0) > _JOB_TTL_SECONDS]
        for jid in expired:
            _jobs.pop(jid, None)
        # Hard cap
        while len(_jobs) > _JOB_MAX:
            _jobs.pop(next(iter(_jobs)), None)


def _run_job(job_id: str, payload: list[tuple[str, bytes]]) -> None:
    try:
        logger.info("[zones] job %s start files=%d bytes=%d", job_id, len(payload), sum(len(b) for _, b in payload))
        result = run_pipeline_multi(payload)
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "done"
                _jobs[job_id]["result"] = result.model_dump() if hasattr(result, "model_dump") else result
                _jobs[job_id]["error"] = None
        logger.info("[zones] job %s done rows=%d", job_id, result.summary.total_rows if hasattr(result, "summary") else -1)
    except ZoneProcessingError as exc:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = str(exc)
        logger.warning("[zones] job %s 422 %s", job_id, exc)
    except Exception as exc:
        logger.exception("[zones] job %s failed", job_id)
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = "The process could not process this file. Please check the file and try again."

@router.post("/process", response_model=ProcessResult)
@limiter.limit("10/minute")
async def process_zones(
    request: Request,
    files: list[UploadFile] = File(
        ...,
        description=(
            "One or more CSVs: raw HMDAS station files (auto-detected and converted) "
            "and/or a combined CSV (station_id, date, latitude, longitude, rainfall)."
        ),
    ),
    # Accept both ?async=true (client's historical param, `async` is a reserved keyword so we alias it)
    # and ?async_mode=true for robustness. Either triggers 202 → poll.
    async_mode: bool = Query(default=False, alias="async_mode", description="If true, returns 202 job_id and poll GET /api/zones/jobs/{id}"),
    async_alias: bool = Query(default=False, alias="async", description="Alias for async_mode"),
    _user: UserProfile = Depends(require_analyst_or_bearer),
) -> Any:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded.",
        )

    # HOTFIX: early reject huge Content-Length before buffering (saves OOM)
    try:
        clen = int(request.headers.get("content-length", "0") or 0)
        if clen and clen > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Combined upload exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit (Content-Length {clen} bytes).",
            )
    except HTTPException:
        raise
    except Exception:
        pass

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

    # ── Async mode — bypass Vercel 30s edge by returning 202 immediately
    # Check all async signals: alias ?async=, canonical ?async_mode=, Prefer header, and raw query fallback
    # (covers any future client that sends either name). The explicit Query params handle the normal
    # case; the raw query_params check is a safety net for edge rewrites that might drop alias mapping.
    raw_async = request.query_params.get("async")
    raw_async_mode = request.query_params.get("async_mode")
    raw_async_truthy = (raw_async or "").lower() in ("1", "true", "yes")
    raw_async_mode_truthy = (raw_async_mode or "").lower() in ("1", "true", "yes")
    prefer_async = (
        async_mode
        or async_alias
        or raw_async_truthy
        or raw_async_mode_truthy
        or request.headers.get("prefer", "").lower() == "respond-async"
        or request.query_params.get("prefer") == "respond-async"
    )
    # Log mode decision for Render debugging (helps distinguish cold-start 50s vs LOF 45s)
    logger.info(
        "[zones] process mode async_mode=%s async_alias=%s raw_async=%s raw_async_mode=%s prefer=%s => prefer_async=%s files=%d hlen=%s",
        async_mode, async_alias, raw_async, raw_async_mode,
        request.headers.get("prefer"), prefer_async, len(files),
        request.headers.get("content-length") or request.query_params.get("async"),
    )
    if prefer_async:
        _gc_jobs()
        job_id = uuid.uuid4().hex
        with _jobs_lock:
            _jobs[job_id] = {"status": "processing", "result": None, "error": None, "created_at": time.time()}
        # Run in background daemon thread (not threadpool, so it survives the 202)
        t = threading.Thread(target=_run_job, args=(job_id, payload), daemon=True)
        t.start()
        # Return 202 with job_id — client will poll GET /api/zones/jobs/{job_id}
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"job_id": job_id, "status": "processing"})

    try:
        return await run_in_threadpool(run_pipeline_multi, payload)
    except ZoneProcessingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("[zones] pipeline failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The process could not process this file. Please check the file and try again.",
        ) from exc


@router.get("/jobs/{job_id}")
@limiter.limit("60/minute")
def get_zones_job(request: Request, job_id: str, _user: UserProfile = Depends(require_analyst_or_bearer)):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or expired")
        # Return a copy
        status_val = job["status"]
        result = job.get("result")
        error = job.get("error")
    if status_val == "processing":
        return {"job_id": job_id, "status": "processing"}
    if status_val == "done":
        return {"job_id": job_id, "status": "done", "result": result}
    return {"job_id": job_id, "status": "error", "detail": error or "Processing failed"}
