from typing import List, Optional
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator


BACKEND_DIR = Path(__file__).resolve().parents[1]

class Settings(BaseSettings):
    API_PREFIX: str = "/api"
    DEBUG: bool = False

    DATABASE_URL: str 

    ALLOWED_ORIGINS: str = ""

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4.1-mini"

    @field_validator("ALLOWED_ORIGINS")
    def parse_allowed_origins(cls, v:str) ->  List[str]:
        return v.split(",") if v else []
    
    class Config:
        env_file = BACKEND_DIR / ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
