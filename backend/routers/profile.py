from pydantic import BaseModel
from ..db.database import get_db
from ..models.users import Users
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, APIRouter, File, UploadFile
from fastapi import HTTPException
import os
import uuid
import supabase
from backend.routers.auth import get_current_user

BUCKET_NAME = "profile-picture"

supabase = supabase.create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

class UserProfile(BaseModel):
    name: str
    email: str
    contact_number: str | None = None
    bio: str | None = None
    profile_picture: str | None = None

router = APIRouter(
    prefix="/profile",
    tags=["profile"]
)

@router.get("/{user_id}", response_model=UserProfile)
async def read_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Users).where(Users.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

@router.put("/{user_id}", response_model=UserProfile)
async def update_user_profile(
    user_id: int,
    profile_data: UserProfile,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user)
):
    if user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile")

    result = await db.execute(
        select(Users).where(Users.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    email_result = await db.execute(
        select(Users).where(
            Users.email == profile_data.email,
            Users.id != user_id
        )
    )
    existing_email_user = email_result.scalar_one_or_none()

    if existing_email_user:
        raise HTTPException(
            status_code=400,
            detail="Email is already used by another account"
        )
    
    user.name = profile_data.name
    user.email = profile_data.email
    user.contact_number = profile_data.contact_number
    user.bio = profile_data.bio
    user.profile_picture = profile_data.profile_picture

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user

@router.post("/{user_id}/picture")
async def upload_profile_picture(
    user_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user)
):
    if user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user's profile picture")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    result = await db.execute(
        select(Users).where(Users.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    file_extension = file.filename.split(".")[-1]
    file_name = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"profiles/{user_id}/{file_name}"
    file_bytes = await file.read()

    supabase.storage.from_(BUCKET_NAME).upload(
        file_path,
        file_bytes,
        {"content-type": file.content_type}
    )

    public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)
    user.profile_picture = public_url

    db.add(user)
    await db.commit()

    return {"profile_picture": public_url}
