from datetime import date

from pydantic import BaseModel
from typing import Optional

from backend.enums.ReservationStatus import ReservationStatus
from backend.schemas.ListingCreate import ListingOut


class ActivityOut(BaseModel):
    id: int
    listing_id: int
    room_id: int
    start_date: date
    end_date: date
    status: ReservationStatus
    listing: ListingOut
    counterparty_name: Optional[str] = None
    calendar_added: bool = False

    model_config = {"from_attributes": True}
