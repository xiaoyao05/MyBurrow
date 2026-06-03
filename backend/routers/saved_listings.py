from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.models import Listings, SavedListing
from backend.routers.auth import get_current_user

router = APIRouter(
    prefix="/saved-listings",
    tags=["saved-listings"]
)


@router.get("/ids", response_model=list[int])
async def get_saved_listing_ids(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(SavedListing.listing_id)
        .where(SavedListing.user_id == current_user)
        .order_by(SavedListing.id.desc())
    )

    return result.scalars().all()


@router.post("/{listing_id}")
async def save_listing(
    listing_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    listing_result = await db.execute(
        select(Listings.id).where(Listings.id == listing_id)
    )

    if not listing_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Listing not found")

    existing_result = await db.execute(
        select(SavedListing).where(
            SavedListing.user_id == current_user,
            SavedListing.listing_id == listing_id
        )
    )

    existing_saved_listing = existing_result.scalar_one_or_none()
    if existing_saved_listing:
        return {"saved": True}

    db.add(SavedListing(user_id=current_user, listing_id=listing_id))
    await db.commit()

    return {"saved": True}


@router.delete("/{listing_id}")
async def unsave_listing(
    listing_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    await db.execute(
        delete(SavedListing).where(
            SavedListing.user_id == current_user,
            SavedListing.listing_id == listing_id
        )
    )
    await db.commit()

    return {"saved": False}
