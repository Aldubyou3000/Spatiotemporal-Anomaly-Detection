"""Quick smoke test for the auth cookie flow.

Run with: python smoke_auth.py <credential> <password>
Tests: login -> me -> logout, checking cookies + status codes.
"""
import sys
import requests

BASE = "http://localhost:8000"


def main(credential: str, password: str) -> int:
    s = requests.Session()

    print("\n[1] POST /api/auth/login")
    r = s.post(f"{BASE}/api/auth/login", json={"credential": credential, "password": password})
    print(f"    status: {r.status_code}")
    print(f"    cookies received: {dict(s.cookies)}")
    if r.status_code != 200:
        print(f"    error body: {r.text}")
        return 1

    set_cookie_headers = r.headers.get("Set-Cookie", "")
    print(f"    Set-Cookie header: {set_cookie_headers[:200]}...")
    has_secure = "Secure" in set_cookie_headers
    has_httponly = "HttpOnly" in set_cookie_headers
    has_samesite = "SameSite" in set_cookie_headers
    print(f"    HttpOnly: {has_httponly}  Secure: {has_secure}  SameSite: {has_samesite}")
    if has_secure:
        print("    ⚠ WARNING: Secure=True over HTTP — browser will silently drop cookies.")

    print("\n[2] GET /api/auth/me (with cookie jar)")
    r = s.get(f"{BASE}/api/auth/me")
    print(f"    status: {r.status_code}")
    print(f"    body: {r.text[:200]}")
    if r.status_code != 200:
        print("    ✗ /me failed even with cookies — token verification problem.")
        return 1

    print("\n[3] POST /api/auth/logout")
    r = s.post(f"{BASE}/api/auth/logout")
    print(f"    status: {r.status_code}")

    print("\n✓ Auth cookie flow works end-to-end.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python smoke_auth.py <credential> <password>")
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
