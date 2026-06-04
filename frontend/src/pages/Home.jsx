import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import httpClient from "../httpClient";
import ListingCard from "../components/ListingCard";
import TopNav from "../components/TopNav";
import "../styles/Home.css";

export default function Home() {
  const [listings, setListings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusfilter, setStatusFilter] = useState("ALL");
  const [categoryfilter, setCategoryFilter] = useState("ALL");
  const [locationfilter, setLocationFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedIds, setSavedIds] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const response = await httpClient.get("/api/listings");
        setListings(response.data);

        try {
          const savedResponse = await httpClient.get("/api/saved-listings/ids");
          setSavedIds(savedResponse.data);
        } catch {
          setSavedIds([]);
        }
      } catch {
        setError("Failed to fetch listings");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleToggleSave = async (listingId) => {
    const isSaved = savedIds.includes(listingId);

    try {
      setSavingId(listingId);
      setSaveError(null);
      if (isSaved) {
        await httpClient.delete(`/api/saved-listings/${listingId}`);
        setSavedIds((prev) => prev.filter((id) => id !== listingId));
      } else {
        await httpClient.post(`/api/saved-listings/${listingId}`);
        setSavedIds((prev) =>
          prev.includes(listingId) ? prev : [...prev, listingId]
        );
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setSaveError("Please log in to save listings");
        return;
      }
      setSaveError(err.response?.data?.detail || "Failed to update saved listing");
    } finally {
      setSavingId(null);
    }
  };

  const statusOptions = useMemo(() => {
    const s = new Set();
    for (const listing of listings) s.add(listing.status || "Available");
    return ["ALL", ...Array.from(s).sort()];
  }, [listings]);

  const categoryOptions = useMemo(() => {
    const s = new Set();
    for (const listing of listings) s.add(listing.category || "Other");
    return ["ALL", ...Array.from(s).sort()];
  }, [listings]);

  const locationOptions = useMemo(() => {
    const s = new Set();
    for (const listing of listings) s.add(listing.location || "Other");
    return ["ALL", ...Array.from(s).sort()];
  }, [listings]);

  const clearFilters = () => {
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setLocationFilter("ALL");
  };

  const filteredListings = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();

    return listings.filter((l) => {
      const statusMatch = statusfilter === "ALL" || (l.status || "Available") === statusfilter;
      const categoryMatch = categoryfilter === "ALL" || (l.category || "Other") === categoryfilter;
      const locationMatch = locationfilter === "ALL" || (l.location || "Other") === locationfilter;
      const searchableText = [
        l.name,
        l.description,
        l.category,
        l.location,
        l.status,
        l.owner?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const searchMatch = !term || searchableText.includes(term);

      return statusMatch && categoryMatch && locationMatch && searchMatch;
    });
  }, [listings, statusfilter, categoryfilter, locationfilter, searchQuery]);

  return (
    <div>
      <TopNav
        statusfilter={statusfilter}
        setStatusFilter={setStatusFilter}
        categoryfilter={categoryfilter}
        setCategoryFilter={setCategoryFilter}
        locationfilter={locationfilter}
        setLocationFilter={setLocationFilter}
        statusOptions={statusOptions}
        categoryOptions={categoryOptions}
        locationOptions={locationOptions}
        clearFilters={clearFilters}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch
      />

      <section className="home-overview" aria-labelledby="home-overview-title">
        <div>
          <h1 id="home-overview-title">MyBurrow</h1>
          <p>
            MyBurrow is an item-sharing app for lending and borrowing everyday
            items. Users can create listings, browse available items, chat with
            other users, request reservations, track borrowing activity, and
            review completed experiences.
          </p>
        </div>

        <p className="home-data-note">
          Google account data is used for sign-in when you choose Google login.
          Google Calendar access is used only to add reservation dates to your
          calendar when you connect it.
        </p>
      </section>

      {loading && <p className="page-message">Loading listings...</p>}

      {!loading && error && <p className="page-message page-message-error">{error}</p>}

      {!loading && !error && (
        <>
        {saveError && (
          <p className="page-message page-message-error">{saveError}</p>
        )}
        {filteredListings.length === 0 ? (
          <div className="empty-state">
            <h2>No listings found</h2>
            <p>Try a different search term or clear the current filters.</p>
          </div>
        ) : (
          <div className="listing-grid">
            {filteredListings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                isSaved={savedIds.includes(l.id)}
                onToggleSave={handleToggleSave}
                saving={savingId === l.id}
              />
            ))}
          </div>
        )}
        </>
      )}
      <footer className="home-footer">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </footer>
      </div>
  );
}
