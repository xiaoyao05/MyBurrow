from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint

from backend.db.database import Base


class SavedListing(Base):
    __tablename__ = "saved_listings"
    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="unique_saved_listing"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False, index=True)
