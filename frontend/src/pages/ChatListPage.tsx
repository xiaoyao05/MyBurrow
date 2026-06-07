import { useEffect, useMemo, useState } from "react";
import { IoSearch, IoChatbubbleEllipsesOutline } from "react-icons/io5";
import ChatCard from "../components/ChatCard";
import ConfirmModal from "../components/ConfirmModal";
import TopNav from "../components/TopNav";
import httpClient from "../httpClient";
import "../styles/Chat.css";

export default function ChatListPage() {
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    async function fetchChats() {
      try {
        setLoading(true);
        const res = await httpClient.get("/api/chat/chats");
        setRooms(res.data);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load chats");
      } finally {
        setLoading(false);
      }
    }

    fetchChats();
  }, []);

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rooms;

    return rooms.filter((room) => {
      const listingName = room.listing_name?.toLowerCase() || "";
      const name = room.other_user?.name?.toLowerCase() || "";
      const latest = room.latest_message?.content?.toLowerCase() || "";
      return (
        listingName.includes(term) ||
        name.includes(term) ||
        latest.includes(term)
      );
    });
  }, [rooms, search]);

  const confirmDeleteChat = async () => {
    if (!pendingDeleteRoom) return;

    try {
      setDeleteBusy(true);
      await httpClient.delete(`/api/chat/${pendingDeleteRoom.room_id}`);
      setRooms((currentRooms) =>
        currentRooms.filter((room) => room.room_id !== pendingDeleteRoom.room_id)
      );
      setPendingDeleteRoom(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete chat");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="chat-shell">
      <TopNav showSearch={false} />

      <main className="chat-list-page">
        <section className="chat-list-panel" aria-label="Chats">
          <header className="chat-list-header">
            <div>
              <h1>Chats</h1>
            </div>
          </header>

          <label className="chat-search">
            <IoSearch aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
            />
          </label>

          {loading && <p className="chat-state">Loading chats...</p>}
          {error && <p className="chat-state chat-error">{error}</p>}

          {!loading && !error && filteredRooms.length === 0 && (
            <div className="chat-empty">
              <IoChatbubbleEllipsesOutline aria-hidden="true" />
              <h2>No chats found</h2>
              <p>Your conversations will appear here.</p>
            </div>
          )}

          {!loading && !error && filteredRooms.length > 0 && (
            <div className="chat-card-list">
              {filteredRooms.map((room) => (
                <ChatCard
                  key={room.room_id}
                  room={room}
                  onDelete={setPendingDeleteRoom}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {pendingDeleteRoom && (
        <ConfirmModal
          title="Delete Chat"
          message={`Delete the chat with ${
            pendingDeleteRoom.other_user?.name || "this user"
          }? It will be removed from your chat list.`}
          confirmLabel="Delete"
          danger
          busy={deleteBusy}
          onConfirm={confirmDeleteChat}
          onCancel={() => setPendingDeleteRoom(null)}
        />
      )}
    </div>
  );
}
