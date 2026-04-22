from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="AI Video Insight Python Backend", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="127.0.0.1", alias="APP_HOST")
    app_port: int = Field(default=8001, alias="APP_PORT")
    allowed_origins: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    pipeline_debug_enabled: bool | None = Field(
        default=None, alias="PIPELINE_DEBUG_ENABLED"
    )
    chat_provider: str = Field(default="stub", alias="CHAT_PROVIDER")
    langchain_enabled: bool = Field(default=False, alias="LANGCHAIN_ENABLED")
    chat_model_adapter: str | None = Field(default=None, alias="CHAT_MODEL_ADAPTER")
    ai_base_url: str | None = Field(default=None, alias="AI_BASE_URL")
    ai_api_key: str | None = Field(default=None, alias="AI_API_KEY")
    ai_model: str | None = Field(default=None, alias="AI_MODEL")
    ai_timeout_ms: int = Field(default=25000, alias="AI_TIMEOUT_MS")

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local", "../.env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def is_pipeline_debug_enabled(self) -> bool:
        if self.pipeline_debug_enabled is not None:
            return self.pipeline_debug_enabled

        return self.app_env.lower() != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
