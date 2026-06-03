from enum import Enum

class Categories(str, Enum):
    TOOLS = "tools"
    BOOKS = "books"
    ELECTRONICS = "electronics"
    CLOTHING = "clothing"
    SPORTS = "sports"
    OTHER = "other"