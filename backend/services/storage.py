import os
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

@lru_cache
def get_supabase_client():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=500,
            detail=(
                "Supabase storage is not configured. Set SUPABASE_URL and "
                "SUPABASE_SERVICE_KEY in Render environment variables."
            )
        )

    return create_client(supabase_url, supabase_key)
