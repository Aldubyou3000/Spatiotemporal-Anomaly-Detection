from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .zones import ProcessSummary, QualityReport


class SourceFile(BaseModel):
    name: str
    size: int
    sha256: str


class HistoryRun(BaseModel):
    id: str
    title: str | None = None
    processed_by: str
    processed_by_name: str
    files: list[SourceFile]
    station_ids: list[str]
    processed_at: datetime
    summary: ProcessSummary
    quality_report: QualityReport
    algorithm_version: str
    flagged_count: int
    reviewed_count: int = 0
    confirmed_count: int = 0
    dismissed_count: int = 0
    open_tickets: int = 0
    verified_tickets: int = 0
    cancelled_tickets: int = 0


class HistoryList(BaseModel):
    items: list[HistoryRun]
    total: int


class SaveRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class ReviewChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    station_id: str = Field(min_length=1, max_length=300)
    date: date
    status: Literal["anomaly", "not_anomaly"] | None
    note: str = Field(default="", max_length=1000)
    expected_revision: int = Field(default=0, ge=0)

    @field_validator("note")
    @classmethod
    def trim_note(cls, value: str) -> str:
        return value.strip()


class SavedReview(BaseModel):
    station_id: str
    date: date
    status: Literal["anomaly", "not_anomaly"] | None
    note: str
    reviewer_id: str
    reviewed_by: str
    reviewed_at: datetime
    revision: int
