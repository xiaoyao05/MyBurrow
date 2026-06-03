from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


DraftMode = Literal["listing_description", "review", "chat_reply"]


class DraftRequest(BaseModel):
    mode: DraftMode
    input: str = Field(default="", max_length=4000)
    tone: str = Field(default="friendly", max_length=40)
    context: Optional[dict[str, Any]] = None
    context_ref: Optional[dict[str, Any]] = None


class DraftResponse(BaseModel):
    draft: str


class DetectedProduct(BaseModel):
    name: str = ""
    brand: str = ""
    model: str = ""
    confidence: Literal["low", "medium", "high"] = "low"
    visible_clues: list[str] = Field(default_factory=list)
    uncertainty_note: str = ""


class ProductListingSuggestions(BaseModel):
    category: str = "other"
    description: str = ""
    specifications: list[str] = Field(default_factory=list)
    usage_notes: str = ""
    care_notes: str = ""


class ImageAnalysisResponse(BaseModel):
    detected_product: DetectedProduct
    suggestions: ProductListingSuggestions
