from sqlalchemy import Column, Date, ForeignKey, Integer

from backend.db.database import Base


class ListingUnavailableRange(Base):
    __tablename__ = "listing_unavailable_ranges"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
