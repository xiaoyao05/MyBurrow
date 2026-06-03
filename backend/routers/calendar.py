import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.google_calendar_token import GoogleCalendarToken
from backend.models.listings import Listings
from backend.models.reservation import Reservation
from backend.models.users import Users
from backend.routers.auth import get_current_user


router = APIRouter(
    prefix="/calendar",
    tags=["calendar"]
)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_CALENDAR_REDIRECT_URI = os.getenv(
    "GOOGLE_CALENDAR_REDIRECT_URI",
    "http://localhost:8000/api/calendar/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
CONNECT_SCOPES = f"openid email profile {CALENDAR_SCOPE}"


class CalendarConnectRequest(BaseModel):
    return_path: str = "/myactivity"


def sanitize_return_path(return_path: str):
    if not return_path or not return_path.startswith("/") or return_path.startswith("//"):
        return "/myactivity"
    return return_path


def create_calendar_state(user_id: int, nonce: str, return_path: str):
    payload = {
        "sub": str(user_id),
        "nonce": nonce,
        "purpose": "google_calendar_connect",
        "return_path": sanitize_return_path(return_path),
        "exp": datetime.utcnow() + timedelta(minutes=10)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_calendar_state(state: str, expected_nonce: str):
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Google Calendar connection request"
        )

    if (
        payload.get("purpose") != "google_calendar_connect"
        or payload.get("nonce") != expected_nonce
        or not payload.get("sub")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Google Calendar connection request"
        )

    return {
        "user_id": int(payload["sub"]),
        "return_path": sanitize_return_path(payload.get("return_path", "/myactivity"))
    }


async def refresh_google_access_token(refresh_token: str):
    # backend talks to google, if successful, access token (short-lived) is returned
    # access token is used to call the google api
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Calendar needs to be connected again"
        )

    access_token = response.json().get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Calendar needs to be connected again"
        )

    return access_token

# send google to ask for permission
@router.post("/connect-url")
async def get_calendar_connect_url(
    connect_request: CalendarConnectRequest | None = None,
    current_user_id: int = Depends(get_current_user)
):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Google Calendar is not configured"
        )

    nonce = secrets.token_urlsafe(32)
    return_path = (
        connect_request.return_path
        if connect_request
        else "/myactivity"
    )
    # temp state token that tells which user is connecting and the return path
    state = create_calendar_state(current_user_id, nonce, return_path)

    # identify yourself and sends authorisation code request to google
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "scope": CONNECT_SCOPES,
        "state": state,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent select_account"
    }
    
    # google permission screen url
    response = JSONResponse({
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(params)
    })

    # save the random nonce in the browser cookie for 10 minutes
    response.set_cookie(
        key="google_calendar_oauth_nonce",
        value=nonce,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600
    )
    return response


@router.get("/callback")
async def google_calendar_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(
            f"{FRONTEND_URL}/myactivity#"
            + urlencode({"calendar_error": f"Google Calendar connection failed: {error}"})
        )

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    nonce = request.cookies.get("google_calendar_oauth_nonce")

    if not code or not state or not nonce:
        raise HTTPException(
            status_code=400,
            detail="Invalid Google Calendar connection request"
        )

    state_payload = decode_calendar_state(state, nonce)
    current_user_id = state_payload["user_id"]
    return_path = state_payload["return_path"]

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Google Calendar is not configured"
        )

    async with httpx.AsyncClient() as client:
        # get tokens for authentication
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_CALENDAR_REDIRECT_URI,
                "grant_type": "authorization_code"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Could not connect Google Calendar"
            )
        
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        scope = token_data.get("scope")

         # get user profile
        userinfo_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )

    google_email = None
    if userinfo_response.status_code == 200:
        google_email = userinfo_response.json().get("email")

    result = await db.execute(
        select(GoogleCalendarToken).where(
            GoogleCalendarToken.user_id == current_user_id
        )
    )
    calendar_token = result.scalar_one_or_none()

    if not refresh_token and not calendar_token:
        return RedirectResponse(
            f"{FRONTEND_URL}{return_path}#"
            + urlencode({
                "calendar_error": "Google did not return Calendar access. Try connecting again."
            })
        )

    if calendar_token:
        if refresh_token:
            calendar_token.refresh_token = refresh_token
        calendar_token.scope = scope or calendar_token.scope
        calendar_token.google_email = google_email or calendar_token.google_email
    else:
        calendar_token = GoogleCalendarToken(
            user_id=current_user_id,
            refresh_token=refresh_token,
            scope=scope,
            google_email=google_email
        )

    db.add(calendar_token)
    await db.commit()

    response = RedirectResponse(
        f"{FRONTEND_URL}{return_path}#"
        + urlencode({"calendar_connected": "true"})
    )
    response.delete_cookie("google_calendar_oauth_nonce")
    return response


@router.get("/status")
async def get_calendar_status(
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user)
):
    result = await db.execute(
        select(GoogleCalendarToken).where(
            GoogleCalendarToken.user_id == current_user_id
        )
    )
    calendar_token = result.scalar_one_or_none()

    return {
        "connected": calendar_token is not None,
        "google_email": calendar_token.google_email if calendar_token else None
    }


@router.post("/reservations/{reservation_id}/event")
async def create_reservation_calendar_event(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user)
):
    token_result = await db.execute(
        select(GoogleCalendarToken).where(
            GoogleCalendarToken.user_id == current_user_id
        )
    )
    calendar_token = token_result.scalar_one_or_none()

    if not calendar_token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Google Calendar is not connected"
        )

    reservation_result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    reservation = reservation_result.scalar_one_or_none()

    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if current_user_id not in (reservation.borrower_id, reservation.lender_id):
        raise HTTPException(status_code=403, detail="Not allowed")

    if (
        current_user_id == reservation.borrower_id
        and reservation.borrower_calendar_added
    ) or (
        current_user_id == reservation.lender_id
        and reservation.lender_calendar_added
    ):
        return {
            "message": "Reservation already added to Google Calendar",
            "events": [],
            "calendar_added": True
        }

    listing_result = await db.execute(
        select(Listings).where(Listings.id == reservation.listing_id)
    )
    listing = listing_result.scalar_one_or_none()

    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    lender_result = await db.execute(
        select(Users).where(Users.id == reservation.lender_id)
    )
    lender = lender_result.scalar_one_or_none()

    borrower_result = await db.execute(
        select(Users).where(Users.id == reservation.borrower_id)
    )
    borrower = borrower_result.scalar_one_or_none()

    access_token = await refresh_google_access_token(calendar_token.refresh_token)
    owner_name = lender.name if lender else "the owner"
    borrower_name = borrower.name if borrower else "the borrower"

    if current_user_id == reservation.borrower_id:
        event_specs = [
            {
                "summary": f"Collect {listing.name} from {owner_name}",
                "date": reservation.start_date,
                "description": (
                    f"MyBurrow reservation #{reservation.id}. "
                    f"Collect {listing.name} from {owner_name}."
                )
            },
            {
                "summary": f"Return {listing.name} to {owner_name}",
                "date": reservation.end_date,
                "description": (
                    f"MyBurrow reservation #{reservation.id}. "
                    f"Return {listing.name} to {owner_name}."
                )
            }
        ]
    else:
        event_specs = [
            {
                "summary": f"Handover {listing.name} to {borrower_name}",
                "date": reservation.start_date,
                "description": (
                    f"MyBurrow reservation #{reservation.id}. "
                    f"Handover {listing.name} to {borrower_name}."
                )
            },
            {
                "summary": f"Collect returned {listing.name} from {borrower_name}",
                "date": reservation.end_date,
                "description": (
                    f"MyBurrow reservation #{reservation.id}. "
                    f"Collect returned {listing.name} from {borrower_name}."
                )
            }
        ]

    created_events = []
    async with httpx.AsyncClient() as client:
        for spec in event_specs:
            event_date = spec["date"]
            event = {
                "summary": spec["summary"],
                "description": spec["description"],
                "start": {"date": event_date.isoformat()},
                "end": {"date": (event_date + timedelta(days=1)).isoformat()}
            }

            calendar_response = await client.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                json=event,
                headers={"Authorization": f"Bearer {access_token}"}
            )

            if calendar_response.status_code not in (200, 201):
                raise HTTPException(
                    status_code=400,
                    detail="Could not create Google Calendar event"
                )

            created_events.append(calendar_response.json())

    if current_user_id == reservation.borrower_id:
        reservation.borrower_calendar_added = True
    else:
        reservation.lender_calendar_added = True

    await db.commit()

    return {
        "message": "Google Calendar events created",
        "calendar_added": True,
        "events": [
            {
                "event_id": event.get("id"),
                "html_link": event.get("htmlLink"),
                "summary": event.get("summary")
            }
            for event in created_events
        ]
    }
