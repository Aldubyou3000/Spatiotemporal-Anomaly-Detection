"""Translate raw database / Supabase errors into safe, user-friendly messages.

Why this exists
───────────────
Supabase/PostgREST surface raw Postgres errors (constraint names, SQLSTATE
codes, table internals) as exceptions. If those reach the API response they both
read badly to users AND leak schema internals (e.g. the `profiles_username_key`
constraint name, the 23505 SQLSTATE). This module maps the common cases to clean
messages and otherwise returns a safe generic fallback — never the raw text.

Usage in a service that performs a write:

    from ..core.errors import friendly_db_error

    try:
        admin.table("profiles").upsert(row).execute()
    except Exception as e:                 # noqa: BLE001 — translate, don't leak
        raise ValueError(friendly_db_error(e)) from e

The router then surfaces the ValueError message as the response `detail`. Any
exception NOT raised as a clean ValueError is caught by the global handler in
main.py and returned as a generic 500, so raw errors can never reach the client.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("errors")

# Postgres SQLSTATE codes we know how to phrase nicely.
_UNIQUE_VIOLATION = "23505"
_FK_VIOLATION = "23503"
_NOT_NULL_VIOLATION = "23502"
_CHECK_VIOLATION = "23514"

# Map a known unique-constraint name (or a column hint within it) to a message.
# Keep these phrased for end users — no table/constraint names.
_UNIQUE_FIELD_MESSAGES = {
    "username": "That username is already taken. Please choose another.",
    "email": "An account with that email already exists.",
}

_GENERIC_DUPLICATE = "That record already exists."
_GENERIC_FALLBACK = "The request could not be completed. Please check your input and try again."


def _extract(err: object) -> tuple[str | None, str]:
    """Best-effort pull of (sqlstate_code, lowercased_text) from a Supabase /
    Postgres error of unknown shape (APIError, dict-like, or plain Exception)."""
    code: str | None = None
    parts: list[str] = []

    # Supabase APIError exposes .code / .message / .details / .hint
    for attr in ("code", "message", "details", "hint"):
        val = getattr(err, attr, None)
        if val:
            if attr == "code":
                code = str(val)
            parts.append(str(val))

    # Some errors carry a dict in .args[0]
    if not code and getattr(err, "args", None):
        first = err.args[0]
        if isinstance(first, dict):
            code = str(first.get("code") or "") or None
            for k in ("message", "details", "hint"):
                if first.get(k):
                    parts.append(str(first[k]))

    if not parts:
        parts.append(str(err))

    return code, " ".join(parts).lower()


def friendly_db_error(err: object, *, default: str | None = None) -> str:
    """Return a safe, user-facing message for a raw DB/Supabase error.

    Logs the raw error server-side (so engineers can still debug) but never
    returns it. `default` overrides the generic fallback for the calling context.
    """
    code, text = _extract(err)
    logger.warning("[db] translating error code=%s raw=%s", code, text[:300])

    # Supabase Auth phrases a duplicate-email registration as "User already
    # registered" / "email address ... already" — no SQLSTATE. Catch it as email.
    if "already registered" in text or ("email" in text and "already" in text):
        return _UNIQUE_FIELD_MESSAGES["email"]

    if code == _UNIQUE_VIOLATION or "duplicate key" in text or "already exists" in text:
        for field, message in _UNIQUE_FIELD_MESSAGES.items():
            # Match on the column appearing in the constraint name or detail text,
            # e.g. "profiles_username_key" or "Key (username)=(llwelyn)...".
            if field in text:
                return message
        return _GENERIC_DUPLICATE

    if code == _NOT_NULL_VIOLATION:
        return "A required field is missing. Please fill in all fields and try again."

    if code == _FK_VIOLATION:
        return "That action references a record that no longer exists."

    if code == _CHECK_VIOLATION:
        return "One of the values is not allowed. Please review and try again."

    return default or _GENERIC_FALLBACK
