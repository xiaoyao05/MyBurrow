from enum import Enum

class Locations(str, Enum):
    EAST_WEST = "East-West Line"
    NORTH_EAST = "North-East Line"
    NORTH_SOUTH = "North-South Line"
    CIRCLE = "Circle Line"
    DOWNTOWN = "Downtown Line"
    THOMSON_EAST_COAST = "Thomson-East Coast Line"
    OTHER = "Other"
