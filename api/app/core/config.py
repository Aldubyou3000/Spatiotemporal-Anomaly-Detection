from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    supabase_jwt_secret: str
    allowed_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    # "lax" in dev (cross-site GET ok); override to "strict" in production
    cookie_samesite: str = "lax"
    dev_mode: bool = True

    # CSRF — double-submit cookie pattern; generate with: secrets.token_hex(32)
    csrf_secret: str = "change-me-in-production"

    # Account lockout
    lockout_max_attempts: int = 5      # failed attempts before lockout
    lockout_window_seconds: int = 300  # sliding window (5 min)
    lockout_duration_seconds: int = 900  # lockout lasts 15 min

    # Google OAuth (analyst web sign-in). The Google client ID/secret live in
    # the Supabase dashboard, not here — we only need the feature flag and the
    # URLs for the server-side PKCE round-trip.
    google_oauth_enabled: bool = False
    # Base URL of THIS API for the WEB callback (analysts use the dashboard from
    # the PC → localhost is correct).
    oauth_redirect_base: str = "http://localhost:8000"
    # Base URL of THIS API for the MOBILE callback. The phone reaches the API over
    # the LAN IP, never localhost. Empty → fall back to oauth_redirect_base. The
    # /start handler usually derives this from the request Host header anyway; this
    # is the safety net when the Host header is missing.
    mobile_oauth_redirect_base: str = ""
    # Where the browser is sent after the callback resolves (the Next.js app).
    web_app_url: str = "http://localhost:3000"

    @property
    def oauth_google_callback_url(self) -> str:
        return f"{self.oauth_redirect_base.rstrip('/')}/api/auth/oauth/google/callback"

    @property
    def mobile_oauth_callback_url(self) -> str:
        base = (self.mobile_oauth_redirect_base or self.oauth_redirect_base).rstrip("/")
        return f"{base}/api/mobile/auth/oauth/google/callback"

    @property
    def allowed_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",")]
        if self.dev_mode:
            extra = [
                "http://localhost:8081", "http://localhost:8082",
                "http://localhost:19006", "http://localhost:19000",
                "http://localhost:3000",
                "http://192.168.100.10:8081", "http://192.168.100.10:19006",
                "http://192.168.100.10:3000",
            ]
            return list(dict.fromkeys(origins + extra))
        return origins

    def assert_production_safe(self) -> None:
        """Fail closed: refuse to run in production with insecure defaults.

        Called at app startup. Only enforced when dev_mode is False, so local
        development is unaffected. Catches the classic "shipped with the dev
        config" foot-guns before they become a live exposure.
        """
        if self.dev_mode:
            return

        problems: list[str] = []
        if self.csrf_secret == "change-me-in-production" or len(self.csrf_secret) < 32:
            problems.append("CSRF_SECRET is unset/default/too short (need a 32+ char random value)")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true in production (cookies sent over HTTPS only)")
        if self.cookie_samesite not in ("lax", "strict"):
            problems.append(f"COOKIE_SAMESITE must be 'lax' or 'strict', got {self.cookie_samesite!r}")
        localhost_origins = [o for o in self.allowed_origins_list
                             if "localhost" in o or "127.0.0.1" in o or "192.168." in o]
        if localhost_origins:
            problems.append(f"ALLOWED_ORIGINS contains dev origins in production: {localhost_origins}")
        if self.google_oauth_enabled and self.web_app_url.startswith("http://"):
            problems.append("WEB_APP_URL must be https in production when OAuth is enabled")

        if problems:
            raise RuntimeError(
                "Refusing to start: insecure production configuration.\n  - "
                + "\n  - ".join(problems)
            )


settings = Settings()
