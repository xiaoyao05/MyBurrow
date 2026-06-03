import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { IoArrowBack } from "react-icons/io5";
import ChatRoom from "../components/ChatRoom";
import TopNav from "../components/TopNav";
import httpClient from "../httpClient";
import "../styles/Chat.css";

function ChatRoomPage() {
  const { roomId } = useParams();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const res = await httpClient.get("/api/auth/me");
        setCurrentUserId(Number(res.data));
        setError(null);
      } catch (err) {
        setError(err.response?.data?.detail || "Please log in to chat");
      }
    }

    fetchCurrentUser();
  }, []);

  return (
    <div className="chat-shell">
      <TopNav showSearch={false} />

      <main className="chat-room-page">
        <Link className="chat-back-link" to="/chats" aria-label="Back to chats">
          <IoArrowBack aria-hidden="true" />
          <span>Chats</span>
        </Link>

        {error && <p className="chat-state chat-error">{error}</p>}
        {!error && currentUserId !== null && (
          <ChatRoom
            key={roomId}
            roomId={roomId}
            currentUserId={currentUserId}
          />
        )}
      </main>
    </div>
  );
}

export default ChatRoomPage;
