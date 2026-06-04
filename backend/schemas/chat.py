from pydantic import BaseModel, field_serializer
from datetime import date, datetime, timezone
from typing import Optional

from backend.enums.ListingStatus import ListingStatus
from backend.enums.ReservationStatus import ReservationStatus

class MessageCreate(BaseModel):
    content: str

class MessageUpdate(BaseModel):
    content: str

class ReservationCreate(BaseModel):
    start_date: date
    end_date: date

class ReservationOut(BaseModel):
    id: int
    listing_id: int
    room_id: int
    borrower_id: int
    lender_id: int
    start_date: date
    end_date: date
    status: ReservationStatus
    borrower_calendar_added: bool = False
    lender_calendar_added: bool = False

    class Config:
        from_attributes = True

class BlockedDateRangeOut(BaseModel):
    start_date: date
    end_date: date
    status: str

class OtherUserOut(BaseModel):
    id: int
    name: str
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True

class ChatReservationContextOut(BaseModel):
    room_id: int
    listing_id: int
    listing_name: str
    lender_id: int
    borrower_id: int
    current_user_role: str
    other_user: OtherUserOut
    listing_status: ListingStatus
    listing_due_date: Optional[date] = None
    current_reservation: Optional[ReservationOut] = None
    blocked_ranges: list[BlockedDateRangeOut] = []

class MessageOut(BaseModel):
    id: int
    room_id: int
    sender_id: int
    content: str
    created_at: datetime
    is_read: bool = False
    is_system: bool = False

    class Config:
        from_attributes = True

    @field_serializer("created_at")
    def serialize_created_at(self, created_at: datetime):
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

class ChatRoomOut(BaseModel):
    id: int
    listing_id: int
    lender_id: int
    borrower_id: int
    lender_hidden: bool = False
    borrower_hidden: bool = False

    class Config:
        from_attributes = True

class ChatRoomSummaryOut(BaseModel):
    room_id: int
    listing_name: str
    other_user: OtherUserOut
    latest_message: MessageOut | None = None
    unread_count: int = 0

    class Config:
        from_attributes = True
