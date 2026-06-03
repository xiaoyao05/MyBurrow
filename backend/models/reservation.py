from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Integer

from backend.db.database import Base
from backend.enums.ReservationStatus import ReservationStatus


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), nullable=False, index=True)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    borrower_calendar_added = Column(Boolean, nullable=False, default=False)
    lender_calendar_added = Column(Boolean, nullable=False, default=False)
    status = Column(
        Enum(
            ReservationStatus,
            values_callable=lambda x: [e.value for e in x],
            native_enum=False
        ),
        nullable=False,
        default=ReservationStatus.PENDING,
        index=True
    )
