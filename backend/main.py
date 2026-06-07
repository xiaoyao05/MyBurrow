from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text
from backend.core.config import settings
from backend.routers import activity, ai, auth, calendar, listings, profile, chat, saved_listings, reviews, mcp_context
from backend.db.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE messages "
                "ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE messages "
                "ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "UPDATE messages "
                "SET is_system = true "
                "WHERE content LIKE 'Reservation request:%' "
                "OR content LIKE 'Reservation approved:%' "
                "OR content LIKE 'Reservation cancelled by the owner.%' "
                "OR content LIKE 'Reservation request cancelled by the borrower.%' "
                "OR content LIKE 'Borrow confirmed.%' "
                "OR content LIKE 'Return confirmed.%'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS lender_hidden BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS borrower_hidden BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS lender_cleared_at TIMESTAMP"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS borrower_cleared_at TIMESTAMP"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS profile_picture TEXT"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ALTER COLUMN hashed_password DROP NOT NULL"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS auth_provider VARCHAR NOT NULL DEFAULT 'local'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE listings "
                "ALTER COLUMN location TYPE VARCHAR USING location::text"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE listings "
                "ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE reservations "
                "ADD COLUMN IF NOT EXISTS borrower_calendar_added BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE reservations "
                "ADD COLUMN IF NOT EXISTS lender_calendar_added BOOLEAN NOT NULL DEFAULT false"
            )
        )
    yield

app = FastAPI(lifespan=lifespan)

default_allowed_origins = [
    "http://localhost:5173",
    "https://myburrow.vercel.app",
    "https://myburrow-lb8ix65rf-xiaoyao05s-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or default_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(listings.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(saved_listings.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(mcp_context.router, prefix="/api")
