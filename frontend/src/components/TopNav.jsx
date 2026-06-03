import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaFilter, FaSearch } from "react-icons/fa";
import MyBurrow from "/assets/MyBurrow.png";
import "../styles/TopNav.css";
import httpClient from "../httpClient";

const TopNav = ({
  statusfilter, setStatusFilter,
  categoryfilter, setCategoryFilter,
  locationfilter, setLocationFilter,
  statusOptions = [], categoryOptions = [], locationOptions = [], //default to empty to avoid undefined if parent does not pass any options
  clearFilters,
  searchValue = "",
  onSearchChange,
  showSearch = false,
}) => {
    const navigate = useNavigate();
    const [showFilters, setShowFilters] = useState(false);
    const filterRef = useRef(null); //useRef does not trigger re-render when updated
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef(null);
    const [error, setError] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!showFilters) return;
        const handleClickOutside = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setShowFilters(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showFilters]);

    useEffect(() => {
        if (!showSettings) return;
        const handleClickOutside = (e) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target)) {
                setShowSettings(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showSettings]);

    useEffect(() => {
        let cancelled = false;

        async function refreshUnreadMessages() {
          if (!localStorage.getItem("token")) {
            setError("login");
            setUnreadCount(0);
            return;
          }

          try {
            const unreadRes = await httpClient.get("/api/chat/unread/messages");

            if (!cancelled) {
              setUnreadCount(unreadRes.data.length);
              setError(null);
            }
          } catch {
            if (!cancelled) {
              setError("login");
              setUnreadCount(0);
            }
          }
        }

        refreshUnreadMessages();

        const intervalId = window.setInterval(refreshUnreadMessages, 30000);
        window.addEventListener("focus", refreshUnreadMessages);

        return () => {
          cancelled = true;
          window.clearInterval(intervalId);
          window.removeEventListener("focus", refreshUnreadMessages);
        };
      }, []);

    async function handleProfile(){
        setShowSettings(false);
        const res = await httpClient.get("/api/auth/me");
        navigate("/myprofile", {state: {email: res.data.email}});
    }

    function handleLogout() {
        localStorage.removeItem("token");
        setError("login");
        setUnreadCount(0);
        navigate("/home");
    }

  return (
    <nav className="top-nav">
      <div className="nav-container">
        <Link className="app-logo" to="/home" aria-label="Go to home">
            <img src={MyBurrow} alt="My Burrow Logo" />
        </Link>

        <span className="nav-menu">
          <button className="nav-button" onClick={() => navigate("/home")}>
            Home
          </button>
          <button className="nav-button nav-chat-button" onClick={() => navigate("/chats")}>
            Chats
            {unreadCount > 0 && (
              <span className="nav-unread-badge">{unreadCount}</span>
            )}
          </button>
          <div className="settings-wrapper" ref={settingsRef}>
          <button className="nav-button" onClick={() => setShowSettings(!showSettings)}>
            Settings
          </button>
          {showSettings && (
              <div className="settings-dropdown">
                <button onClick={handleProfile}>My Profile</button>
                <button onClick={() => navigate("/mylistings")}>My Listings</button>
                <button onClick={() => navigate("/myactivity")}>My Activity</button>
              </div>
            )}
          </div>
        </span>

        {showSearch && <div className="search-bar" ref={filterRef}>
          <FaSearch size={18} className="search-icon" />
          <input
            type="search"
            placeholder="Search listings..."
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            aria-label="Search listings"
          />

          <button
            type="button"
            className="filter-button"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Open listing filters"
            aria-expanded={showFilters}
            aria-controls="listing-filters"
          >
            <FaFilter size={16} aria-hidden="true" />
          </button>
            {showFilters && <div className="filters-bar" id="listing-filters">
                <div>
                    <label htmlFor="statusFilter">Status</label>
                    <select
                        id="statusFilter"
                        value={statusfilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        {statusOptions.map((s) => (
                        <option key={s} value={s}>
                            {s === "ALL" ? "All statuses" : s}
                        </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="categoryFilter">Category</label>
                    <select
                        id="categoryFilter"
                        value={categoryfilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                            {c === "ALL" ? "All categories" : c}
                        </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="locationFilter">Location</label>
                    <select
                        id="locationFilter"
                        value={locationfilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                    >
                        {locationOptions.map((l) => (
                        <option key={l} value={l}>
                            {l === "ALL" ? "All locations" : l}
                        </option>
                        ))}
                    </select>
                </div>

                <button onClick={clearFilters}>Clear Filters</button>
            </div>
            }
        </div>}
        <div className="nav-right">
          <button className="nav-create-listings" onClick={() => navigate("/listingform")}>
            List
          </button>
          {error === "login" ? (
            <button className="nav-button" onClick={() => navigate("/login")}>
              Log In
            </button>
          ) : (
          <button className="nav-logout" onClick={handleLogout}>
            Log Out
          </button>
          )}
        </div>
      </div>
    </nav>
    );
};

export default TopNav;
