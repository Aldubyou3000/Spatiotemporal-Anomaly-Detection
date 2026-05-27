from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    supabase_jwt_secret: str
    allowed_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    dev_mode: bool = True

    @property
    def allowed_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",")]
        if self.dev_mode:
            # In dev, also allow any localhost/LAN origin for Expo web
            extra = [
                "http://localhost:8081", "http://localhost:8082",
                "http://localhost:19006", "http://localhost:19000",
                "http://localhost:3000",
                f"http://192.168.100.10:8081", f"http://192.168.100.10:19006",
                f"http://192.168.100.10:3000",
            ]
            return list(dict.fromkeys(origins + extra))
        return origins


settings = Settings()
