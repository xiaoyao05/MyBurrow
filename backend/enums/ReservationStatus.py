from enum import Enum


class ReservationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    BORROWED = "borrowed"
    RETURNED = "returned"
    CANCELLED = "cancelled"
