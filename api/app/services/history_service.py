"""Immutable processing snapshots and separate, authenticated analyst decisions."""
import hashlib
import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from ..core.dependencies import get_supabase
from ..schemas.auth import UserProfile
from ..schemas.history import ReviewChange, SaveRunRequest, SourceFile
from ..schemas.zones import ProcessResult
from .audit_service import audit

logger = logging.getLogger("history")


@lru_cache(maxsize=1)
def algorithm_version() -> str:
    root = Path(__file__).resolve().parents[1]
    sources = [root / "zones" / f"zone_{zone}.py" for zone in "abc"] + [root / "services" / "zones_service.py"]
    return hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()[:16]


def describe_files(files: list[tuple[str, bytes]]) -> list[SourceFile]:
    return [SourceFile(name=name, size=len(data), sha256=hashlib.sha256(data).hexdigest()) for name, data in files]


def save_run(sb, run_id: str, result: ProcessResult, files: list[SourceFile], user: UserProfile, title: str) -> bool:
    title = SaveRunRequest(title=title).title
    snapshot = result.model_copy(update={"run_id": run_id, "history_saved": True, "history_error": None, "history_title": title}).model_dump(mode="json")
    source_files = [file.model_dump() for file in files]
    stations = sorted({row.station_id for row in result.flagged_data})
    flagged_readings = [{"station_id": row.station_id, "date": str(row.date)} for row in result.flagged_data
                        if row.is_anomaly or row.is_low_anomaly or row.is_dry_stuck]
    record = {
        "id": run_id, "title": title, "processed_by": user.id, "processed_by_name": user.full_name or user.username,
        "files": source_files, "station_ids": stations, "summary": snapshot["summary"],
        "quality_report": snapshot["quality_report"], "processed_at": snapshot["processed_at"],
        "algorithm_version": algorithm_version(),
        "flagged_count": len(flagged_readings), "flagged_readings": flagged_readings,
        "search_text": " ".join([title, user.full_name, user.username, *stations, *(file.name for file in files)]),
    }
    inserted = sb.rpc("save_processing_run", {"p_run": record, "p_result": snapshot, "p_title": title}).execute().data
    if inserted:
        audit.log(event="processing_run_saved", user_id=user.id, entity_type="processing_run", entity_id=run_id,
                  meta={"files": len(files), "stations": len(stations), "flagged": record["flagged_count"]})
    return inserted


def try_save_run(run_id: str, result: ProcessResult, files: list[SourceFile], user: UserProfile, title: str) -> ProcessResult:
    try:
        sb = get_supabase()
        inserted = save_run(sb, run_id, result, files, user, title)
        if not inserted:
            return get_result(sb, run_id)
        return result.model_copy(update={"run_id": run_id, "history_saved": True, "history_error": None, "history_title": title})
    except Exception:
        logger.exception("Could not save processing run %s", run_id)
        return result.model_copy(update={"run_id": run_id, "history_saved": False,
            "history_error": "Couldn't save to History. Please try again."})


def list_runs(sb, search: str, start: date | None, end: date | None, limit: int, offset: int) -> dict:
    if start and end and start > end:
        raise HTTPException(422, "The end date must be on or after the start date.")
    query = sb.table("processing_history").select("*", count="exact")
    if search.strip():
        term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.ilike("search_text", f"%{term}%")
    # The dashboard labels these as processing dates in Asia/Manila (UTC+8).
    local = timezone(timedelta(hours=8))
    if start:
        query = query.gte("processed_at", datetime.combine(start, time.min, local).isoformat())
    if end:
        query = query.lt("processed_at", datetime.combine(end + timedelta(days=1), time.min, local).isoformat())
    response = query.order("processed_at", desc=True).order("id").range(offset, offset + limit - 1).execute()
    return {"items": response.data or [], "total": response.count or 0}


def get_run(sb, run_id: str) -> dict:
    rows = sb.table("processing_history").select("*").eq("id", run_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Saved run not found.")
    return rows[0]


def get_result(sb, run_id: str) -> ProcessResult:
    rows = sb.table("processing_run_results").select("result").eq("run_id", run_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Saved results not found.")
    return ProcessResult.model_validate(rows[0]["result"])


def get_reviews(sb, run_id: str) -> list[dict]:
    get_run(sb, run_id)
    # Supabase caps individual queries at 1,000; a multi-year run may exceed that.
    rows = []
    while True:
        batch = sb.table("processing_reviews").select("*").eq("run_id", run_id).order("station_id").order("date").range(len(rows), len(rows) + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows


def validate_reading(sb, run_id: str, station_id: str, day: str) -> None:
    # Check compact identities without downloading every raw/cleaned row on each decision.
    rows = sb.table("processing_runs").select("id").eq("id", run_id).contains(
        "flagged_readings", json.dumps([{"station_id": station_id, "date": day}])).limit(1).execute().data
    if not rows:
        raise HTTPException(422, "This flagged reading does not belong to the saved run.")


def validate_ticket_link(sb, run_id: str, station_id: str, day: str | None) -> None:
    rows = sb.table("processing_runs").select("station_ids").eq("id", run_id).limit(1).execute().data
    if not rows:
        raise HTTPException(422, "Save the processing run before linking a ticket.")
    if station_id not in rows[0]["station_ids"]:
        raise HTTPException(422, "The ticket station does not belong to this processing run.")
    if day:
        validate_reading(sb, run_id, station_id, day)


def save_review(sb, run_id: str, change: ReviewChange, user: UserProfile) -> dict:
    validate_reading(sb, run_id, change.station_id, str(change.date))
    saved = sb.rpc("save_processing_review", {
        "p_run_id": run_id, "p_station_id": change.station_id, "p_date": str(change.date),
        "p_status": change.status, "p_note": change.note if change.status else "",
        "p_reviewer_id": user.id, "p_reviewed_by": user.full_name or user.username,
        "p_expected_revision": change.expected_revision,
    }).execute().data
    if saved.get("conflict"):
        raise HTTPException(409, "This reading was reviewed elsewhere. The latest decision has been loaded; check it before saving again.")
    audit.log(event="processing_review_saved", user_id=user.id, entity_type="processing_run", entity_id=run_id,
              meta={"station_id": change.station_id, "date": str(change.date), "status": change.status,
                    "revision": saved["revision"], "previous": saved.pop("previous", None), "note": change.note})
    return saved


def linked_tickets(sb, run_id: str, limit: int, offset: int) -> dict:
    from .tickets_service import list_tickets
    get_run(sb, run_id)
    result = list_tickets(sb, run_id=run_id, limit=limit, offset=offset)
    ids = [ticket["id"] for ticket in result["items"]]
    latest_reports = {}
    if ids:
        offset_reports = 0
        while True:
            reports = sb.table("inspection_reports").select(
                "id,ticket_id,technician_id,submitted_at,analyst_approved,analyst_approved_at,issue_resolved,round,"
                "profiles!inspection_reports_technician_id_fkey(full_name,username),"
                "approver:profiles!inspection_reports_approved_by_fkey(full_name,username)"
            ).in_("ticket_id", ids).not_.is_("submitted_at", "null").order("submitted_at", desc=True).range(offset_reports, offset_reports + 999).execute().data or []
            for report in reports:
                latest_reports.setdefault(report["ticket_id"], report)
            if len(reports) < 1000 or len(latest_reports) == len(ids):
                break
            offset_reports += len(reports)
    for ticket in result["items"]:
        ticket["inspection"] = latest_reports.get(ticket["id"])
    return result
