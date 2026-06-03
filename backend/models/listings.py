from sqlalchemy import Column, Integer, String, ForeignKey, Date, Enum, JSON
from sqlalchemy.orm import relationship
from backend.db.database import Base
from backend.enums.ListingStatus import ListingStatus
from backend.enums.Categories import Categories

class Listings(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(Enum(Categories, values_callable=lambda x: [e.value for e in x]), index=True, nullable=False, default=Categories.OTHER)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=False)
    image_url = Column(String, nullable=False)
    image_urls = Column(JSON, nullable=False, default=list)
    status = Column(Enum(ListingStatus, values_callable=lambda x: [e.value for e in x]), index=True, nullable=False, default=ListingStatus.AVAILABLE)
    location = Column(String, index=True, nullable=False, default="Other")
    due_date = Column(Date, nullable=True)
    owner = relationship("Users", back_populates="listings")
