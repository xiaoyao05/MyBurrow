from pydantic import BaseModel
from datetime import date, datetime
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
