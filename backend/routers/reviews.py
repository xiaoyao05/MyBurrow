from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.enums.ReservationStatus import ReservationStatus
from backend.models import Listings, Reservation, Review, Users
from backend.routers.auth import get_current_user
from backend.schemas.review import (
    ReviewCreate,
    ReviewListingContextOut,
    ReviewOut,
    ReviewerOut,
    ReviewReservationContextOut,
    UserReviewOut,
)

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"]
)


async def build_review_out(db: AsyncSession, review: Review) -> ReviewOut:
    borrower_result = await db.execute(
        select(Users).where(Users.id == review.borrower_id)
    )
    borrower = borrower_result.scalar_one_or_none()

    return ReviewOut(
        id=review.id,
        reservation_id=review.reservation_id,
        listing_id=review.listing_id,
        borrower_id=review.borrower_id,
        owner_id=review.owner_id,
        item_score=review.item_score,
        owner_score=review.owner_score,
        item_comment=review.item_comment,
        owner_comment=review.owner_comment,
        reviewer=(
            ReviewerOut(id=borrower.id, name=borrower.name)
            if borrower
            else None
        ),
        created_at=review.created_at,
        updated_at=review.updated_at
    )


async def build_user_review_out(db: AsyncSession, review: Review) -> UserReviewOut:
    review_out = await build_review_out(db, review)
    listing_result = await db.execute(
        select(Listings).where(Listings.id == review.listing_id)
    )
    listing = listing_result.scalar_one_or_none()

    return UserReviewOut(
        **review_out.model_dump(),
        listing=(
            ReviewListingContextOut(
                id=listing.id,
                name=listing.name,
                description=listing.description,
                image_url=listing.image_url
            )
            if listing
            else None
        )
    )


@router.get("/listings/{listing_id}", response_model=list[ReviewOut])
async def get_listing_reviews(
    listing_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Review)
        .where(Review.listing_id == listing_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
    )

    return [
        await build_review_out(db, review)
        for review in result.scalars().all()
    ]


@router.get("/users/{user_id}", response_model=list[UserReviewOut])
async def get_user_reviews(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    user_result = await db.execute(select(Users).where(Users.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(Review)
        .where(Review.owner_id == user_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
    )

    return [
        await build_user_review_out(db, review)
        for review in result.scalars().all()
    ]


@router.get("/reservations/{reservation_id}", response_model=ReviewReservationContextOut)
async def get_review_context(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    reservation_result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if current_user != reservation.borrower_id:
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

    return ReviewReservationContextOut(
        reservation_id=reservation.id,
        listing=ReviewListingContextOut(
            id=listing.id,
            name=listing.name,
            description=listing.description,
            image_url=listing.image_url,
            image_urls=listing.image_urls or ([listing.image_url] if listing.image_url else []),
            owner_name=owner.name if owner else None
        ),
        status=reservation.status,
        existing_review=(await build_review_out(db, review) if review else None)
    )


@router.post("/reservations/{reservation_id}", response_model=ReviewOut)
async def submit_review(
    reservation_id: int,
    review_data: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    reservation_result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if current_user != reservation.borrower_id:
        raise HTTPException(status_code=403, detail="Only the borrower can review")

    if reservation.status != ReservationStatus.RETURNED:
        raise HTTPException(
            status_code=400,
            detail="You can review after the item has been returned"
        )

    listing_exists_result = await db.execute(
        select(func.count(Listings.id)).where(Listings.id == reservation.listing_id)
    )
    if listing_exists_result.scalar_one() == 0:
        raise HTTPException(status_code=404, detail="Listing not found")

    review_result = await db.execute(
        select(Review).where(Review.reservation_id == reservation.id)
    )
    review = review_result.scalar_one_or_none()

    if review: 
        # Update existing review
        review.item_score = review_data.item_score
        review.owner_score = review_data.owner_score
        review.item_comment = review_data.item_comment
        review.owner_comment = review_data.owner_comment
    else:
        review = Review(
            reservation_id=reservation.id,
            listing_id=reservation.listing_id,
            borrower_id=reservation.borrower_id,
            owner_id=reservation.lender_id,
            item_score=review_data.item_score,
            owner_score=review_data.owner_score,
            item_comment=review_data.item_comment,
            owner_comment=review_data.owner_comment
        )
        db.add(review)

    await db.commit()
    await db.refresh(review)

    return await build_review_out(db, review)
