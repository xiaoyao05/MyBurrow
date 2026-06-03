from mcp.server.fastmcp import FastMCP

from backend.mcp_tools import (
    check_listing_availability,
    get_chat_context,
    get_listing_context,
    get_reservation_context,
    get_review_context,
)


mcp = FastMCP(
    "MyBurrow MCP",
    instructions=(
        "Read-only MyBurrow tools for listing, chat, reservation, and review context. "
        "Every tool requires a valid user access token and enforces app permissions. "
        "These tools do not create, update, delete, approve, cancel, or send anything."
    ),
)


@mcp.tool()
async def myburrow_get_listing(access_token: str, listing_id: int) -> dict:
    """Return public listing details and rating summary for a listing."""
    return await get_listing_context(access_token, listing_id)


@mcp.tool()
async def myburrow_get_chat_context(
    access_token: str,
    room_id: int,
    limit: int = 8,
) -> dict:
    """Return listing, participant, and recent-message context for an accessible chat room."""
    return await get_chat_context(access_token, room_id, limit)


@mcp.tool()
async def myburrow_get_reservation_context(access_token: str, room_id: int) -> dict:
    """Return reservation, listing status, due date, and blocked ranges for an accessible chat room."""
    return await get_reservation_context(access_token, room_id)


@mcp.tool()
async def myburrow_check_listing_availability(
    access_token: str,
    listing_id: int,
    start_date: str,
    end_date: str,
) -> dict:
    """Check whether a listing is available for a date range in YYYY-MM-DD format."""
    return await check_listing_availability(
        access_token,
        listing_id,
        start_date,
        end_date,
    )


@mcp.tool()
async def myburrow_get_review_context(access_token: str, reservation_id: int) -> dict:
    """Return listing, reservation, and existing-review context for a borrower review."""
    return await get_review_context(access_token, reservation_id)


if __name__ == "__main__":
    mcp.run()
