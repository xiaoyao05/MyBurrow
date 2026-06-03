from sqlalchemy import Boolean, Column, Integer, String, Text
from sqlalchemy.orm import relationship
from backend.db.database import Base

class Users(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    contact_number = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    profile_picture = Column(Text, nullable=True)
    auth_provider = Column(String, nullable=False, default="local")
    google_id = Column(String, unique=True, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    listings = relationship("Listings", back_populates="owner")
