from typing import List, Optional
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator


BACKEND_DIR = Path(__file__).resolve().parents[1]

class Settings(BaseSettings):
    API_PREFIX: str = "/api"
    DEBUG: bool = False

    DATABASE_URL: str 

    ALLOWED_ORIGINS: List[str] = []

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4.1-mini"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    def parse_allowed_origins(cls, v) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    class Config:
        env_file = BACKEND_DIR / ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
