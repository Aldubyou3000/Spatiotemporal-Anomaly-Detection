from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.dependencies import _client_ip, get_current_user, get_supabase, require_analyst
from ..services.audit_service import audit
from ..schemas.auth import UserProfile
from ..schemas.reports import InspectionReport, InspectionReportListResponse, ReportApprove
from ..services.reports_service import approve_report, get_report, list_reports
from .mobile import _signed_url

router = APIRouter(prefix="/api/reports", tags=["reports"])
limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=InspectionReportListResponse)
@limiter.limit("60/minute")
def list_reports_endpoint(
    request: Request,
    _user: UserProfile = Depends(require_analyst),
):
    sb = get_supabase()
    return list_reports(sb)


@router.get("/{report_id}", response_model=InspectionReport)
@limiter.limit("60/minute")
def get_report_endpoint(
    request: Request,
    report_id: str,
    _user: UserProfile = Depends(require_analyst),
):
    sb = get_supabase()
    report = get_report(sb, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


@router.get("/{report_id}/photos")
@limiter.limit("60/minute")
def get_report_photos_endpoint(
    request: Request,
    report_id: str,
    _user: dict = Depends(get_current_user),
):
    """Return signed photo URLs for an inspection report (analyst + technician web access)."""
    sb = get_supabase()

    report_rows = sb.table("inspection_reports").select("id").eq("id", report_id).limit(1).execute()
    if not report_rows.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    res = (
        sb.table("inspection_photos")
        .select("id, photo_url")
        .eq("report_id", report_id)
        .order("uploaded_at")
        .execute()
    )
    rows = res.data or []

    bucket = "inspection-photos"
    result = []
    for row in rows:
        stored = row["photo_url"]
        if stored.startswith("http"):
            marker = f"/{bucket}/"
            storage_path = stored.split(marker)[1].split("?")[0] if marker in stored else None
        else:
            storage_path = stored or None
        if storage_path:
            fresh = _signed_url(sb, bucket, storage_path, 3600)
            if fresh:
                row = {**row, "photo_url": fresh}
        result.append(row)
    return result


@router.patch("/{report_id}/approve", response_model=InspectionReport)
@limiter.limit("30/minute")
def approve_report_endpoint(
    request: Request,
    report_id: str,
    body: ReportApprove,
    user: UserProfile = Depends(require_analyst),
):
    sb = get_supabase()
    report = approve_report(sb, report_id, body)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    audit.report_approved(
        actor_id=str(user["id"]),
        report_id=report_id,
        ticket_id=str(report.get("ticket_id", "")),
        ip=_client_ip(request),
    )
    return report
