import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { IoArrowBack } from "react-icons/io5";
import TopNav from "../components/TopNav";
import ProfileCard from "../components/ProfileCard";
import UserReviews from "../components/UserReviews";
import httpClient from "../httpClient";
import "../styles/ProfileCard.css";

export default function UserProfile() {
  const { userId } = useParams();
  const location = useLocation();
  const fromChatRoomId = location.state?.fromChatRoomId;
  const backLink = fromChatRoomId ? `/chats/${fromChatRoomId}` : "/chats";
  const backLabel = fromChatRoomId ? "Back to chat" : "Back to chats";
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewsError, setReviewsError] = useState(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true);
        setError(null);
        const response = await httpClient.get(`/api/profile/${userId}`);
        setProfile({ ...response.data, user_id: Number(userId) });
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to fetch profile");
      } finally {
        setLoading(false);
      }
    }

    async function fetchReviews() {
      try {
        setReviewsLoading(true);
        setReviewsError(null);
        const response = await httpClient.get(`/api/reviews/users/${userId}`);
        setReviews(response.data);
      } catch (err) {
        setReviewsError(err.response?.data?.detail || "Failed to fetch reviews");
      } finally {
        setReviewsLoading(false);
      }
    }

    fetchProfile();
    fetchReviews();
  }, [userId]);

  return (
    <div>
      <TopNav />

      <main className="profile-page profile-page-stacked">
        <Link className="profile-back-link" to={backLink}>
          <IoArrowBack aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>

        {loading && <p className="profile-page-message">Loading profile...</p>}
        {!loading && error && <p className="profile-page-error">{error}</p>}

        {!loading && !error && profile && (
          <>
            <ProfileCard profile={profile} />
            <UserReviews
              reviews={reviews}
              loading={reviewsLoading}
              error={reviewsError}
            />
          </>
        )}
      </main>
    </div>
  );
}
