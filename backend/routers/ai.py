import base64
import json

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from backend.core.config import settings
from backend.mcp_tools import get_chat_context, get_reservation_context, get_review_context
from backend.routers.auth import get_current_user, oauth2_scheme
from backend.schemas.ai import (
    DetectedProduct,
    DraftRequest,
    DraftResponse,
    ImageAnalysisResponse,
    ProductListingSuggestions,
)


router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)


def build_listing_prompt(request: DraftRequest) -> str:
    context = request.context or {}
    item_name = context.get("name") or "the item"
    category = context.get("category") or "unspecified"
    location = context.get("location") or "unspecified"
    image_analysis = context.get("image_analysis") or {}
    detected_product = image_analysis.get("detected_product") or {}
    suggestions = image_analysis.get("suggestions") or {}
    selected_suggestions = image_analysis.get("selected_suggestions") or {}
    image_context_lines = []

    if detected_product:
        product_parts = [
            detected_product.get("name"),
            detected_product.get("brand"),
            detected_product.get("model"),
        ]
        product_summary = " / ".join(part for part in product_parts if part)
        if product_summary:
            image_context_lines.append(f"Possible product from image: {product_summary}")
        if detected_product.get("confidence"):
            image_context_lines.append(f"Image analysis confidence: {detected_product['confidence']}")
        if detected_product.get("uncertainty_note"):
            image_context_lines.append(f"What owner should confirm: {detected_product['uncertainty_note']}")

    if suggestions.get("description") and selected_suggestions.get("description", True):
        image_context_lines.append(f"Image-based description idea: {suggestions['description']}")
    if suggestions.get("specifications") and selected_suggestions.get("specifications", True):
        specs = "; ".join(suggestions["specifications"])
        image_context_lines.append(f"Possible specs to phrase cautiously: {specs}")
    has_selected_usage_notes = bool(
        suggestions.get("usage_notes") and selected_suggestions.get("usageNotes", True)
    )
    if has_selected_usage_notes:
        image_context_lines.append(f"Usage notes to include: {suggestions['usage_notes']}")
    has_selected_care_notes = bool(
        suggestions.get("care_notes") and selected_suggestions.get("careNotes", True)
    )
    if has_selected_care_notes:
        image_context_lines.append(f"Care notes to include: {suggestions['care_notes']}")

    image_context = "\n".join(image_context_lines) or "No image analysis provided."

    return (
        "You help users write honest item-sharing listings for a borrowing app.\n"
        "Rewrite the user's rough notes into one clear, friendly listing description.\n"
        "Do not invent facts, specifications, condition details, accessories, or availability.\n"
        "Use image analysis as cautious supporting context, not proof of exact model or specifications.\n"
        "If product details are uncertain, phrase them as things the owner can confirm or omit them.\n"
        f"{'Include a section labelled \"Usage notes:\" based on the usage notes. ' if has_selected_usage_notes else ''}"
        f"{'Include a section labelled \"Care notes:\" based on the care notes. ' if has_selected_care_notes else ''}"
        "Keep it under 120 words. Do not use bullet points.\n\n"
        f"Tone: {request.tone}\n"
        f"Item name: {item_name}\n"
        f"Category: {category}\n"
        f"Location: {location}\n"
        f"Image/product context:\n{image_context}\n"
        f"User notes: {request.input or 'No description yet.'}"
    )


def build_review_prompt(request: DraftRequest) -> str:
    context = request.context or {}
    listing = context.get("listing") or {}
    review_part = context.get("review_part") or "item"
    item_score = context.get("item_score") or "not provided"
    owner_score = context.get("owner_score") or "not provided"

    return (
        "You help borrowers write honest, useful reviews for an item-sharing app.\n"
        "Draft one concise review comment for the requested field only.\n"
        "Do not invent issues, damage, generosity, delays, or communication details.\n"
        "Use the user's notes when provided. Keep it under 90 words.\n"
        "Do not use bullet points.\n\n"
        f"Tone: {request.tone}\n"
        f"Review field: {review_part}\n"
        f"Item score: {item_score}\n"
        f"Owner score: {owner_score}\n"
        f"Listing name: {listing.get('name') or 'the item'}\n"
        f"Listing description: {listing.get('description') or 'not provided'}\n"
        f"Owner name: {listing.get('owner_name') or 'the owner'}\n"
        f"User notes: {request.input or 'No notes yet.'}"
    )


def build_chat_reply_prompt(request: DraftRequest) -> str:
    context = request.context or {}
    recent_messages = context.get("recent_messages") or []
    conversation = "\n".join(
        f"{message.get('sender', 'Someone')}: {message.get('content', '')}"
        for message in recent_messages[-8:]
    )

    return (
        "You help users write short, natural replies in an item borrowing chat.\n"
        "Draft only the message the user should send next.\n"
        "Do not promise actions, dates, approvals or availability unless the user explicitly says so.\n"
        "Keep it friendly and under 70 words. Do not use bullet points.\n\n"
        f"Tone: {request.tone}\n"
        f"Listing: {context.get('listing_name') or 'the listing'}\n"
        f"Recipient: {context.get('other_user_name') or 'the other user'}\n"
        f"Current reservation status: {context.get('reservation_status') or 'none'}\n"
        f"Recent conversation:\n{conversation or 'No prior messages provided.'}\n\n"
        f"User notes for the reply: {request.input or 'Draft a helpful reply based on the conversation.'}"
    )


def build_prompt(request: DraftRequest) -> str:
    if request.mode == "listing_description":
        return build_listing_prompt(request)
    if request.mode == "review":
        return build_review_prompt(request)
    if request.mode == "chat_reply":
        return build_chat_reply_prompt(request)

    raise HTTPException(
        status_code=400,
        detail="This drafting mode is not available yet"
    )


async def hydrate_draft_context(request: DraftRequest, access_token: str) -> DraftRequest:
    context_ref = request.context_ref or {}
    if not context_ref:
        return request

    ref_type = context_ref.get("type")

    if request.mode == "chat_reply" and ref_type == "chat_room":
        room_id = context_ref.get("room_id")
        if room_id is None:
            raise HTTPException(status_code=400, detail="room_id is required")

        chat_context = await get_chat_context(access_token, int(room_id))
        reservation_context = await get_reservation_context(access_token, int(room_id))
        current_reservation = reservation_context.get("current_reservation") or {}

        request.context = {
            **(request.context or {}),
            "listing_name": chat_context["listing"]["name"],
            "other_user_name": (chat_context.get("other_user") or {}).get("name"),
            "reservation_status": current_reservation.get("status"),
            "recent_messages": [
                {
                    "sender": "Me" if message["sender"] == "me" else "Other user",
                    "content": message["content"],
                }
                for message in chat_context.get("recent_messages", [])
            ],
        }
        return request

    if request.mode == "review" and ref_type == "reservation":
        reservation_id = context_ref.get("reservation_id")
        if reservation_id is None:
            raise HTTPException(status_code=400, detail="reservation_id is required")

        review_context = await get_review_context(access_token, int(reservation_id))
        listing = review_context["listing"]
        request.context = {
            **(request.context or {}),
            "review_part": context_ref.get("review_part") or "item",
            "item_score": context_ref.get("item_score"),
            "owner_score": context_ref.get("owner_score"),
            "listing": {
                "name": listing.get("name"),
                "description": listing.get("description"),
                "owner_name": (listing.get("owner") or {}).get("name"),
            },
        }
        return request

    raise HTTPException(
        status_code=400,
        detail="Unsupported AI draft context reference"
    )


def extract_response_text(payload: dict) -> str:
    if payload.get("output_text"):
        return payload["output_text"].strip()

    parts = []
    for output in payload.get("output", []):
        for content in output.get("content", []):
            text = content.get("text")
            if text:
                parts.append(text)

    return "\n".join(parts).strip()


def extract_openai_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:500] or response.reason_phrase

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or str(error)
        error_type = error.get("type")
        if error_type:
            return f"{error_type}: {message}"
        return message

    return str(payload)[:500]


def parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        cleaned = cleaned.removesuffix("```").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="AI image analysis returned an invalid response"
        ) from exc


def build_image_analysis_prompt() -> str:
    return (
        "You help users create honest item-sharing listings for MyBurrow.\n"
        "Analyze the uploaded image and identify what the item appears to be.\n"
        "Be cautious: do not claim an exact model unless visible text or distinctive evidence supports it.\n"
        "If uncertain, use a lower confidence and explain what the user should confirm.\n"
        "Return JSON only, with this exact shape:\n"
        "{\n"
        '  "detected_product": {\n'
        '    "name": "short suggested item name",\n'
        '    "brand": "visible or likely brand, or empty string",\n'
        '    "model": "visible or likely model, or empty string",\n'
        '    "confidence": "low|medium|high",\n'
        '    "visible_clues": ["short clue"],\n'
        '    "uncertainty_note": "what the owner should confirm"\n'
        "  },\n"
        '  "suggestions": {\n'
        '    "category": "tools|books|electronics|clothing|sports|other",\n'
        '    "description": "friendly listing description under 120 words; only describe visible or owner-confirmable facts",\n'
        '    "specifications": ["possible product-specific detail, phrased cautiously"],\n'
        '    "usage_notes": "plain-language usage guidance based on the apparent item; mention when exact model should be confirmed",\n'
        '    "care_notes": "safe handling and return reminders"\n'
        "  }\n"
        "}"
    )


# handle missing fields, validates confidence and category
def normalize_image_analysis(data: dict) -> ImageAnalysisResponse:
    product = data.get("detected_product") or {}
    suggestions = data.get("suggestions") or {}
    category = suggestions.get("category") or "other"

    if category not in {"tools", "books", "electronics", "clothing", "sports", "other"}:
        category = "other"

    return ImageAnalysisResponse(
        detected_product=DetectedProduct(
            name=product.get("name") or "",
            brand=product.get("brand") or "",
            model=product.get("model") or "",
            confidence=product.get("confidence")
            if product.get("confidence") in {"low", "medium", "high"}
            else "low",
            visible_clues=product.get("visible_clues") or [],
            uncertainty_note=product.get("uncertainty_note") or "",
        ),
        suggestions=ProductListingSuggestions(
            category=category,
            description=suggestions.get("description") or "",
            specifications=suggestions.get("specifications") or [],
            usage_notes=suggestions.get("usage_notes") or "",
            care_notes=suggestions.get("care_notes") or "",
        )
    )


@router.post("/draft", response_model=DraftResponse)
async def draft_text(
    request: DraftRequest,
    _current_user_id: int = Depends(get_current_user),
    access_token: str = Depends(oauth2_scheme)
):
    api_key = settings.OPENAI_API_KEY 
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="AI drafting is not configured"
        )

    request = await hydrate_draft_context(request, access_token)
    prompt = build_prompt(request)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "input": prompt,
                    "temperature": 0.4,
                    "max_output_tokens": 220,
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI drafting failed: "
                f"{exc.response.status_code} {extract_openai_error_detail(exc.response)}"
            )
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not reach AI drafting service"
        ) from exc

    draft = extract_response_text(response.json())
    if not draft:
        raise HTTPException(
            status_code=502,
            detail="AI drafting returned an empty response"
        )

    return DraftResponse(draft=draft)


@router.post("/analyze-listing-image", response_model=ImageAnalysisResponse)
async def analyze_listing_image(
    file: UploadFile = File(...),
    _current_user_id: int = Depends(get_current_user)
):
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="AI image analysis is not configured"
        )

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file"
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty")

    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image must be smaller than 8MB"
        )

    # ai cannot access our temporary file storage, so we encode the image as a data URL (Base64)
    # as we analyse the image before it is uploaded to permanent storage, we will not have the supabase public URL
    data_url = (
        f"data:{file.content_type};base64,"
        f"{base64.b64encode(image_bytes).decode('utf-8')}"
    )

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "input": [
                        {
                            "role": "user",
                            # include text and image instructions
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": build_image_analysis_prompt(),
                                },
                                {
                                    "type": "input_image",
                                    "image_url": data_url,
                                    "detail": "low",
                                },
                            ],
                        }
                    ],
                    "temperature": 0.2, # output should be more focused and less creative
                    "max_output_tokens": 700,
                },
            )
            response.raise_for_status()
            
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI image analysis failed: "
                f"{exc.response.status_code} {extract_openai_error_detail(exc.response)}"
            )
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not reach AI image analysis service"
        ) from exc

    text = extract_response_text(response.json())
    if not text:
        raise HTTPException(
            status_code=502,
            detail="AI image analysis returned an empty response"
        )

    return normalize_image_analysis(parse_json_response(text))
