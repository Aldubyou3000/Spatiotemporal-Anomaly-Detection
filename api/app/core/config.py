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


settings = Settings()
