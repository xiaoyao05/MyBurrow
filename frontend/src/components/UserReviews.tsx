function formatDate(iso) {
  if (!iso) return "";

  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function getAverageOwnerScore(reviews) {
  const scoredReviews = reviews.filter(
    (review) => review.owner_score !== undefined && review.owner_score !== null
  );

  if (scoredReviews.length === 0) return null;

  const total = scoredReviews.reduce(
    (sum, review) => sum + Number(review.owner_score),
    0
  );

  return total / scoredReviews.length;
}

export default function UserReviews({ reviews = [], loading = false, error = null }) {
  const averageScore = getAverageOwnerScore(reviews);

  return (
    <section className="user-reviews" aria-label="User reviews">
      <div className="user-reviews-heading">
        <h2>Reviews</h2>
        <span>{reviews.length}</span>
      </div>

      {averageScore !== null && (
        <p className="user-reviews-average">
          Average owner rating: {averageScore.toFixed(1)} / 5.0
        </p>
      )}

      {loading && <p className="profile-page-message">Loading reviews...</p>}
      {!loading && error && <p className="profile-page-error">{error}</p>}

      {!loading && !error && reviews.length === 0 && (
        <p className="profile-page-message">No reviews yet.</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <div className="user-review-list">
          {reviews.map((review) => (
            <article className="user-review" key={review.id}>
              <div className="user-review-top">
                <strong>{review.reviewer?.name || "Borrower"}</strong>
                {review.created_at && <span>{formatDate(review.created_at)}</span>}
              </div>

              {review.owner_score !== undefined && review.owner_score !== null && (
                <p className="user-review-score">
                  {Number(review.owner_score).toFixed(1)} / 5.0
                </p>
              )}

              <p>{review.owner_comment || "No written owner review."}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
