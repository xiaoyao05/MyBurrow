from sqlalchemy import Boolean, Column, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from backend.db.database import Base

class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id = Column(Integer, primary_key=True, index=True)

    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False)

    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lender_hidden = Column(Boolean, nullable=False, default=False)
    borrower_hidden = Column(Boolean, nullable=False, default=False)
    lender_cleared_at = Column(DateTime, nullable=True)
    borrower_cleared_at = Column(DateTime, nullable=True)

    messages = relationship("Message", back_populates="room")
