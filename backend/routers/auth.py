# register: hash password and store in database
# login: verify password, create jwt token and return to client
# protected route: verify jwt token, return user info and allow access
from passlib.context import CryptContext
from jose import jwt
import os
import secrets
from datetime import date, datetime, timedelta
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, or_, select
from ..schemas.UserLogin import UserLogin
from ..schemas.UserCreate import UserCreate
from ..models.chat_room import ChatRoom
from ..models.listing_unavailable_range import ListingUnavailableRange
from ..models.listings import Listings
from ..models.message import Message
from ..models.reservation import Reservation
from ..models.saved_listing import SavedListing
from ..models.users import Users
from ..enums.ListingStatus import ListingStatus
from ..enums.ReservationStatus import ReservationStatus
from ..db.database import get_db


router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/auth/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

@router.post("/login")
async def login(
    user_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):

    # database query
    result = await db.execute(
        select(Users).where(
            Users.email == user_data.email
        )
    )

    # convert sqlalchemy result to user object or None
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    if not user.hashed_password:
        raise HTTPException(
            status_code=401,
            detail="Please continue with Google for this account"
        )

    if not verify_password(
        user_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    # create jwt token with jwt payload containing user id (used for safe routing) and expiration time
    token = create_access_token({
        "sub": str(user.id)
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/google/login")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Google login is not configured"
        )

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account"
    }

    response = RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(params)
    )
    response.set_cookie(
        key="google_oauth_state",
        value=state,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600
    )
    return response

@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(
            f"{FRONTEND_URL}/login#"
            + urlencode({"error": f"Google login failed: {error}"})
        )

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    saved_state = request.cookies.get("google_oauth_state")

    if not code or not state or state != saved_state:
        raise HTTPException(
            status_code=400,
            detail="Invalid Google login request"
        )

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Google login is not configured"
        )

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Could not exchange Google authorization code"
            )

        access_token = token_response.json().get("access_token")
        userinfo_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Could not fetch Google profile"
            )

    google_profile = userinfo_response.json()
    google_id = google_profile.get("sub")
    email = google_profile.get("email")
    name = google_profile.get("name") or email
    picture = google_profile.get("picture")
    email_verified = bool(google_profile.get("email_verified"))

    if not google_id or not email:
        raise HTTPException(
            status_code=400,
            detail="Google account did not return the required profile data"
        )

    result = await db.execute(
        select(Users).where(
            or_(
                Users.google_id == google_id,
                Users.email == email
            )
        )
    )
    user = result.scalar_one_or_none()

    if user:
        user.google_id = user.google_id or google_id
        user.email_verified = email_verified
        if not user.profile_picture and picture:
            user.profile_picture = picture
    else:
        user = Users(
            email=email,
            hashed_password=None,
            name=name,
            contact_number=None,
            bio=None,
            profile_picture=picture,
            auth_provider="google",
            google_id=google_id,
            email_verified=email_verified
        )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({
        "sub": str(user.id)
    })
    profile_completed = bool(user.contact_number)
    fragment = urlencode({
        "token": token,
        "profile_completed": str(profile_completed).lower()
    })
    response = RedirectResponse(f"{FRONTEND_URL}/login#{fragment}")
    response.delete_cookie("google_oauth_state")
    return response

@router.post("/register")
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):

    # check if email already exists
    result = await db.execute(
        select(Users).where(
            Users.email == user_data.email
        )
    )

    existing_user = result.scalar_one_or_none()

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    # hash password
    hashed_password = hash_password(
        user_data.password
    )

    # create new user
    new_user = Users(
        email=user_data.email,
        hashed_password=hashed_password,
        name=user_data.name,
        contact_number=user_data.contact_number,
        bio=user_data.bio
    )

    # add to database
    db.add(new_user)

    await db.commit()

    await db.refresh(new_user)

    token = create_access_token({
        "sub": str(new_user.id)
    })

    return {
        "message": "User created successfully",
        "user_id": new_user.id,
        "access_token": token,
        "token_type": "bearer"
    }

# extract token from Authorization header, verify and decode token, return user id from token payload
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)

from fastapi import Depends, HTTPException, status
from jose import jwt, JWTError

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

        result = await db.execute(
            select(Users).where(Users.id == int(user_id))
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise credentials_exception

        return int(user_id)

    except JWTError:
        raise credentials_exception

# protected endpoint 
@router.get("/me")
async def me(
    user = Depends(get_current_user)
):
    return user


@router.delete("/me")
async def delete_account(
    current_user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_result = await db.execute(
        select(Users).where(Users.id == current_user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    owned_listing_result = await db.execute(
        select(Listings.id).where(Listings.owner_id == current_user_id)
    )
    owned_listing_ids = owned_listing_result.scalars().all()

    affected_listing_result = await db.execute(
        select(Reservation.listing_id)
        .where(
            or_(
                Reservation.borrower_id == current_user_id,
                Reservation.lender_id == current_user_id
            )
        )
    )
    affected_listing_ids = {
        listing_id
        for listing_id in affected_listing_result.scalars().all()
        if listing_id not in owned_listing_ids
    }

    room_filters = [
        ChatRoom.lender_id == current_user_id,
        ChatRoom.borrower_id == current_user_id
    ]

    if owned_listing_ids:
        room_filters.append(ChatRoom.listing_id.in_(owned_listing_ids))

    room_result = await db.execute(
        select(ChatRoom.id).where(
            or_(*room_filters)
        )
    )
    room_ids = room_result.scalars().all()

    if room_ids:
        await db.execute(delete(Message).where(Message.room_id.in_(room_ids)))
        await db.execute(delete(Reservation).where(Reservation.room_id.in_(room_ids)))
        await db.execute(delete(ChatRoom).where(ChatRoom.id.in_(room_ids)))

    await db.execute(delete(Message).where(Message.sender_id == current_user_id))
    await db.execute(delete(SavedListing).where(SavedListing.user_id == current_user_id))
    await db.execute(
        delete(Reservation).where(
            or_(
                Reservation.borrower_id == current_user_id,
                Reservation.lender_id == current_user_id
            )
        )
    )

    if owned_listing_ids:
        await db.execute(
            delete(SavedListing).where(
                SavedListing.listing_id.in_(owned_listing_ids)
            )
        )
        await db.execute(
            delete(ListingUnavailableRange).where(
                ListingUnavailableRange.listing_id.in_(owned_listing_ids)
            )
        )
        await db.execute(
            delete(Reservation).where(
                Reservation.listing_id.in_(owned_listing_ids)
            )
        )
        await db.execute(delete(Listings).where(Listings.id.in_(owned_listing_ids)))

    for listing_id in affected_listing_ids:
        listing_result = await db.execute(
            select(Listings).where(Listings.id == listing_id)
        )
        listing = listing_result.scalar_one_or_none()

        if not listing:
            continue

        unavailable_result = await db.execute(
            select(ListingUnavailableRange)
            .where(
                ListingUnavailableRange.listing_id == listing.id,
                ListingUnavailableRange.start_date <= date.today(),
                ListingUnavailableRange.end_date >= date.today()
            )
            .order_by(ListingUnavailableRange.end_date.desc())
            .limit(1)
        )
        unavailable_range = unavailable_result.scalar_one_or_none()

        if unavailable_range:
            listing.status = ListingStatus.UNAVAILABLE
            listing.due_date = unavailable_range.end_date
            continue

        reservation_result = await db.execute(
            select(Reservation)
            .where(
                Reservation.listing_id == listing.id,
                Reservation.status.in_((
                    ReservationStatus.APPROVED,
                    ReservationStatus.BORROWED
                )),
                Reservation.end_date >= date.today()
            )
            .order_by(Reservation.start_date.asc(), Reservation.id.asc())
            .limit(1)
        )
        reservation = reservation_result.scalar_one_or_none()

        if reservation:
            listing.status = (
                ListingStatus.UNAVAILABLE
                if reservation.status == ReservationStatus.BORROWED
                else ListingStatus.RESERVED
            )
            listing.due_date = reservation.end_date
        else:
            listing.status = ListingStatus.AVAILABLE
            listing.due_date = None

    await db.delete(user)
    await db.commit()

    return {"message": "Account deleted successfully"}

async def get_user_from_token(token: str, db: AsyncSession):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            return None

        result = await db.execute(
            select(Users).where(Users.id == int(user_id))
        )
        return result.scalar_one_or_none()

    except JWTError:
        return None
