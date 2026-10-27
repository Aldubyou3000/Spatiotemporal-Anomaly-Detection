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
from ..schemas.zones import ProcessResult, PipelineProgress
from ..schemas.history import SaveRunRequest
from ..services.zones_service import ZoneProcessingError, run_pipeline_multi
from ..services.history_service import describe_files, try_save_run

logger = logging.getLogger("uvicorn.error.zones")

router = APIRouter(prefix="/api/zones", tags=["zones"])
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

# ── Async job store — in-process, single-worker (matches SSE broker)
# job_id -> {status, result, error, created_at}
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 3600  # Temporary previews remain saveable for up to one hour.
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


def _run_job(job_id: str, payload: list[tuple[str, bytes]], user: UserProfile) -> None:
    def report(progress: PipelineProgress) -> None:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["progress"] = progress.model_dump(mode="json")

    try:
        logger.info("[zones] job %s start files=%d bytes=%d", job_id, len(payload), sum(len(b) for _, b in payload))
        result = run_pipeline_multi(payload, on_progress=report)
        result = result.model_copy(update={"run_id": job_id, "history_saved": False, "history_error": None})
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "done"
                _jobs[job_id]["result"] = result.model_dump(mode="json")
                _jobs[job_id]["error"] = None
        logger.info("[zones] job %s done rows=%d", job_id, result.summary.total_rows if hasattr(result, "summary") else -1)
    except ZoneProcessingError as exc:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = str(exc)
                _jobs[job_id]["error_code"] = 422
                _jobs[job_id].pop("files", None)
        logger.warning("[zones] job %s 422 %s", job_id, exc)
    except Exception as exc:
        logger.exception("[zones] job %s failed", job_id)
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = "The process could not process this file. Please check the file and try again."
                _jobs[job_id].pop("files", None)

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
    _gc_jobs()
    job_id = str(uuid.uuid4())
    actor = UserProfile.model_validate(_user)
    with _jobs_lock:
        _jobs[job_id] = {"status": "processing", "result": None, "error": None, "created_at": time.time(),
                         "user_id": actor.id, "user": actor, "files": describe_files(payload),
                         "progress": PipelineProgress().model_dump(mode="json")}
    if prefer_async:
        # Run in background daemon thread (not threadpool, so it survives the 202)
        t = threading.Thread(target=_run_job, args=(job_id, payload, actor), daemon=True)
        t.start()
        # Return 202 with job_id — client will poll GET /api/zones/jobs/{job_id}
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"job_id": job_id, "status": "processing"})

    await run_in_threadpool(_run_job, job_id, payload, actor)
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(410, "Processing session expired. Check History for saved results.")
        if job["status"] == "error":
            raise HTTPException(job.get("error_code", 500), job["error"])
        return job["result"]


@router.get("/jobs/{job_id}")
@limiter.limit("60/minute")
def get_zones_job(request: Request, job_id: str, _user: UserProfile = Depends(require_analyst_or_bearer)):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or expired")
        if job.get("user_id") != _user["id"]:
            raise HTTPException(404, "Job not found or expired")
        # Return a copy
        status_val = job["status"]
        result = job.get("result")
        error = job.get("error")
        progress = job.get("progress", PipelineProgress().model_dump(mode="json"))
    if status_val == "processing":
        return {"job_id": job_id, "status": "processing", "progress": progress}
    if status_val == "done":
        return {"job_id": job_id, "status": "done", "result": result}
    return {"job_id": job_id, "status": "error", "detail": error or "Processing failed"}


@router.post("/jobs/{job_id}/save", response_model=ProcessResult)
@limiter.limit("10/minute")
def retry_save_job(request: Request, job_id: str, body: SaveRunRequest, user: dict = Depends(require_analyst_or_bearer)):
    if not request.headers.get("authorization", "").startswith("Bearer "):
        from .auth import _require_csrf
        _require_csrf(request.headers.get("x-csrf-token"), request.cookies.get("csrf_token"))
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job or job.get("user_id") != user["id"]:
            raise HTTPException(410, "The unsaved processing session expired. Download your results or process the files again.")
        if job["status"] != "done":
            raise HTTPException(409, "Wait for processing to finish.")
        snapshot = ProcessResult.model_validate(job["result"])
        if snapshot.history_saved:
            return snapshot
        files, actor = job["files"], job["user"]
    saved = try_save_run(job_id, snapshot, files, actor, body.title)
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["result"] = saved.model_dump(mode="json")
            if saved.history_saved:
                _jobs[job_id].pop("files", None)
    return saved
