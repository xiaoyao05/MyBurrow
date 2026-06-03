from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer

from backend.mcp_tools import (
    check_listing_availability,
    get_chat_context,
    get_listing_context,
    get_reservation_context,
    get_review_context,
)
from backend.routers.auth import get_current_user


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

router = APIRouter(
    prefix="/mcp-context",
    tags=["mcp-context"],
)


@router.get("/listings/{listing_id}")
async def read_listing_context(
    listing_id: int,
    token: str = Depends(oauth2_scheme),
    _current_user_id: int = Depends(get_current_user),
):
    return await get_listing_context(token, listing_id)


@router.get("/chat/{room_id}")
async def read_chat_context(
    room_id: int,
    limit: int = 8,
    token: str = Depends(oauth2_scheme),
    _current_user_id: int = Depends(get_current_user),
):
    return await get_chat_context(token, room_id, limit)


@router.get("/chat/{room_id}/reservation")
async def read_reservation_context(
    room_id: int,
    token: str = Depends(oauth2_scheme),
    _current_user_id: int = Depends(get_current_user),
):
    return await get_reservation_context(token, room_id)


@router.get("/listings/{listing_id}/availability")
async def read_listing_availability(
    listing_id: int,
    start_date: str,
    end_date: str,
    token: str = Depends(oauth2_scheme),
    _current_user_id: int = Depends(get_current_user),
):
    return await check_listing_availability(token, listing_id, start_date, end_date)


@router.get("/reviews/reservations/{reservation_id}")
async def read_review_context(
    reservation_id: int,
    token: str = Depends(oauth2_scheme),
    _current_user_id: int = Depends(get_current_user),
):
    return await get_review_context(token, reservation_id)
