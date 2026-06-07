import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IoCalendarOutline } from "react-icons/io5";
import httpClient from "../httpClient";
import ListingCard from "../components/ListingCard";
import TopNav from "../components/TopNav";
import "../styles/MyActivity.css";

const tabs = [
  { id: "ongoing", label: "Ongoing Activity" },
  { id: "lending", label: "Lending Activity" },
  { id: "history", label: "Activity History" },
  { id: "saved", label: "Saved Listings" },
];

const calendarEligibleStatuses = new Set(["approved", "borrowed"]);

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatus(status) {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getListingCoverImage(listing) {
  const images = Array.isArray(listing?.image_urls)
    ? listing.image_urls.filter(Boolean)
    : [];
  return images[0] || listing?.image_url || "";
}

function getInitialCalendarMessage() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const calendarConnected = hashParams.get("calendar_connected");
  const calendarError = hashParams.get("calendar_error");

  if (calendarConnected === "true") {
    return {
      type: "success",
      text: "Google Calendar connected. You can add the reservation now.",
    };
  }

  if (calendarError) {
    return {
      type: "error",
      text: calendarError,
    };
  }

  return null;
}

function markCalendarAdded(items, reservationId) {
  return items.map((item) =>
    item.id === reservationId ? { ...item, calendar_added: true } : item
  );
}

export default function MyActivity() {
  const [activeTab, setActiveTab] = useState("ongoing");
  const [ongoingActivity, setOngoingActivity] = useState([]);
  const [lendingActivity, setLendingActivity] = useState([]);
  const [activityHistory, setActivityHistory] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState(getInitialCalendarMessage);
  const [unauthorized, setUnauthorized] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [calendarActionId, setCalendarActionId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadActivity() {
      try {
        setLoading(true);
        const [ongoingRes, lendingRes, historyRes, savedRes] = await Promise.all([
          httpClient.get("/api/activity/ongoing"),
          httpClient.get("/api/activity/lending"),
          httpClient.get("/api/activity/history"),
          httpClient.get("/api/activity/saved"),
        ]);

        setOngoingActivity(ongoingRes.data);
        setLendingActivity(lendingRes.data);
        setActivityHistory(historyRes.data);
        setSavedListings(savedRes.data);
        setError(null);
      } catch (err) {
        if (err.response?.status === 401) {
          setUnauthorized(true);
          return;
        }
        setError(err.response?.data?.detail || "Failed to load your activity");
      } finally {
        setLoading(false);
      }
    }

    loadActivity();
  }, []);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const calendarConnected = hashParams.get("calendar_connected");
    const calendarError = hashParams.get("calendar_error");

    if (!calendarConnected && !calendarError) return;

    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const savedIds = useMemo(
    () => savedListings.map((listing) => listing.id),
    [savedListings]
  );

  const connectGoogleCalendar = async () => {
    const response = await httpClient.post("/api/calendar/connect-url", {
      return_path: window.location.pathname,
    });
    window.location.assign(response.data.auth_url);
  };

  const handleAddToCalendar = async (reservationId) => {
    try {
      setCalendarActionId(reservationId);
      setCalendarMessage(null);
      const response = await httpClient.post(
        `/api/calendar/reservations/${reservationId}/event`
      );
      setCalendarMessage({
        type: "success",
        text:
          response.data.events?.length > 1
            ? "Reservation dates added to Google Calendar."
            : response.data.message,
      });
      if (response.data.calendar_added) {
        setOngoingActivity((items) => markCalendarAdded(items, reservationId));
        setLendingActivity((items) => markCalendarAdded(items, reservationId));
        setActivityHistory((items) => markCalendarAdded(items, reservationId));
      }
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }

      if (err.response?.status === 409) {
        try {
          await connectGoogleCalendar();
        } catch (connectErr) {
          setCalendarMessage({
            type: "error",
            text:
              connectErr.response?.data?.detail ||
              "Failed to start Google Calendar connection",
          });
        }
        return;
      }

      setCalendarMessage({
        type: "error",
        text:
          err.response?.data?.detail ||
          "Failed to add reservation to Google Calendar",
      });
    } finally {
      setCalendarActionId(null);
    }
  };

  const handleToggleSave = async (listingId) => {
    try {
      setSavingId(listingId);
      await httpClient.delete(`/api/saved-listings/${listingId}`);
      setSavedListings((prev) =>
        prev.filter((listing) => listing.id !== listingId)
      );
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }
      setError(err.response?.data?.detail || "Failed to update saved listing");
    } finally {
      setSavingId(null);
    }
  };

  const renderActivityList = (items, emptyMessage) => {
    if (items.length === 0) {
      return <p className="activity-empty">{emptyMessage}</p>;
    }

    return (
      <div className="activity-list">
        {items.map((activity) => (
          <article className="activity-card" key={activity.id}>
            <div className={`activity-status activity-status-${activity.status}`}>
              {formatStatus(activity.status)}
            </div>
            <button
              type="button"
              className="activity-image-button"
              onClick={() => navigate(`/listings/${activity.listing_id}`)}
              aria-label={`View ${activity.listing.name}`}
            >
              {getListingCoverImage(activity.listing) ? (
                <img
                  src={getListingCoverImage(activity.listing)}
                  alt={activity.listing.name}
                />
              ) : (
                <span>No image</span>
              )}
            </button>
            <div className="activity-card-main">
              <h3>{activity.listing.name}</h3>
              <p>{activity.listing.description}</p>
              {activity.counterparty_name && (
                <p className="activity-counterparty">
                  {activeTab === "lending" ? "Borrower" : "Owner"}:{" "}
                  {activity.counterparty_name}
                </p>
              )}
              <div className="activity-meta">
                <span>
                  <IoCalendarOutline aria-hidden="true" />
                  {formatDate(activity.start_date)} - {formatDate(activity.end_date)}
                </span>
                <div className="activity-actions">
                  {calendarEligibleStatuses.has(activity.status) && (
                    <button
                      type="button"
                      onClick={() => handleAddToCalendar(activity.id)}
                      disabled={calendarActionId === activity.id || activity.calendar_added}
                    >
                      {activity.calendar_added
                        ? "Added to Calendar"
                        : calendarActionId === activity.id
                          ? "Adding..."
                          : "Add to Calendar"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/chats/${activity.room_id}`)}
                  >
                    Open Chat
                  </button>
                  {activeTab === "history" && activity.status === "returned" && (
                    <button
                      type="button"
                      onClick={() => navigate(`/reviews/reservations/${activity.id}`)}
                    >
                      Rate Item
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderSavedListings = () => {
    if (savedListings.length === 0) {
      return <p className="activity-empty">You have no saved listings yet.</p>;
    }

    return (
      <div className="listing-grid">
        {savedListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            isSaved={savedIds.includes(listing.id)}
            onToggleSave={handleToggleSave}
            saving={savingId === listing.id}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="activity-page-shell">
      <TopNav showSearch={false} />

      <main className="activity-page">
        <section className="activity-panel">
          <header className="activity-header">
            <div>
              <h1>My Activity</h1>
              <p>Track reservations, borrowing history, and saved listings.</p>
            </div>
          </header>

          <div className="activity-tabs" role="tablist" aria-label="Activity tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading && <p className="activity-empty">Loading your activity...</p>}

          {!loading && unauthorized && (
            <p className="activity-empty">
              Please <Link to="/login">log in</Link> to view your activity.
            </p>
          )}

          {!loading && !unauthorized && error && (
            <p className="activity-error">{error}</p>
          )}

          {!loading && !unauthorized && !error && calendarMessage && (
            <p
              className={
                calendarMessage.type === "error"
                  ? "activity-error"
                  : "activity-success"
              }
            >
              {calendarMessage.text}
            </p>
          )}

          {!loading && !unauthorized && !error && activeTab === "ongoing" &&
            renderActivityList(
              ongoingActivity,
              "You have no ongoing activity right now."
            )}

          {!loading && !unauthorized && !error && activeTab === "lending" &&
            renderActivityList(
              lendingActivity,
              "You have no active lending reservations right now."
            )}

          {!loading && !unauthorized && !error && activeTab === "history" &&
            renderActivityList(
              activityHistory,
              "You have no completed or cancelled activity yet."
            )}

          {!loading && !unauthorized && !error && activeTab === "saved" &&
            renderSavedListings()}
        </section>
      </main>
    </div>
  );
}
