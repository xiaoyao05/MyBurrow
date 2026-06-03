from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload
from datetime import date

from backend.db import get_db
from backend.models import ChatRoom, Listings, Message, Review, SavedListing
from backend.models.listing_unavailable_range import ListingUnavailableRange
from backend.models.reservation import Reservation
from backend.schemas import ListingCreate
from backend.schemas.ListingCreate import ListingAvailabilityUpdate, ListingOut
from backend.routers.auth import get_current_user
from backend.enums.ListingStatus import ListingStatus
from backend.enums.ReservationStatus import ReservationStatus
import uuid, supabase, os

supabase = supabase.create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

router = APIRouter(
    prefix="/listings",
    tags=["listings"]
)

ACTIVE_RESERVATION_STATUSES = (
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED
)


async def attach_listing_dates_and_status(db: AsyncSession, listings: list[Listings]):
    listing_ids = [listing.id for listing in listings]
    if not listing_ids:
        return listings

    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.listing_id.in_(listing_ids),
            Reservation.status.in_(ACTIVE_RESERVATION_STATUSES)
        )
        .order_by(Reservation.id.desc())
    )

    reservations_by_listing = {}
    for reservation in result.scalars().all():
        reservations_by_listing.setdefault(reservation.listing_id, reservation)

    unavailable_result = await db.execute(
        select(ListingUnavailableRange)
        .where(ListingUnavailableRange.listing_id.in_(listing_ids))
        .order_by(ListingUnavailableRange.start_date.asc(), ListingUnavailableRange.id.asc())
    )

    unavailable_by_listing = {}
    today = date.today()

    for unavailable_range in unavailable_result.scalars().all():
        existing_range = unavailable_by_listing.get(unavailable_range.listing_id)
        if (
            existing_range is None
            or existing_range.end_date < today <= unavailable_range.end_date
            or unavailable_range.start_date < existing_range.start_date
        ):
            unavailable_by_listing[unavailable_range.listing_id] = unavailable_range

    for listing in listings:
        reservation = reservations_by_listing.get(listing.id)
        unavailable_range = unavailable_by_listing.get(listing.id)
        listing.expected_borrow_start_date = reservation.start_date if reservation else None
        listing.expected_borrow_end_date = reservation.end_date if reservation else None
        listing.unavailable_start_date = unavailable_range.start_date if unavailable_range else None
        listing.unavailable_end_date = unavailable_range.end_date if unavailable_range else None

        if unavailable_range and unavailable_range.start_date <= today <= unavailable_range.end_date:
            listing.status = ListingStatus.UNAVAILABLE
            listing.due_date = unavailable_range.end_date
        elif reservation:
            listing.status = (
                ListingStatus.UNAVAILABLE
                if reservation.status == ReservationStatus.BORROWED
                else ListingStatus.RESERVED
            )
            listing.due_date = reservation.end_date
        elif listing.status == ListingStatus.UNAVAILABLE:
            listing.status = ListingStatus.AVAILABLE
            listing.due_date = None

    return listings


async def attach_listing_rating_summary(db: AsyncSession, listings: list[Listings]):
    listing_ids = [listing.id for listing in listings]
    if not listing_ids:
        return listings

    result = await db.execute(
        select(
            Review.listing_id,
            func.avg(Review.item_score).label("rating_average"),
            func.count(Review.id).label("rating_count")
        )
        .where(Review.listing_id.in_(listing_ids))
        .group_by(Review.listing_id)
    )
    ratings_by_listing = {
        row.listing_id: {
            "rating_average": float(row.rating_average),
            "rating_count": row.rating_count
        }
        for row in result
    }

    for listing in listings:
        rating_summary = ratings_by_listing.get(listing.id)
        listing.rating_average = (
            rating_summary["rating_average"]
            if rating_summary
            else None
        )
        listing.rating_count = rating_summary["rating_count"] if rating_summary else 0

    return listings


async def enrich_listings(db: AsyncSession, listings: list[Listings]):
    listings = await attach_listing_dates_and_status(db, listings)
    listings = await attach_listing_rating_summary(db, listings)

    for listing in listings:
        if not listing.image_urls:
            listing.image_urls = [listing.image_url] if listing.image_url else []
        if not listing.image_url and listing.image_urls:
            listing.image_url = listing.image_urls[0]

    return listings


@router.post("/create")
async def create_listing(
    listing_data: ListingCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id = Depends(get_current_user)
):
    new_listing = Listings(
        name=listing_data.name,
        description=listing_data.description,
        category=listing_data.category,
        location=listing_data.location,
        status=listing_data.status,
        image_url=listing_data.image_url,
        image_urls=listing_data.image_urls or (
            [listing_data.image_url] if listing_data.image_url else []
        ),
        due_date=listing_data.due_date,
        owner_id=current_user_id
    )

    db.add(new_listing)
    await db.commit()
    await db.refresh(new_listing)

    return new_listing

@router.get("", response_model=list[ListingOut])
async def get_all_listings(
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Listings).options(selectinload(Listings.owner))
    )

    items = result.scalars().all()

    return await enrich_listings(db, items)


@router.get("/mylistings", response_model=list[ListingOut])
async def get_my_listings(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    result = await db.execute(
        select(Listings)
        .options(selectinload(Listings.owner))
        .where(Listings.owner_id == current_user)
    )

    items = result.scalars().all()

    return await enrich_listings(db, items)


@router.get("/{listing_id}", response_model=ListingOut)
async def get_listing(
    listing_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Listings)
        .options(selectinload(Listings.owner))
        .where(Listings.id == listing_id)
    )

    listing = result.scalar_one_or_none()

    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found"
        )

    enriched_listing = await enrich_listings(db, [listing])

    return enriched_listing[0]


@router.delete("/delete/{item_id}")
async def delete_listing(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    print(f"Deleting listing {item_id} for user {current_user}")
    result = await db.execute(
        select(Listings).where(
            Listings.id == item_id,
            Listings.owner_id == current_user
        )
    )

    listing = result.scalar_one_or_none()

    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found or not owned by user"
        )

    chat_room_result = await db.execute(
        select(ChatRoom.id).where(ChatRoom.listing_id == listing.id)
    )
    chat_room_ids = chat_room_result.scalars().all()

    await db.execute(delete(Review).where(Review.listing_id == listing.id))

    if chat_room_ids:
        await db.execute(delete(Message).where(Message.room_id.in_(chat_room_ids)))
        await db.execute(delete(Reservation).where(Reservation.room_id.in_(chat_room_ids)))
        await db.execute(delete(ChatRoom).where(ChatRoom.id.in_(chat_room_ids)))

    await db.execute(delete(SavedListing).where(SavedListing.listing_id == listing.id))
    await db.execute(delete(Reservation).where(Reservation.listing_id == listing.id))
    await db.execute(
        delete(ListingUnavailableRange).where(
            ListingUnavailableRange.listing_id == listing.id
        )
    )
    await db.delete(listing)
    await db.commit()

    return {
        "message": "Listing deleted successfully"
    }

@router.put("/edit/{listing_id}")
async def update_listing(
    listing_id: int,
    listing_data: ListingCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    result = await db.execute(
        select(Listings).where(
            Listings.id == listing_id,
            Listings.owner_id == current_user
        )
    )

    listing = result.scalar_one_or_none()

    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found or not owned by user"
        )

    listing.name = listing_data.name
    listing.description = listing_data.description
    listing.category = listing_data.category
    listing.status = listing_data.status
    listing.location = listing_data.location
    listing.due_date = listing_data.due_date
    listing.image_urls = listing_data.image_urls
    listing.image_url = listing_data.image_urls[0] if listing_data.image_urls else ""
    
    db.add(listing)
    await db.commit()
    await db.refresh(listing)

    return listing


@router.patch("/{listing_id}/availability", response_model=ListingOut)
async def update_listing_availability(
    listing_id: int,
    availability_data: ListingAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if availability_data.status not in (
        ListingStatus.AVAILABLE,
        ListingStatus.UNAVAILABLE
    ):
        raise HTTPException(
            status_code=400,
            detail="Availability can only be Available or Unavailable"
        )

    result = await db.execute(
        select(Listings)
        .options(selectinload(Listings.owner))
        .where(
            Listings.id == listing_id,
            Listings.owner_id == current_user
        )
    )
    listing = result.scalar_one_or_none()

    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found or not owned by user"
        )

    await db.execute(
        delete(ListingUnavailableRange).where(
            ListingUnavailableRange.listing_id == listing.id
        )
    )

    if availability_data.status == ListingStatus.UNAVAILABLE:
        if not availability_data.start_date or not availability_data.end_date:
            raise HTTPException(
                status_code=400,
                detail="Start date and end date are required"
            )

        if availability_data.end_date < availability_data.start_date:
            raise HTTPException(
                status_code=400,
                detail="End date must be after start date"
            )

        overlapping_reservation_result = await db.execute(
            select(Reservation.id)
            .where(
                Reservation.listing_id == listing.id,
                Reservation.status.in_(ACTIVE_RESERVATION_STATUSES),
                Reservation.start_date <= availability_data.end_date,
                Reservation.end_date >= availability_data.start_date
            )
            .limit(1)
        )

        if overlapping_reservation_result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Unavailable dates cannot overlap active reservations"
            )

        unavailable_range = ListingUnavailableRange(
            listing_id=listing.id,
            start_date=availability_data.start_date,
            end_date=availability_data.end_date
        )
        db.add(unavailable_range)

    listing.status = ListingStatus.AVAILABLE
    listing.due_date = None

    await db.commit()
    await db.refresh(listing)

    enriched_listing = await attach_listing_dates_and_status(db, [listing])

    return enriched_listing[0]


BUCKET_NAME = "listing-images"

#validates file is an image, generates a unique filename and uploads to supabase storage, then returns public url
async def upload_listing_file(listing_id: int, file: UploadFile):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    file_extension = file.filename.split(".")[-1]
    file_name = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"listings/{listing_id}/{file_name}"
    file_bytes = await file.read()

    supabase.storage.from_(BUCKET_NAME).upload(
        file_path,
        file_bytes,
        {"content-type": file.content_type}
    )

    return supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)

@router.post("/{listing_id}/image")
async def upload_listing_image(
    listing_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    result = await db.execute(
        select(Listings).where(
            Listings.id == listing_id,
            Listings.owner_id == current_user
        )
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found or not owned by user"
        )
    
    public_url = await upload_listing_file(listing_id, file)
    print("public_url:", public_url)

    listing.image_url = public_url
    listing.image_urls = [public_url]
    await db.commit()

    return {"image_url": public_url, "image_urls": listing.image_urls}


@router.post("/{listing_id}/images")
async def upload_listing_images(
    listing_id: int,
    files: list[UploadFile] = File(...),
    replace: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one image is required")

    result = await db.execute(
        select(Listings).where(
            Listings.id == listing_id,
            Listings.owner_id == current_user
        )
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(
            status_code=404,
            detail="Listing not found or not owned by user"
        )

    uploaded_urls = []
    for file in files:
        uploaded_urls.append(await upload_listing_file(listing_id, file))

    existing_urls = [] if replace else (listing.image_urls or [])
    listing.image_urls = [*existing_urls, *uploaded_urls]
    listing.image_url = listing.image_urls[0]
    await db.commit()

    return {"image_url": listing.image_url, "image_urls": listing.image_urls}
