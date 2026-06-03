from enum import Enum

class ListingStatus(str, Enum):
    AVAILABLE = "Available"
    UNAVAILABLE = "Unavailable"
    RESERVED = "Reserved"