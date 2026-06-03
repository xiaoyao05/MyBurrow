from datetime import date
from typing import Any, Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import SessionLocal
from backend.enums.ListingStatus import ListingStatus
from backend.enums.ReservationStatus import ReservationStatus
from backend.models.chat_room import ChatRoom
from backend.models.listing_unavailable_range import ListingUnavailableRange
from backend.models.listings import Listings
from backend.models.message import Message
from backend.models.reservation import Reservation
from backend.models.review import Review
from backend.models.users import Users
from backend.routers.auth import ALGORITHM, SECRET_KEY


ACTIVE_RESERVATION_STATUSES = (
    ReservationStatus.PENDING,
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED,
)


APPROVED_RESERVATION_STATUSES = (
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED,
)


# helper functions to convert python/database values into JSON-friendly formats for the MCP tools
# Depending on the MCP transport/client, raw date or Enum objects could fail serialization or show up awkwardly
def serialize_date(value: Any):
    return value.isoformat() if value else None


def enum_value(value: Any):
    return value.value if hasattr(value, "value") else value


# create safe listing for AI without exposing sensitive info about the user
def public_listing_payload(listing: Listings, owner: Optional[Users] = None) -> dict:
    return {
        "id": listing.id,
        "name": listing.name,
        "description": listing.description,
        "category": enum_value(listing.category),
        "location": listing.location,
        "status": enum_value(listing.status),
        "due_date": serialize_date(listing.due_date),
        "image_url": listing.image_url,
        "image_urls": listing.image_urls or ([listing.image_url] if listing.image_url else []),
        "owner": {
            "id": owner.id,
            "name": owner.name,
        } if owner else None,
    }


# mcp tools should not trust a raw user id sent by ai
# it decodes the jwt token to get the user id itself
async def get_user_id_from_access_token(db: AsyncSession, access_token: str) -> int:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception

        result = await db.execute(select(Users.id).where(Users.id == int(user_id)))
        if result.scalar_one_or_none() is None:
            raise credentials_exception

        return int(user_id)
    except (JWTError, ValueError):
        raise credentials_exception


async def get_room_for_user(db: AsyncSession, room_id: int, user_id: int) -> ChatRoom:
    result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    if user_id not in (room.lender_id, room.borrower_id):
        raise HTTPException(status_code=403, detail="Not allowed")

    return room


async def get_listing_for_room(db: AsyncSession, room: ChatRoom) -> Listings:
    result = await db.execute(select(Listings).where(Listings.id == room.listing_id))
    listing = result.scalar_one_or_none()

    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    return listing


async def get_current_reservation(db: AsyncSession, room_id: int) -> Optional[Reservation]:
    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.room_id == room_id,
            Reservation.status.in_(ACTIVE_RESERVATION_STATUSES),
        )
        .order_by(Reservation.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_blocked_ranges(db: AsyncSession, listing_id: int) -> list[dict]:
    reservation_result = await db.execute(
        select(Reservation).where(
            Reservation.listing_id == listing_id,
            Reservation.status.in_(ACTIVE_RESERVATION_STATUSES),
        )
    )
    blocked_ranges = [
        {
            "start_date": serialize_date(reservation.start_date),
            "end_date": serialize_date(reservation.end_date),
            "status": enum_value(reservation.status),
        }
        for reservation in reservation_result.scalars().all()
    ]

    unavailable_result = await db.execute(
        select(ListingUnavailableRange).where(
            ListingUnavailableRange.listing_id == listing_id
        )
    )
    blocked_ranges.extend(
        {
            "start_date": serialize_date(unavailable_range.start_date),
            "end_date": serialize_date(unavailable_range.end_date),
            "status": "unavailable",
        }
        for unavailable_range in unavailable_result.scalars().all()
    )

    return blocked_ranges


async def get_current_unavailable_range(
    db: AsyncSession,
    listing_id: int,
) -> Optional[ListingUnavailableRange]:
    today = date.today()
    result = await db.execute(
        select(ListingUnavailableRange)
        .where(
            ListingUnavailableRange.listing_id == listing_id,
            ListingUnavailableRange.start_date <= today,
            ListingUnavailableRange.end_date >= today,
        )
        .order_by(ListingUnavailableRange.end_date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def reservation_payload(reservation: Optional[Reservation]) -> Optional[dict]:
    if not reservation:
        return None

    return {
        "id": reservation.id,
        "listing_id": reservation.listing_id,
        "room_id": reservation.room_id,
        "borrower_id": reservation.borrower_id,
        "lender_id": reservation.lender_id,
        "start_date": serialize_date(reservation.start_date),
        "end_date": serialize_date(reservation.end_date),
        "status": enum_value(reservation.status),
    }


# actual MCP tools logic for chat drafting
async def get_listing_context(access_token: str, listing_id: int) -> dict:
    async with SessionLocal() as db:
        await get_user_id_from_access_token(db, access_token)

        result = await db.execute(select(Listings).where(Listings.id == listing_id))
        listing = result.scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        owner_result = await db.execute(select(Users).where(Users.id == listing.owner_id))
        owner = owner_result.scalar_one_or_none()

        rating_result = await db.execute(
            select(
                func.avg(Review.item_score).label("rating_average"),
                func.count(Review.id).label("rating_count"),
            ).where(Review.listing_id == listing.id)
        )
        rating = rating_result.one()

        return {
            "listing": public_listing_payload(listing, owner),
            "rating_summary": {
                "rating_average": float(rating.rating_average)
                if rating.rating_average is not None
                else None,
                "rating_count": rating.rating_count,
            },
        }

# actual MCP tools logic for chat drafting
async def get_chat_context(access_token: str, room_id: int, limit: int = 8) -> dict:
    async with SessionLocal() as db:
        user_id = await get_user_id_from_access_token(db, access_token)
        room = await get_room_for_user(db, room_id, user_id)
        listing = await get_listing_for_room(db, room)

        other_user_id = room.lender_id if room.lender_id != user_id else room.borrower_id
        other_user_result = await db.execute(select(Users).where(Users.id == other_user_id))
        other_user = other_user_result.scalar_one_or_none()

        messages_result = await db.execute(
            select(Message)
            .where(Message.room_id == room_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(max(1, min(limit, 20)))
        )
        messages = list(reversed(messages_result.scalars().all()))

        return {
            "room_id": room.id,
            "current_user_id": user_id,
            "current_user_role": "owner" if user_id == room.lender_id else "borrower",
            "listing": public_listing_payload(listing),
            "other_user": {
                "id": other_user.id,
                "name": other_user.name,
            } if other_user else None,
            "recent_messages": [
                {
                    "id": message.id,
                    "sender": "me" if message.sender_id == user_id else "other_user",
                    "content": message.content,
                    "created_at": serialize_date(message.created_at),
                    "is_read": message.is_read,
                }
                for message in messages
            ],
        }

# actual mcp tool logic for availability-aaware replies
async def get_reservation_context(access_token: str, room_id: int) -> dict:
    async with SessionLocal() as db:
        user_id = await get_user_id_from_access_token(db, access_token)
        room = await get_room_for_user(db, room_id, user_id)
        listing = await get_listing_for_room(db, room)
        current_reservation = await get_current_reservation(db, room_id)
        unavailable_range = await get_current_unavailable_range(db, listing.id)

        listing_status = (
            ListingStatus.UNAVAILABLE
            if unavailable_range
            else listing.status
        )
        listing_due_date = unavailable_range.end_date if unavailable_range else listing.due_date

        return {
            "room_id": room.id,
            "listing_id": listing.id,
            "listing_name": listing.name,
            "lender_id": room.lender_id,
            "borrower_id": room.borrower_id,
            "current_user_role": "owner" if user_id == room.lender_id else "borrower",
            "listing_status": enum_value(listing_status),
            "listing_due_date": serialize_date(listing_due_date),
            "current_reservation": reservation_payload(current_reservation),
            "blocked_ranges": await get_blocked_ranges(db, listing.id),
        }


async def check_listing_availability(
    access_token: str,
    listing_id: int,
    start_date: str,
    end_date: str,
) -> dict:
    async with SessionLocal() as db:
        await get_user_id_from_access_token(db, access_token)

        try:
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Dates must use YYYY-MM-DD format",
            )

        if end < start:
            raise HTTPException(status_code=400, detail="End date must be after start date")

        listing_result = await db.execute(select(Listings).where(Listings.id == listing_id))
        listing = listing_result.scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        reservation_result = await db.execute(
            select(Reservation)
            .where(
                Reservation.listing_id == listing_id,
                Reservation.status.in_(APPROVED_RESERVATION_STATUSES),
                Reservation.start_date <= end,
                Reservation.end_date >= start,
            )
            .limit(1)
        )
        reservation = reservation_result.scalar_one_or_none()

        unavailable_result = await db.execute(
            select(ListingUnavailableRange)
            .where(
                ListingUnavailableRange.listing_id == listing_id,
                ListingUnavailableRange.start_date <= end,
                ListingUnavailableRange.end_date >= start,
            )
            .limit(1)
        )
        unavailable_range = unavailable_result.scalar_one_or_none()

        if reservation:
            return {
                "available": False,
                "reason": "Listing already has an approved or borrowed reservation in that date range.",
                "conflict": reservation_payload(reservation),
            }

        if unavailable_range:
            return {
                "available": False,
                "reason": "Owner marked the listing unavailable in that date range.",
                "conflict": {
                    "start_date": serialize_date(unavailable_range.start_date),
                    "end_date": serialize_date(unavailable_range.end_date),
                    "status": "unavailable",
                },
            }

        return {
            "available": True,
            "reason": "No approved reservations or unavailable ranges overlap those dates.",
            "listing": public_listing_payload(listing),
        }


async def get_review_context(access_token: str, reservation_id: int) -> dict:
    async with SessionLocal() as db:
        user_id = await get_user_id_from_access_token(db, access_token)

        reservation_result = await db.execute(
            select(Reservation).where(Reservation.id == reservation_id)
        )
        reservation = reservation_result.scalar_one_or_none()
        if not reservation:
            raise HTTPException(status_code=404, detail="Reservation not found")

        if user_id != reservation.borrower_id:
            raise HTTPException(status_code=403, detail="Only the borrower can review")

        listing_result = await db.execute(
            select(Listings).where(Listings.id == reservation.listing_id)
        )
        listing = listing_result.scalar_one_or_none()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        owner_result = await db.execute(select(Users).where(Users.id == reservation.lender_id))
        owner = owner_result.scalar_one_or_none()

        review_result = await db.execute(
            select(Review).where(Review.reservation_id == reservation.id)
        )
        review = review_result.scalar_one_or_none()

        return {
            "reservation": reservation_payload(reservation),
            "listing": public_listing_payload(listing, owner),
            "can_review": reservation.status == ReservationStatus.RETURNED,
            "existing_review": {
                "item_score": review.item_score,
                "owner_score": review.owner_score,
                "item_comment": review.item_comment,
                "owner_comment": review.owner_comment,
            } if review else None,
        }
