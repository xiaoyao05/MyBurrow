from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime
import json

from backend.db.database import get_db
from backend.enums.ListingStatus import ListingStatus
from backend.enums.ReservationStatus import ReservationStatus
from backend.models.chat_room import ChatRoom
from backend.models.listing_unavailable_range import ListingUnavailableRange
from backend.models.listings import Listings
from backend.models.message import Message
from backend.models.reservation import Reservation
from backend.models.users import Users
from backend.schemas.chat import (
    BlockedDateRangeOut,
    ChatReservationContextOut,
    MessageCreate,
    MessageUpdate,
    MessageOut,
    ChatRoomSummaryOut,
    OtherUserOut,
    ChatRoomOut,
    ReservationCreate,
    ReservationOut,
)
from backend.routers.auth import get_current_user, get_user_from_token

router = APIRouter(
    prefix="/chat",
    tags=["Chat"]
)

# room_id -> list of (user_id, websocket)
active_connections = {}


def check_room_access(room: ChatRoom, user_id: int):
    return user_id == room.lender_id or user_id == room.borrower_id


def get_user_clear_cutoff(room: ChatRoom, user_id: int):
    if user_id == room.lender_id:
        return room.lender_cleared_at
    if user_id == room.borrower_id:
        return room.borrower_cleared_at
    return None


def visible_message_filters(room: ChatRoom, user_id: int):
    filters = [Message.room_id == room.id]
    clear_cutoff = get_user_clear_cutoff(room, user_id)

    if clear_cutoff:
        filters.append(Message.created_at > clear_cutoff)

    return filters


def restore_chat_visibility(room: ChatRoom):
    room.lender_hidden = False
    room.borrower_hidden = False


ACTIVE_RESERVATION_STATUSES = (
    ReservationStatus.PENDING,
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED
)
APPROVED_RESERVATION_STATUSES = (
    ReservationStatus.APPROVED,
    ReservationStatus.BORROWED
)
RESERVATION_CANCEL_STATUSES = (
    ReservationStatus.PENDING,
    ReservationStatus.APPROVED
)


async def broadcast_room_message(room_id: int, message: Message):
    message_data = {
        "id": message.id,
        "room_id": message.room_id,
        "sender_id": message.sender_id,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
        "is_read": message.is_read,
        "is_system": message.is_system
    }

    for _, connection in active_connections.get(room_id, []):
        await connection.send_json(message_data)


async def broadcast_room_event(room_id: int, event: dict):
    for _, connection in active_connections.get(room_id, []):
        await connection.send_json(event)


async def create_chat_message(
    db: AsyncSession,
    room: ChatRoom,
    sender_id: int,
    content: str,
    is_system: bool = False
):
    new_activity_cutoff = datetime.utcnow()

    if room.lender_hidden:
        room.lender_cleared_at = new_activity_cutoff
    if room.borrower_hidden:
        room.borrower_cleared_at = new_activity_cutoff
    restore_chat_visibility(room)

    room_user_ids = {room.lender_id, room.borrower_id}
    recipient_ids = room_user_ids - {sender_id}
    connected_user_ids = {
        connected_user_id
        for connected_user_id, _ in active_connections.get(room.id, [])
    }

    message = Message(
        room_id=room.id,
        sender_id=sender_id,
        content=content,
        is_read=bool(recipient_ids & connected_user_ids),
        is_system=is_system
    )

    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def get_room_for_user(db: AsyncSession, room_id: int, user_id: int):
    room_result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = room_result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    if not check_room_access(room, user_id):
        raise HTTPException(status_code=403, detail="Not allowed")

    return room


async def get_listing_for_room(db: AsyncSession, room: ChatRoom):
    listing_result = await db.execute(
        select(Listings).where(Listings.id == room.listing_id)
    )
    listing = listing_result.scalar_one_or_none()

    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    return listing


async def get_current_reservation(db: AsyncSession, room_id: int):
    result = await db.execute(
        select(Reservation)
        .where(
            Reservation.room_id == room_id,
            Reservation.status.in_(ACTIVE_RESERVATION_STATUSES)
        )
        .order_by(Reservation.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_listing_status_from_future_reservations(
    db: AsyncSession,
    listing: Listings,
    excluded_reservation_id: int | None = None
):
    current_unavailable_range = await get_current_unavailable_range(db, listing.id)

    if current_unavailable_range:
        listing.status = ListingStatus.UNAVAILABLE
        listing.due_date = current_unavailable_range.end_date
        return

    filters = [
        Reservation.listing_id == listing.id,
        Reservation.status.in_(APPROVED_RESERVATION_STATUSES),
        Reservation.end_date >= date.today()
    ]

    if excluded_reservation_id is not None:
        filters.append(Reservation.id != excluded_reservation_id)

    future_result = await db.execute(
        select(Reservation)
        .where(*filters)
        .order_by(Reservation.start_date.asc(), Reservation.id.asc())
        .limit(1)
    )
    future_reservation = future_result.scalar_one_or_none()

    if future_reservation:
        listing.status = (
            ListingStatus.UNAVAILABLE
            if future_reservation.status == ReservationStatus.BORROWED
            else ListingStatus.RESERVED
        )
        listing.due_date = future_reservation.end_date
    else:
        listing.status = ListingStatus.AVAILABLE
        listing.due_date = None


async def get_blocked_ranges(db: AsyncSession, listing_id: int):
    reservation_result = await db.execute(
        select(Reservation)
        .where(
            Reservation.listing_id == listing_id,
            Reservation.status.in_(ACTIVE_RESERVATION_STATUSES)
        )
    )

    blocked_ranges = [
        BlockedDateRangeOut(
            start_date=reservation.start_date,
            end_date=reservation.end_date,
            status=reservation.status
        )
        for reservation in reservation_result.scalars().all()
    ]

    unavailable_result = await db.execute(
        select(ListingUnavailableRange).where(
            ListingUnavailableRange.listing_id == listing_id
        )
    )

    blocked_ranges.extend(
        BlockedDateRangeOut(
            start_date=unavailable_range.start_date,
            end_date=unavailable_range.end_date,
            status="unavailable"
        )
        for unavailable_range in unavailable_result.scalars().all()
    )

    return blocked_ranges


async def get_current_unavailable_range(db: AsyncSession, listing_id: int):
    today = date.today()
    result = await db.execute(
        select(ListingUnavailableRange)
        .where(
            ListingUnavailableRange.listing_id == listing_id,
            ListingUnavailableRange.start_date <= today,
            ListingUnavailableRange.end_date >= today
        )
        .order_by(ListingUnavailableRange.end_date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/listings/{listing_id}", response_model=ChatRoomOut)
async def get_or_create_listing_chat(
    listing_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    listing_result = await db.execute(
        select(Listings).where(Listings.id == listing_id)
    )
    listing = listing_result.scalar_one_or_none()

    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if listing.owner_id == user:
        raise HTTPException(
            status_code=400,
            detail="You cannot start a chat with yourself"
        )

    existing_room_result = await db.execute(
        select(ChatRoom).where(
            ChatRoom.listing_id == listing_id,
            ChatRoom.lender_id == listing.owner_id,
            ChatRoom.borrower_id == user
        )
    )
    existing_room = existing_room_result.scalar_one_or_none()

    if existing_room:
        reopen_cutoff = datetime.utcnow()

        if existing_room.lender_hidden:
            existing_room.lender_cleared_at = reopen_cutoff
        if existing_room.borrower_hidden:
            existing_room.borrower_cleared_at = reopen_cutoff

        restore_chat_visibility(existing_room)
        await db.commit()
        await db.refresh(existing_room)
        return existing_room

    room = ChatRoom(
        listing_id=listing_id,
        lender_id=listing.owner_id,
        borrower_id=user
    )

    db.add(room)
    await db.commit()
    await db.refresh(room)

    return room


@router.get("/unread/messages", response_model=list[MessageOut])
async def get_unread_messages(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    result = await db.execute(
        select(Message)
        .join(ChatRoom, Message.room_id == ChatRoom.id)
        .where(
            or_(ChatRoom.lender_id == user, ChatRoom.borrower_id == user),
            Message.sender_id != user,
            Message.is_read == False,
            or_(
                (
                    (ChatRoom.lender_id == user) &
                    (ChatRoom.lender_hidden == False) &
                    (
                        (ChatRoom.lender_cleared_at == None) |
                        (Message.created_at > ChatRoom.lender_cleared_at)
                    )
                ),
                (
                    (ChatRoom.borrower_id == user) &
                    (ChatRoom.borrower_hidden == False) &
                    (
                        (ChatRoom.borrower_cleared_at == None) |
                        (Message.created_at > ChatRoom.borrower_cleared_at)
                    )
                )
            )
        )
        .order_by(Message.created_at.desc())
    )

    return result.scalars().all()


@router.get("/chats", response_model=list[ChatRoomSummaryOut])
async def get_chat_rooms(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    result = await db.execute(
        select(ChatRoom)
        .where(
            or_(
                (ChatRoom.lender_id == user) & (ChatRoom.lender_hidden == False),
                (ChatRoom.borrower_id == user) & (ChatRoom.borrower_hidden == False)
            )
        )
    )
    rooms = result.scalars().all()

    room_summaries = []
    for room in rooms:
        other_user_id = room.lender_id if room.lender_id != user else room.borrower_id
        listing = await get_listing_for_room(db, room)

        other_user_result = await db.execute(
            select(Users).where(Users.id == other_user_id)
        )
        other_user = other_user_result.scalar_one_or_none()
        if not other_user:
            continue

        latest_message_result = await db.execute(
            select(Message)
            .where(*visible_message_filters(room, user))
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        latest_message = latest_message_result.scalar_one_or_none()

        unread_count_result = await db.execute(
            select(func.count(Message.id))
            .where(
                *visible_message_filters(room, user),
                Message.sender_id != user,
                Message.is_read == False
            )
        )

        room_summaries.append(
            ChatRoomSummaryOut(
                room_id=room.id,
                listing_name=listing.name,
                other_user=OtherUserOut(
                    id=other_user.id,
                    name=other_user.name,
                    profile_picture=other_user.profile_picture
                ),
                latest_message=latest_message,
                unread_count=unread_count_result.scalar_one()
            )
        )

    return room_summaries


@router.delete("/{room_id}", status_code=204)
async def delete_chat_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)
    clear_cutoff = datetime.utcnow()

    if user == room.lender_id:
        room.lender_hidden = True
        room.lender_cleared_at = clear_cutoff
    else:
        room.borrower_hidden = True
        room.borrower_cleared_at = clear_cutoff

    await db.commit()


@router.get("/{room_id}/messages", response_model=list[MessageOut])
async def get_messages(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room_result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = room_result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    if not check_room_access(room, user):
        raise HTTPException(status_code=403, detail="Not allowed")

    unread_result = await db.execute(
        select(Message)
        .where(
            *visible_message_filters(room, user),
            Message.sender_id != user,
            Message.is_read == False
        )
    )
    unread_messages = unread_result.scalars().all()

    for message in unread_messages:
        message.is_read = True

    if unread_messages:
        read_message_ids = [message.id for message in unread_messages]
        await db.commit()
        await broadcast_room_event(
            room_id,
            {
                "type": "messages_read",
                "message_ids": read_message_ids,
                "reader_id": user
            }
        )

    messages_result = await db.execute(
        select(Message)
        .where(*visible_message_filters(room, user))
        .order_by(Message.created_at.asc())
    )

    return messages_result.scalars().all()


@router.post("/{room_id}/messages", response_model=MessageOut)
async def create_message(
    room_id: int,
    message_data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)
    trimmed_content = message_data.content.strip()

    if not trimmed_content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message = await create_chat_message(
        db,
        room,
        user,
        trimmed_content
    )
    await db.commit()
    await db.refresh(message)
    await broadcast_room_message(room_id, message)

    return message


@router.patch("/{room_id}/messages/{message_id}", response_model=MessageOut)
async def update_message(
    room_id: int,
    message_id: int,
    message_data: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    await get_room_for_user(db, room_id, user)
    trimmed_content = message_data.content.strip()

    if not trimmed_content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message_result = await db.execute(
        select(Message).where(Message.id == message_id, Message.room_id == room_id)
    )
    message = message_result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user:
        raise HTTPException(status_code=403, detail="Only the sender can edit this message")

    if message.is_system:
        raise HTTPException(status_code=403, detail="Pre-created messages cannot be edited")

    message.content = trimmed_content
    await db.commit()
    await db.refresh(message)
    await broadcast_room_event(
        room_id,
        {
            "type": "message_updated",
            "message": {
                "id": message.id,
                "room_id": message.room_id,
                "sender_id": message.sender_id,
                "content": message.content,
                "created_at": message.created_at.isoformat(),
                "is_read": message.is_read,
                "is_system": message.is_system
            }
        }
    )

    return message


@router.delete("/{room_id}/messages/{message_id}", status_code=204)
async def delete_message(
    room_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    await get_room_for_user(db, room_id, user)
    message_result = await db.execute(
        select(Message).where(Message.id == message_id, Message.room_id == room_id)
    )
    message = message_result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user:
        raise HTTPException(status_code=403, detail="Only the sender can delete this message for everyone")

    if message.is_system:
        raise HTTPException(status_code=403, detail="Pre-created messages cannot be deleted")

    await db.delete(message)
    await db.commit()
    await broadcast_room_event(
        room_id,
        {
            "type": "message_deleted",
            "message_id": message_id
        }
    )


@router.get("/{room_id}/reservation", response_model=ChatReservationContextOut)
async def get_reservation_context(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)
    listing = await get_listing_for_room(db, room)
    other_user_id = room.lender_id if room.lender_id != user else room.borrower_id
    other_user_result = await db.execute(select(Users).where(Users.id == other_user_id))
    other_user = other_user_result.scalar_one_or_none()

    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")

    current_reservation = await get_current_reservation(db, room_id)
    blocked_ranges = await get_blocked_ranges(db, listing.id)
    unavailable_range = await get_current_unavailable_range(db, listing.id)
    listing_status = (
        ListingStatus.UNAVAILABLE
        if unavailable_range
        else listing.status
    )
    listing_due_date = unavailable_range.end_date if unavailable_range else listing.due_date

    return ChatReservationContextOut(
        room_id=room.id,
        listing_id=room.listing_id,
        listing_name=listing.name,
        lender_id=room.lender_id,
        borrower_id=room.borrower_id,
        current_user_role="owner" if user == room.lender_id else "borrower",
        other_user=OtherUserOut(
            id=other_user.id,
            name=other_user.name,
            profile_picture=other_user.profile_picture
        ),
        listing_status=listing_status,
        listing_due_date=listing_due_date,
        current_reservation=current_reservation,
        blocked_ranges=blocked_ranges
    )


@router.post("/{room_id}/reservations", response_model=ReservationOut)
async def request_reservation(
    room_id: int,
    reservation_data: ReservationCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)

    if user != room.borrower_id:
        raise HTTPException(status_code=403, detail="Only the borrower can reserve")

    if reservation_data.end_date < reservation_data.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    listing = await get_listing_for_room(db, room)

    overlapping_result = await db.execute(
        select(Reservation).where(
            Reservation.listing_id == listing.id,
            Reservation.status.in_(APPROVED_RESERVATION_STATUSES),
            Reservation.start_date <= reservation_data.end_date,
            Reservation.end_date >= reservation_data.start_date
        )
    )

    if overlapping_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="These dates are already reserved")

    unavailable_result = await db.execute(
        select(ListingUnavailableRange.id)
        .where(
            ListingUnavailableRange.listing_id == listing.id,
            ListingUnavailableRange.start_date <= reservation_data.end_date,
            ListingUnavailableRange.end_date >= reservation_data.start_date
        )
        .limit(1)
    )

    if unavailable_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Listing is unavailable for those dates")

    reservation = Reservation(
        listing_id=listing.id,
        room_id=room.id,
        borrower_id=room.borrower_id,
        lender_id=room.lender_id,
        start_date=reservation_data.start_date,
        end_date=reservation_data.end_date,
        status=ReservationStatus.PENDING
    )
    db.add(reservation)
    message = await create_chat_message(
        db,
        room,
        room.borrower_id,
        (
            "Reservation request: "
            f"{reservation_data.start_date.isoformat()} to "
            f"{reservation_data.end_date.isoformat()}. "
            "Waiting for owner approval."
        ),
        is_system=True
    )

    await db.commit()
    await db.refresh(reservation)
    await db.refresh(message)
    await broadcast_room_message(room.id, message)

    return reservation


@router.post("/{room_id}/reservations/{reservation_id}/approve", response_model=ReservationOut)
async def approve_reservation(
    room_id: int,
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)

    if user != room.lender_id:
        raise HTTPException(status_code=403, detail="Only the owner can approve")

    reservation_result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.room_id == room.id
        )
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status != ReservationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Reservation cannot be approved")

    listing = await get_listing_for_room(db, room)
    reservation.status = ReservationStatus.APPROVED
    listing.status = ListingStatus.RESERVED
    listing.due_date = reservation.end_date

    message = await create_chat_message(
        db,
        room,
        room.lender_id,
        (
            "Reservation approved: "
            f"{reservation.start_date.isoformat()} to "
            f"{reservation.end_date.isoformat()}."
        ),
        is_system=True
    )

    await db.commit()
    await db.refresh(reservation)
    await db.refresh(message)
    await broadcast_room_message(room.id, message)

    return reservation


@router.post("/{room_id}/reservations/{reservation_id}/cancel", response_model=ReservationOut)
async def cancel_reservation(
    room_id: int,
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)

    if user not in (room.lender_id, room.borrower_id):
        raise HTTPException(status_code=403, detail="Only chat participants can cancel")

    reservation_result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.room_id == room.id
        )
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status not in RESERVATION_CANCEL_STATUSES:
        raise HTTPException(status_code=400, detail="Reservation cannot be cancelled")

    listing = await get_listing_for_room(db, room)
    reservation.status = ReservationStatus.CANCELLED
    await set_listing_status_from_future_reservations(
        db,
        listing,
        excluded_reservation_id=reservation.id
    )

    message = await create_chat_message(
        db,
        room,
        user,
        (
            "Reservation cancelled by the owner."
            if user == room.lender_id
            else "Reservation request cancelled by the borrower."
        ),
        is_system=True
    )

    await db.commit()
    await db.refresh(reservation)
    await db.refresh(message)
    await broadcast_room_message(room.id, message)

    return reservation


@router.post("/{room_id}/reservations/{reservation_id}/confirm-borrow", response_model=ReservationOut)
async def confirm_borrow(
    room_id: int,
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)

    if user != room.lender_id:
        raise HTTPException(status_code=403, detail="Only the owner can confirm handover")

    reservation_result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.room_id == room.id
        )
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status not in (
        ReservationStatus.PENDING,
        ReservationStatus.APPROVED
    ):
        raise HTTPException(status_code=400, detail="Reservation cannot be borrowed")

    listing = await get_listing_for_room(db, room)
    reservation.status = ReservationStatus.BORROWED
    listing.status = ListingStatus.UNAVAILABLE
    listing.due_date = reservation.end_date

    message = await create_chat_message(
        db,
        room,
        room.lender_id,
        (
            "Borrow confirmed. The listing is now unavailable until "
            f"{reservation.end_date.isoformat()}."
        ),
        is_system=True
    )

    await db.commit()
    await db.refresh(reservation)
    await db.refresh(message)
    await broadcast_room_message(room.id, message)

    return reservation


@router.post("/{room_id}/reservations/{reservation_id}/confirm-return", response_model=ReservationOut)
async def confirm_return(
    room_id: int,
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    room = await get_room_for_user(db, room_id, user)

    if user != room.lender_id:
        raise HTTPException(status_code=403, detail="Only the owner can confirm return")

    reservation_result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.room_id == room.id
        )
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status != ReservationStatus.BORROWED:
        raise HTTPException(status_code=400, detail="Only borrowed reservations can be returned")

    listing = await get_listing_for_room(db, room)
    reservation.status = ReservationStatus.RETURNED
    await set_listing_status_from_future_reservations(
        db,
        listing,
        excluded_reservation_id=reservation.id
    )

    message = await create_chat_message(
        db,
        room,
        room.lender_id,
        (
            "Return confirmed. The listing availability has been updated. "
            f"Rate this item here: /reviews/reservations/{reservation.id}"
        ),
        is_system=True
    )

    await db.commit()
    await db.refresh(reservation)
    await db.refresh(message)
    await broadcast_room_message(room.id, message)

    return reservation


# backend recieves new websocket connection
# gets user from token, checks if user is part of the room, if not close connection
# after connection is accepted, listen for new messages from client, creates message rows, commit and run broadcast_room_message
@router.websocket("/ws/{room_id}")
async def chat_websocket(
    websocket: WebSocket,
    room_id: int,
    token: str,
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_from_token(token, db)

    if not user:
        await websocket.close(code=1008)
        return

    room_result = await db.execute(select(ChatRoom).where(ChatRoom.id == room_id))
    room = room_result.scalar_one_or_none()

    if not room:
        await websocket.close(code=1008)
        return

    if not check_room_access(room, user.id):
        await websocket.close(code=1008)
        return

    await websocket.accept()

    active_connections.setdefault(room_id, [])
    active_connections[room_id].append((user.id, websocket))

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            payload = MessageCreate(**data)

            new_message = await create_chat_message(
                db,
                room,
                user.id,
                payload.content
            )
            await db.commit()
            await db.refresh(new_message)
            await broadcast_room_message(room_id, new_message)

    except WebSocketDisconnect:
        active_connections[room_id] = [
            connection
            for connection in active_connections.get(room_id, [])
            if connection[1] is not websocket
        ]
