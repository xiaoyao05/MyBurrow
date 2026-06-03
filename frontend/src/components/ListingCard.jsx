import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { IoChatbubbleEllipsesOutline } from "react-icons/io5";
import { IoChevronBackOutline, IoChevronForwardOutline } from "react-icons/io5";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import httpClient from "../httpClient";
import "../styles/ListingCard.css";

function formatDate(iso){
    if(!iso) return null;
    try{
        const date = new Date(iso);
        return date.toLocaleDateString();
    }catch{
        return iso;
    }
}

function getTodayKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getRatingLabel(listing) {
    const average = listing.rating_average ?? listing.ratingAverage;
    const count = listing.rating_count ?? listing.ratingCount ?? 0;

    if (average === null || average === undefined || count === 0) {
        return "No ratings yet";
    }

    return `${Number(average).toFixed(1)} / 5 (${count})`;
}

function getListingImages(listing) {
    const images = Array.isArray(listing.image_urls) ? listing.image_urls.filter(Boolean) : [];
    if (images.length > 0) return images;
    return listing.image_url ? [listing.image_url] : [];
}

export default function ListingCard({
    listing,
    showOwner = true,
    showChat = true,
    showAvailabilityToggle = false,
    onAvailabilityChange,
    onEdit,
    onDelete,
    isSaved = false,
    onToggleSave,
    saving,
    busy,
    deleting
}) {
    const l = listing || {};
    const status = l.status || "Available";
    const todayKey = getTodayKey();
    const isReserved = status === "Reserved";
    const expectedBorrowingDates =
        l.expected_borrow_start_date && l.expected_borrow_end_date
            ? `${formatDate(l.expected_borrow_start_date)} - ${formatDate(l.expected_borrow_end_date)}`
            : null;
    const unavailableDates =
        l.unavailable_start_date && l.unavailable_end_date
            ? `${formatDate(l.unavailable_start_date)} - ${formatDate(l.unavailable_end_date)}`
            : null;
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [error, setError] = useState(null);
    const [startingChat, setStartingChat] = useState(false);
    const [unavailableStart, setUnavailableStart] = useState(
        l.unavailable_start_date || todayKey
    );
    const [unavailableEnd, setUnavailableEnd] = useState(
        l.unavailable_end_date || l.due_date || todayKey
    );
    const navigate = useNavigate();
    const detailsPath = l.id ? `/listings/${l.id}` : null;
    const listingImages = getListingImages(l);
    const activeImageIndex = Math.min(currentImageIndex, Math.max(listingImages.length - 1, 0));
    const coverImage = listingImages[activeImageIndex] || listingImages[0];
    const showImageControls = listingImages.length > 1;

    const openListingDetails = (event) => {
        if (!detailsPath) return;

        // card does not navigate if these areas are clicked
        const interactiveElement = event.target.closest(
            "button, a, input, select, textarea, label, summary, details"
        );
        if (interactiveElement) return;

        navigate(detailsPath);
    };

    const handleListingKeyDown = (event) => {
        if (!detailsPath || event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(detailsPath);
        }
    };

    // Close when Escape key is pressed
    useEffect(() => {
        if (!lightboxOpen) return;
        const onKey = (e) => {
                if (e.key === "Escape") {
                setLightboxOpen(false);
                }
                if (e.key === "ArrowLeft" && showImageControls) {
                    setCurrentImageIndex((currentIndex) =>
                        currentIndex === 0 ? listingImages.length - 1 : currentIndex - 1
                    );
                }
                if (e.key === "ArrowRight" && showImageControls) {
                    setCurrentImageIndex((currentIndex) =>
                        currentIndex === listingImages.length - 1 ? 0 : currentIndex + 1
                    );
                }
            };

    window.addEventListener("keydown", onKey);

    // Cleanup
    return () => {
        window.removeEventListener("keydown", onKey);
    };
    }, [lightboxOpen, listingImages.length, showImageControls]);

    const handlePreviousImage = (event) => {
        event.stopPropagation();
        setCurrentImageIndex((currentIndex) =>
            currentIndex === 0 ? listingImages.length - 1 : currentIndex - 1
        );
    };

    const handleNextImage = (event) => {
        event.stopPropagation();
        setCurrentImageIndex((currentIndex) =>
            currentIndex === listingImages.length - 1 ? 0 : currentIndex + 1
        );
    };

    const handleImagePanelKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setLightboxOpen(true);
        }
    };

    const handleImagePanelClick = (event) => {
        event.stopPropagation();
        setLightboxOpen(true);
    };

    const handleLightboxBackdropClick = (event) => {
        event.stopPropagation();
        setLightboxOpen(false);
    };

    const handleStartChat = async () => {
        if (!l.id || startingChat) return;

        try {
            setStartingChat(true);
            setError(null);
            const response = await httpClient.post(`/api/chat/listings/${l.id}`);
            navigate(`/chats/${response.data.id}`);
        } catch (err) {
            if (err.response?.status === 401) {
                navigate("/login");
                return;
            }

            setError(err.response?.data?.detail || "Failed to start chat");
        } finally {
            setStartingChat(false);
        }
    };

    const handleMakeUnavailable = () => {
        if (!onAvailabilityChange || !unavailableStart || !unavailableEnd) return;

        onAvailabilityChange(l.id, {
            status: "Unavailable",
            start_date: unavailableStart,
            end_date: unavailableEnd,
        });
    };

    const handleMakeAvailable = () => {
        if (!onAvailabilityChange) return;

        onAvailabilityChange(l.id, {
            status: "Available",
            due_date: null,
        });
    };

    const availabilityManagedByReservation =
        isReserved || Boolean(l.expected_borrow_start_date);
    const canToggleAvailability =
        showAvailabilityToggle && !availabilityManagedByReservation;

    return(
        <article
            className={`listing-card ${detailsPath ? "listing-card-clickable" : ""}`}
            onClick={openListingDetails}
            onKeyDown={handleListingKeyDown}
            tabIndex={detailsPath ? 0 : undefined}
            role={detailsPath ? "link" : undefined}
            aria-label={detailsPath ? `View ${l.name} details and reviews` : undefined}
        >
            {onToggleSave && (
                <button
                    type="button"
                    className={`save-listing-button ${isSaved ? "saved" : ""}`}
                    onClick={() => onToggleSave(l.id)}
                    disabled={saving}
                    aria-label={isSaved ? "Unsave listing" : "Save listing"}
                    title={isSaved ? "Unsave listing" : "Save listing"}
                >
                    {isSaved ? <FaHeart aria-hidden="true" /> : <FaRegHeart aria-hidden="true" />}
                </button>
            )}

            <span className={`status-pill status-pill-${status.toLowerCase()}`}>
                {status}
            </span>

            {coverImage ? (
                <div className={`image-carousel ${showImageControls ? "has-controls" : ""}`}>
                    {showImageControls && (
                        <button
                            type="button"
                            className="image-carousel-button"
                            onClick={handlePreviousImage}
                            aria-label="Show previous listing image"
                        >
                            <IoChevronBackOutline aria-hidden="true" />
                        </button>
                    )}
                    <div
                        onClick={handleImagePanelClick}
                        onKeyDown={handleImagePanelKeyDown}
                        aria-label="View image"
                        className="image-button"
                        role="button"
                        tabIndex={0}
                    >
                        <img 
                        src={coverImage} 
                        alt={`${l.name || "Listing"} ${currentImageIndex + 1}`} 
                        />
                        {listingImages.length > 1 && (
                            <span className="image-count-badge">
                                {currentImageIndex + 1} / {listingImages.length}
                            </span>
                        )}
                    </div>
                    {showImageControls && (
                        <button
                            type="button"
                            className="image-carousel-button"
                            onClick={handleNextImage}
                            aria-label="Show next listing image"
                        >
                            <IoChevronForwardOutline aria-hidden="true" />
                        </button>
                    )}
                </div>
            ) : (
                <div style={{ width: "100%", height: 160, background: "#f5f5f5" }} />
            )}

            <div className="listing-info">
                <h3 className="listing-title">{l.name}</h3>
                <dl className="listing-fields">
                    <div className="listing-field">
                        <dt className="listing-field-label">Category</dt>
                        <dd className="listing-field-value">{l.category}</dd>
                    </div>
                    <div className="listing-field">
                        <dt className="listing-field-label">Location</dt>
                        <dd className="listing-field-value">{l.location}</dd>
                    </div>
                {isReserved && expectedBorrowingDates ? (
                    <div className="listing-field">
                        <dt className="listing-field-label">Expected unavailable dates</dt>
                        <dd className="listing-field-value">{expectedBorrowingDates}</dd>
                    </div>
                ) : (
                    status === "Unavailable" && l.due_date ? (
                        <div className="listing-field">
                            <dt className="listing-field-label">Expected available date</dt>
                            <dd className="listing-field-value">{formatDate(l.due_date)}</dd>
                        </div>
                    ) : (
                        unavailableDates && (
                            <div className="listing-field">
                                <dt className="listing-field-label">Unavailable dates</dt>
                                <dd className="listing-field-value">{unavailableDates}</dd>
                            </div>
                        )
                    )
                )}
                {showOwner && (
                    <div className="listing-field">
                        <dt className="listing-field-label">Owner</dt>
                        <dd className="listing-field-value">{l.owner?.name}</dd>
                    </div>
                )}
                </dl>
                <div className="listing-rating-row">
                    <p className="listing-rating">★ {getRatingLabel(l)}</p>
                    {showChat && (
                        <button
                            type="button"
                            className="chat-button"
                            onClick={handleStartChat}
                            disabled={startingChat}
                            aria-label="Chat with owner"
                            title="Chat with owner">
                            <IoChatbubbleEllipsesOutline size={24} />
                        </button>
                    )}
                </div>

                {canToggleAvailability && (
                    <details className="availability-dropdown">
                        <summary>Toggle item availability</summary>
                        <div className="availability-controls">
                            {status === "Unavailable" ? (
                                <button
                                    type="button"
                                    className="availability-button"
                                    disabled={busy}
                                    onClick={handleMakeAvailable}
                                >
                                    Make Available
                                </button>
                            ) : (
                                <>
                                    <label>
                                        Unavailable from
                                        <input
                                            type="date"
                                            min={todayKey}
                                            value={unavailableStart}
                                            onChange={(e) => {
                                                setUnavailableStart(e.target.value);
                                                if (unavailableEnd < e.target.value) {
                                                    setUnavailableEnd(e.target.value);
                                                }
                                            }}
                                        />
                                    </label>
                                    <label>
                                        Unavailable until
                                        <input
                                            type="date"
                                            min={unavailableStart || todayKey}
                                            value={unavailableEnd}
                                            onChange={(e) => setUnavailableEnd(e.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="availability-button"
                                        disabled={
                                            busy ||
                                            !unavailableStart ||
                                            !unavailableEnd ||
                                            unavailableEnd < unavailableStart
                                        }
                                        onClick={handleMakeUnavailable}
                                    >
                                        Save Unavailable Dates
                                    </button>
                                </>
                            )}
                        </div>
                    </details>
                )}
            </div>

            {(onDelete || onEdit) && (
                <div className="listing-card-management">
                    {onDelete && (
                        <button
                            type="button"
                            className="delete-button"
                            disabled={deleting}
                            onClick={() => onDelete(l.id)}
                            aria-label="Delete listing"
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </button>
                    )}

                    {onEdit && (
                        <button
                            type="button"
                            className="edit-button"
                            onClick={() => onEdit(l.id)}
                            aria-label="Edit listing"
                        >
                            Edit
                        </button>
                    )}
                </div>
            )}
                
            {error && <p style={{ color: "red", fontSize: "14px" }}>{error}</p>}

            {lightboxOpen && coverImage && createPortal(
                <div
                    className="lightbox"
                    onClick={handleLightboxBackdropClick}
                    aria-modal="true"
                    role="dialog">
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <div className={`lightbox-carousel ${showImageControls ? "has-controls" : ""}`}>
                            {showImageControls && (
                                <button
                                    type="button"
                                    className="lightbox-carousel-button"
                                    onClick={handlePreviousImage}
                                    aria-label="Show previous listing image"
                                >
                                    <IoChevronBackOutline aria-hidden="true" />
                                </button>
                            )}
                            <div className="lightbox-image-frame">
                                <img
                                    src={coverImage}
                                    alt={`${l.name || "Listing"} full size ${currentImageIndex + 1}`}
                                />
                                {showImageControls && (
                                    <span className="lightbox-image-count">
                                        {currentImageIndex + 1} / {listingImages.length}
                                    </span>
                                )}
                            </div>
                            {showImageControls && (
                                <button
                                    type="button"
                                    className="lightbox-carousel-button"
                                    onClick={handleNextImage}
                                    aria-label="Show next listing image"
                                >
                                    <IoChevronForwardOutline aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </article>
    )
}
