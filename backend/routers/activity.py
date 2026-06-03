from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db import get_db
from backend.enums.ReservationStatus import ReservationStatus
from backend.models import Listings, Reservation, SavedListing, Users
from backend.routers.auth import get_current_user
from backend.routers.listings import enrich_listings
from backend.schemas.ListingCreate import ListingOut
from backend.schemas.activity import ActivityOut

router = APIRouter(
    prefix="/activity",
    tags=["activity"]
)

ONGOING_STATUSES = (
    ReservationStatus.PENDING,
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED
)

HISTORY_STATUSES = (
    ReservationStatus.RETURNED,
    ReservationStatus.CANCELLED
)


async def build_activity_response(
    db: AsyncSession,
    reservations: list[Reservation],
    role: str = "borrower"
) -> list[ActivityOut]:
    listing_ids = [reservation.listing_id for reservation in reservations]
    if not listing_ids:
        return []

    listing_result = await db.execute(
        select(Listings)
        .options(selectinload(Listings.owner))
        .where(Listings.id.in_(listing_ids))
    )
    listings = await enrich_listings(
        db,
        listing_result.scalars().all()
    )
    listings_by_id = {listing.id: listing for listing in listings}
    counterparty_ids = [
        reservation.lender_id if role == "borrower" else reservation.borrower_id
        for reservation in reservations
    ]
    users_by_id = {}

    if counterparty_ids:
        user_result = await db.execute(
            select(Users).where(Users.id.in_(counterparty_ids))
        )
        users_by_id = {user.id: user for user in user_result.scalars().all()}

    return [
        ActivityOut(
            id=reservation.id,
            listing_id=reservation.listing_id,
            room_id=reservation.room_id,
            start_date=reservation.start_date,
            end_date=reservation.end_date,
            status=reservation.status,
            listing=ListingOut.model_validate(listings_by_id[reservation.listing_id]),
            counterparty_name=(
                users_by_id.get(
                    reservation.lender_id if role == "borrower" else reservation.borrower_id
                ).name
                if users_by_id.get(
                    reservation.lender_id if role == "borrower" else reservation.borrower_id
                )
                else None
            ),
            calendar_added=(
                reservation.borrower_calendar_added
                if role == "borrower"
                else reservation.lender_calendar_added
            )
        )
        for reservation in reservations
        if reservation.listing_id in listings_by_id
    ]


@router.get("/ongoing", response_model=list[ActivityOut])
async def get_ongoing_activity(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.borrower_id == current_user,
            Reservation.status.in_(ONGOING_STATUSES)
        )
        .order_by(Reservation.start_date.asc(), Reservation.id.desc())
    )

    return await build_activity_response(db, result.scalars().all(), role="borrower")


@router.get("/history", response_model=list[ActivityOut])
async def get_activity_history(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.borrower_id == current_user,
            Reservation.status.in_(HISTORY_STATUSES)
        )
        .order_by(Reservation.end_date.desc(), Reservation.id.desc())
    )

    return await build_activity_response(db, result.scalars().all(), role="borrower")


@router.get("/lending", response_model=list[ActivityOut])
async def get_lending_activity(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.lender_id == current_user,
            Reservation.status.in_(ONGOING_STATUSES)
        )
        .order_by(Reservation.start_date.asc(), Reservation.id.desc())
    )

    return await build_activity_response(db, result.scalars().all(), role="owner")


@router.get("/saved", response_model=list[ListingOut])
async def get_saved_activity(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(Listings)
        .join(SavedListing, SavedListing.listing_id == Listings.id)
        .options(selectinload(Listings.owner))
        .where(SavedListing.user_id == current_user)
        .order_by(SavedListing.id.desc())
    )

    return await enrich_listings(db, result.scalars().all())
