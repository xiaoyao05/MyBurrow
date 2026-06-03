from pydantic import BaseModel, Field
from datetime import date
from typing import Optional
from backend.enums.ListingStatus import ListingStatus
from backend.enums.Categories import Categories

class ListingCreate(BaseModel):
    category: Categories
    name: str
    description: str
    location: str
    status: ListingStatus = ListingStatus.AVAILABLE
    image_url: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
    due_date: Optional[date] = None

class ListingAvailabilityUpdate(BaseModel):
    status: ListingStatus
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None

class OwnerOut(BaseModel):
    name: str

    model_config = {"from_attributes": True}

class ListingOut(BaseModel):
    id: int
    name: str
    description: str
    category: Optional[Categories] = None
    location: Optional[str] = None
    status: Optional[ListingStatus] = None
    due_date: Optional[date] = None
    unavailable_start_date: Optional[date] = None
    unavailable_end_date: Optional[date] = None
    expected_borrow_start_date: Optional[date] = None
    expected_borrow_end_date: Optional[date] = None
    image_url: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
    owner: Optional[OwnerOut] = None
    rating_average: Optional[float] = None
    rating_count: int = 0

    model_config = {"from_attributes": True}
