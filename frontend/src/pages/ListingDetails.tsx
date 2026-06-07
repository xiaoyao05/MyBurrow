import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IoArrowBack,
  IoChatbubbleEllipsesOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
} from "react-icons/io5";
import TopNav from "../components/TopNav";
import httpClient from "../httpClient";
import "../styles/ListingDetails.css";

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function getRatingValue(listing) {
  return (
    listing.rating_average ??
    listing.ratingAverage ??
    listing.average_rating ??
    listing.averageRating ??
    listing.rating ??
    null
  );
}

function getReviewCount(listing, reviews) {
  return (
    listing.review_count ??
    listing.reviewCount ??
    listing.rating_count ??
    listing.ratingCount ??
    reviews.length
  );
}

function normalizeReviews(listing) {
  const rawReviews = listing.reviews || listing.review_list || [];
  if (!Array.isArray(rawReviews)) return [];

  return rawReviews.map((review) => ({
    id: review.id,
    score: review.score ?? review.rating ?? review.item_score,
    comment: review.comment ?? review.text ?? review.item_comment,
    ownerComment: review.owner_comment,
    reviewerName:
      review.user?.name ??
      review.reviewer?.name ??
      review.borrower?.name ??
      "Borrower",
    createdAt: review.created_at ?? review.createdAt,
  }));
}

function getListingImages(listing) {
  const images = Array.isArray(listing.image_urls)
    ? listing.image_urls.filter(Boolean)
    : [];

  if (images.length > 0) return images;
  return listing.image_url ? [listing.image_url] : [];
}

function parseDescriptionSection(section) {
  const match = section.match(/^\*{0,2}([^:*]+:)\*{0,2}\s*(.*)$/s);
  if (!match) {
    return { label: null, text: section };
  }

  return {
    label: match[1],
    text: match[2],
  };
}

function ListingDescription({ description }) {
  const sections = (description || "")
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return <span>Not provided</span>;
  }

  return (
    <div className="listing-details-description">
      {sections.map((section, index) => {
        const parsedSection = parseDescriptionSection(section);

        return (
          <p key={`${parsedSection.label || "section"}-${index}`}>
            {parsedSection.label && <strong>{parsedSection.label} </strong>}
            {parsedSection.text}
          </p>
        );
      })}
    </div>
  );
}

export default function ListingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [listingReviews, setListingReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    async function fetchListing() {
      try {
        setLoading(true);
        setError(null);
        const [listingResponse, reviewsResponse] = await Promise.all([
          httpClient.get(`/api/listings/${id}`),
          httpClient.get(`/api/reviews/listings/${id}`),
        ]);
        setListing(listingResponse.data);
        setListingReviews(reviewsResponse.data);
        setCurrentImageIndex(0);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load listing");
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [id]);

  const reviews = useMemo(
    () =>
      listingReviews.length > 0
        ? normalizeReviews({ reviews: listingReviews })
        : normalizeReviews(listing || {}),
    [listing, listingReviews]
  );
  const ratingValue = listing ? getRatingValue(listing) : null;
  const reviewCount = listing ? getReviewCount(listing, reviews) : 0;
  const listingImages = listing ? getListingImages(listing) : [];
  const showImageControls = listingImages.length > 1;
  const activeImageIndex = Math.min(currentImageIndex, Math.max(listingImages.length - 1, 0));
  const currentImage = listingImages[activeImageIndex] || listingImages[0];

  const handlePreviousImage = () => {
    setCurrentImageIndex((currentIndex) =>
      currentIndex === 0 ? listingImages.length - 1 : currentIndex - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((currentIndex) =>
      currentIndex === listingImages.length - 1 ? 0 : currentIndex + 1
    );
  };

  const handleStartChat = async () => {
    if (!listing?.id || startingChat) return;

    try {
      setStartingChat(true);
      setChatError(null);
      const response = await httpClient.post(`/api/chat/listings/${listing.id}`);
      navigate(`/chats/${response.data.id}`);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }

      setChatError(err.response?.data?.detail || "Failed to start chat");
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <div>
      <TopNav />

      <main className="listing-details-page">
        <Link className="listing-details-back" to="/home">
          <IoArrowBack aria-hidden="true" />
          Back to listings
        </Link>

        {loading && <p className="listing-details-message">Loading listing...</p>}
        {!loading && error && <p className="listing-details-error">{error}</p>}

        {!loading && !error && listing && (
          <>
            <section className="listing-details-hero">
              <div className="listing-details-image-wrap">
                {listingImages.length > 0 ? (
                  <div className={`listing-details-carousel ${showImageControls ? "has-controls" : ""}`}>
                    {showImageControls && (
                      <button
                        type="button"
                        className="listing-details-carousel-button"
                        onClick={handlePreviousImage}
                        aria-label="Show previous listing image"
                      >
                        <IoChevronBackOutline aria-hidden="true" />
                      </button>
                    )}
                    <div className="listing-details-image-frame">
                      <img
                        src={currentImage}
                        alt={`${listing.name} ${currentImageIndex + 1}`}
                      />
                      {showImageControls && (
                        <span className="listing-details-image-count">
                          {currentImageIndex + 1} / {listingImages.length}
                        </span>
                      )}
                    </div>
                    {showImageControls && (
                      <button
                        type="button"
                        className="listing-details-carousel-button"
                        onClick={handleNextImage}
                        aria-label="Show next listing image"
                      >
                        <IoChevronForwardOutline aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="listing-details-image-empty">No image</div>
                )}
              </div>

              <div className="listing-details-info">
                <span className={`listing-details-status listing-details-status-${(listing.status || "Available").toLowerCase()}`}>
                  {listing.status || "Available"}
                </span>
                <h1>{listing.name}</h1>

                <div className="listing-details-rating">
                  <span className="listing-details-stars" aria-hidden="true">
                    ★
                  </span>
                  <span>
                    {ratingValue !== null
                      ? Number(ratingValue).toFixed(1)
                      : "No rating yet"}
                  </span>
                  <span className="listing-details-muted">
                    {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                  </span>
                </div>

                <dl className="listing-details-meta">
                  <div>
                    <dt>Category</dt>
                    <dd>{listing.category || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{listing.location || "Not specified"}</dd>
                  </div>
                  <div className="listing-details-description-field">
                    <dt>Description</dt>
                    <dd>
                      <ListingDescription description={listing.description}/>
                    </dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd className="listing-details-owner-row">
                      <span>{listing.owner?.name || "Unknown"}</span>
                      <button
                        type="button"
                        className="listing-details-chat-button"
                        onClick={handleStartChat}
                        disabled={startingChat}
                        aria-label="Chat with owner"
                        title="Chat with owner"
                      >
                        <IoChatbubbleEllipsesOutline aria-hidden="true" />
                      </button>
                    </dd>
                  </div>
                  {listing.due_date && (
                    <div>
                      <dt>Expected available</dt>
                      <dd>{formatDate(listing.due_date)}</dd>
                    </div>
                  )}
                </dl>
                {chatError && <p className="listing-details-error">{chatError}</p>}
              </div>
            </section>

            <section className="listing-details-reviews">
              <div className="listing-details-section-heading">
                <h2>Reviews</h2>
                <span>{reviewCount}</span>
              </div>

              {reviews.length > 0 ? (
                <div className="listing-details-review-list">
                  {reviews.map((review, index) => (
                    <article
                      className="listing-details-review"
                      key={review.id || index}
                    >
                      <div>
                        <strong>{review.reviewerName}</strong>
                        {review.createdAt && (
                          <span>{formatDate(review.createdAt)}</span>
                        )}
                      </div>
                      {review.score !== undefined && review.score !== null && (
                        <p className="listing-details-review-score">
                          {Number(review.score).toFixed(1)} / 5.0
                        </p>
                      )}
                      {review.comment && <p style={{ fontSize: '15px' }}>{review.comment}</p>}
                      {review.ownerComment && (
                        <p className="listing-details-owner-comment">
                          <strong>Owner review:</strong> {review.ownerComment}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="listing-details-empty">
                  No reviews yet. Once borrowers rate this item after returning it,
                  their comments will appear here.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
