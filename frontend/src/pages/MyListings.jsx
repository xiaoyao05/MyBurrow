import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import httpClient from "../httpClient";
import ListingCard from "../components/ListingCard";
import TopNav from "../components/TopNav";
import ConfirmModal from "../components/ConfirmModal";
import "../styles/MyListings.css";

export default function MyListings() {
    const [listings, setListings] = useState([]);
    const [busyId, setBusyId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authCheck, setAuthCheck] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);
    const [statusfilter, setStatusFilter] = useState("ALL");
    const [categoryfilter, setCategoryFilter] = useState("ALL");
    const [locationfilter, setLocationFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [pendingDeleteListing, setPendingDeleteListing] = useState(null);

    const navigate = useNavigate();

    useEffect(() => {
        async function init() {
          try {
            await httpClient.get("/api/auth/me");
          } catch {
            setUnauthorized(true);
          } finally {
            setAuthCheck(false);
          }
        }
        init();
      }, []);

    const handleDelete = async (id) => {
        try{
            setDeletingId(id);
            await httpClient.delete(`/api/listings/delete/${id}`);
            setListings((prev) =>
                prev.filter(
                    (listing) => listing.id !== id
                )
            );
        } catch {
            setError("Failed to delete listing");

        } finally {
            setDeletingId(null);
            setPendingDeleteListing(null);
        }
    };

    const handleEdit = (id) => {
        navigate(`/listing/${id}/edit`);
    };

    const handleAvailabilityChange = async (id, availability) => {
        try {
            setBusyId(id);
            setError(null);
            const response = await httpClient.patch(
                `/api/listings/${id}/availability`,
                availability
            );
            setListings((prev) =>
                prev.map((listing) =>
                    listing.id === id ? response.data : listing
                )
            );
        } catch (err) {
            setError(
                err.response?.data?.detail || "Failed to update listing availability"
            );
        } finally {
            setBusyId(null);
        }
    };

    useEffect(() => {
        if (unauthorized) return;
        async function fetchListings() {
            try {
                setLoading(true);
                const response = await httpClient.get("/api/listings/mylistings");
                setListings(response.data);
            } catch {
                setError("Failed to fetch listings");
            } finally {
                setLoading(false);
            }
        }
        fetchListings();
    }, [unauthorized]);

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
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            const searchMatch = !term || searchableText.includes(term);

            return statusMatch && categoryMatch && locationMatch && searchMatch;
        });
    }, [listings, statusfilter, categoryfilter, locationfilter, searchQuery]);

    const searchNav = (
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
    );

    if (authCheck || loading) {
        return (
            <div>
                {searchNav}
                {error && <p className="page-message page-message-error">{error}</p>}
                <p className="page-message">Loading your listings...</p>
            </div>
        );
    }

    if (unauthorized) {
        return (
            <div>
                {searchNav}
                <p className="page-message page-message-error">
                    Please <Link to="/login">log in</Link> to view your listings.
                </p>
            </div>
        );
    }

    return (
        <div className="my-listings-page">
            {searchNav}
            <main className="my-listings-content">
            <header className="my-listings-header">
                <div>
                    <h1>My Listings</h1>
                    <p>{filteredListings.length} of {listings.length} listings shown</p>
                </div>
                <button
                    type="button"
                    className="my-listings-create"
                    onClick={() => navigate("/listingform")}
                >
                    Add listing
                </button>
            </header>
            {error && <p className="page-message page-message-error">{error}</p>}
            {listings.length === 0 ? (
                <div className="empty-state">
                    <h2>No listings yet</h2>
                    <p>Create your first listing so others can borrow from you.</p>
                </div>
            ) : filteredListings.length === 0 ? (
                <div className="empty-state">
                    <h2>No listings found</h2>
                    <p>Try changing your search term or clearing the filters.</p>
                </div>
            ) : (
                <div className="my-listings-grid">
                    {filteredListings.map((l) => (
                        <ListingCard
                            key={l.id}
                            listing={l}
                            showOwner={false}
                            showChat={false}
                            showAvailabilityToggle
                            onAvailabilityChange={handleAvailabilityChange}
                            onDelete={() => setPendingDeleteListing(l)}
                            onEdit={handleEdit}
                            busy={busyId === l.id}
                            deleting={deletingId === l.id}
                        />
                    ))}
                </div>
            )}
            </main>
            {pendingDeleteListing && (
                <ConfirmModal
                    title="Delete Listing"
                    message={`Delete "${pendingDeleteListing.name}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    danger
                    busy={deletingId === pendingDeleteListing.id}
                    onConfirm={() => handleDelete(pendingDeleteListing.id)}
                    onCancel={() => setPendingDeleteListing(null)}
                />
            )}
        </div>
    );
}
