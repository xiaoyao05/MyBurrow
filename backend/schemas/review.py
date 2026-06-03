from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from backend.enums.ReservationStatus import ReservationStatus


class ReviewerOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class ReviewCreate(BaseModel):
    item_score: int = Field(ge=0, le=5)
    owner_score: Optional[int] = Field(default=None, ge=0, le=5)
    item_comment: Optional[str] = Field(default=None, max_length=2000)
    owner_comment: Optional[str] = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    id: int
    reservation_id: int
    listing_id: int
    borrower_id: int
    owner_id: int
    item_score: int
    owner_score: Optional[int] = None
    item_comment: Optional[str] = None
    owner_comment: Optional[str] = None
    reviewer: Optional[ReviewerOut] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# the listing that is reviewed
class ReviewListingContextOut(BaseModel):
    id: int
    name: str
    description: str
    image_url: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
    owner_name: Optional[str] = None


class UserReviewOut(ReviewOut):
    listing: Optional[ReviewListingContextOut] = None


# contains the listing being reviewed and the ful review situation
# decides whether a user is able to review the listing
class ReviewReservationContextOut(BaseModel):
    reservation_id: int
    listing: ReviewListingContextOut
    status: ReservationStatus
    existing_review: Optional[ReviewOut] = None
