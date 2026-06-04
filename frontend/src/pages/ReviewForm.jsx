import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IoArrowBack,
  IoChevronBackOutline,
  IoChevronForwardOutline,
} from "react-icons/io5";
import TopNav from "../components/TopNav";
import httpClient from "../httpClient";
import "../styles/ReviewForm.css";

const scoreOptions = [0, 1, 2, 3, 4, 5];

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

function ReviewListingDescription({ description }) {
  const sections = (description || "")
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return <span>Not provided</span>;
  }

  return (
    <div className="review-form-description">
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

// reusable component
function ScorePicker({ label, value, onChange, required = false }) {
  return (
    <fieldset className="review-score-picker">
      <legend>{label}</legend>
      <div>
        {scoreOptions.map((score) => (
          <label
            key={score}
            className={Number(value) === score ? "selected" : ""}
          > 
            <input
              type="radio"
              name={label}
              value={score}
              checked={Number(value) === score}
              required={required}
              onChange={() => onChange(score)}
            />
            <span>{score}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ReviewForm() {
  const { reservationId } = useParams();
  const navigate = useNavigate();
  const [context, setContext] = useState(null);
  const [itemScore, setItemScore] = useState(5);
  const [ownerScore, setOwnerScore] = useState("");
  const [itemComment, setItemComment] = useState("");
  const [ownerComment, setOwnerComment] = useState("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(null);
  const [aiDraftError, setAiDraftError] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    async function loadReviewContext() {
      try {
        setLoading(true);
        setError(null);
        const response = await httpClient.get(
          `/api/reviews/reservations/${reservationId}`
        );
        setContext(response.data);
        setCurrentImageIndex(0);

        if (response.data.existing_review) {
          const review = response.data.existing_review;
          setItemScore(review.item_score);
          setOwnerScore(review.owner_score ?? "");
          setItemComment(review.item_comment || "");
          setOwnerComment(review.owner_comment || "");
        }
      } catch (err) {
        if (err.response?.status === 401) {
          navigate("/login");
          return;
        }
        setError(err.response?.data?.detail || "Failed to load review form");
      } finally {
        setLoading(false);
      }
    }

    loadReviewContext();
  }, [navigate, reservationId]);

  const canSubmit = context?.status === "returned";
  const listingImages = context ? getListingImages(context.listing) : [];
  const activeImageIndex = Math.min(currentImageIndex, Math.max(listingImages.length - 1, 0));
  const currentImage = listingImages[activeImageIndex];
  const showImageControls = listingImages.length > 1;

  const handlePreviousImage = () => {
    setCurrentImageIndex((index) =>
      index === 0 ? listingImages.length - 1 : index - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((index) =>
      index === listingImages.length - 1 ? 0 : index + 1
    );
  };

  const handleDraftReview = async (reviewPart) => {
    if (!context) return;

    const currentNotes = reviewPart === "item" ? itemComment : ownerComment;

    try {
      setAiDraftLoading(reviewPart);
      setAiDraftError(null);
      setAiDraft(null);
      const response = await httpClient.post("/api/ai/draft", {
        mode: "review",
        input: currentNotes.trim(),
        tone: "friendly",
        context_ref: {
          type: "reservation",
          reservation_id: Number(reservationId),
          review_part: reviewPart,
          item_score: Number(itemScore),
          owner_score: ownerScore === "" ? null : Number(ownerScore),
        },
      });

      setAiDraft({
        reviewPart,
        draft: response.data.draft,
      });
    } catch (err) {
      setAiDraftError(
        err.response?.data?.detail || "Failed to draft review text"
      );
    } finally {
      setAiDraftLoading(null);
    }
  };

  const acceptAiDraft = () => {
    if (!aiDraft) return;

    if (aiDraft.reviewPart === "item") {
      setItemComment(aiDraft.draft);
    } else {
      setOwnerComment(aiDraft.draft);
    }

    setAiDraft(null);
    setAiDraftError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError(null);
      await httpClient.post(`/api/reviews/reservations/${reservationId}`, {
        item_score: Number(itemScore),
        owner_score: ownerScore === "" ? null : Number(ownerScore),
        item_comment: itemComment.trim() || null,
        owner_comment: ownerComment.trim() || null,
      });
      setSuccess("Review saved.");
      window.setTimeout(() => {
        navigate(`/listings/${context.listing.id}`);
      }, 700);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <TopNav />

      <main className="review-form-page">
        <Link className="review-form-back" to="/myactivity">
          <IoArrowBack aria-hidden="true" />
          <span>Back to activity</span>
        </Link>

        {loading && <p className="review-form-message">Loading review form...</p>}
        {!loading && error && <p className="review-form-error">{error}</p>}

        {!loading && !error && context && (
          <section className="review-form-panel">
            <div className="review-form-listing">
              {currentImage && (
                <div className="review-form-image-carousel">
                  <div className="review-form-image-wrap">
                    <img src={currentImage} alt={context.listing.name} />
                  </div>
                  {showImageControls && (
                    <div className="review-image-controls">
                      <button
                        type="button"
                        className="review-image-nav"
                        onClick={handlePreviousImage}
                        aria-label="Previous listing image"
                        title="Previous image"
                      >
                        <IoChevronBackOutline aria-hidden="true" />
                      </button>
                      <span className="review-image-count">
                        {activeImageIndex + 1} / {listingImages.length}
                      </span>
                      <button
                        type="button"
                        className="review-image-nav"
                        onClick={handleNextImage}
                        aria-label="Next listing image"
                        title="Next image"
                      >
                        <IoChevronForwardOutline aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="review-form-listing-copy">
                <h1>Rate {context.listing.name}</h1>
                {context.listing.owner_name && (
                  <span className="review-form-owner">
                    Owner: {context.listing.owner_name}
                  </span>
                )}
                <div className="review-form-description-field">
                  <span>Description</span>
                  <ReviewListingDescription description={context.listing.description} />
                </div>
              </div>
            </div>

            {!canSubmit && (
              <p className="review-form-error">
                You can review this item after the return has been confirmed.
              </p>
            )}

            {success && <p className="review-form-success">{success}</p>}

            <form onSubmit={handleSubmit} className="review-form">
              <ScorePicker
                label="Rate the item"
                value={itemScore}
                onChange={setItemScore}
                required
              />

              <label className="review-textarea-label">
                How was the item?
                <textarea
                  value={itemComment}
                  onChange={(event) => setItemComment(event.target.value)}
                  maxLength={2000}
                  placeholder="Share details about condition, usefulness, or anything future borrowers should know."
                  rows={4}
                />
              </label>
              <button
                type="button"
                className="review-ai-draft-button"
                onClick={() => handleDraftReview("item")}
                disabled={!canSubmit || aiDraftLoading === "item"}
              >
                {aiDraftLoading === "item" ? "Drafting..." : "Draft item review with AI"}
              </button>
              {aiDraft?.reviewPart === "item" && (
                <section className="review-ai-draft-preview" aria-label="AI item review draft">
                  <p>{aiDraft.draft}</p>
                  <div>
                    <button type="button" onClick={acceptAiDraft}>
                      Use Draft
                    </button>
                    <button type="button" onClick={() => setAiDraft(null)}>
                      Discard
                    </button>
                  </div>
                </section>
              )}

              <ScorePicker
                label="Rate the owner"
                value={ownerScore === "" ? -1 : ownerScore}
                onChange={setOwnerScore}
              />

              <label className="review-textarea-label">
                How was the owner?
                <textarea
                  value={ownerComment}
                  onChange={(event) => setOwnerComment(event.target.value)}
                  maxLength={2000}
                  placeholder="Share details about communication, handover, or return experience."
                  rows={4}
                />
              </label>
              <button
                type="button"
                className="review-ai-draft-button"
                onClick={() => handleDraftReview("owner")}
                disabled={!canSubmit || aiDraftLoading === "owner"}
              >
                {aiDraftLoading === "owner" ? "Drafting..." : "Draft owner review with AI"}
              </button>
              {aiDraft?.reviewPart === "owner" && (
                <section className="review-ai-draft-preview" aria-label="AI owner review draft">
                  <p>{aiDraft.draft}</p>
                  <div>
                    <button type="button" onClick={acceptAiDraft}>
                      Use Draft
                    </button>
                    <button type="button" onClick={() => setAiDraft(null)}>
                      Discard
                    </button>
                  </div>
                </section>
              )}

              {aiDraftError && <p className="review-form-error">{aiDraftError}</p>}

              <button type="submit" disabled={!canSubmit || saving}>
                {saving ? "Saving..." : context.existing_review ? "Update Review" : "Submit Review"}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
