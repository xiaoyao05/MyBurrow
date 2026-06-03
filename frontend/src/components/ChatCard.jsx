import { Link } from "react-router-dom";
import { FaTrashAlt } from "react-icons/fa";
import ProfileAvatar from "./ProfileAvatar";

function formatMessageTime(value) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatCard({ room, onDelete }) {
  const otherUser = room.other_user || {};
  const latestMessage = room.latest_message;
  const listingName = room.listing_name || "Listing chat";
  const otherUserName = otherUser.name || "Chat";
  const preview = latestMessage?.content || "No messages yet";
  const unreadCount = room.unread_count || 0;

  return (
    <div className="chat-card">
      <Link className="chat-card-link" to={`/chats/${room.room_id}`}>
        <ProfileAvatar
          name={otherUserName}
          src={otherUser.profile_picture}
          size="small"
          className="chat-avatar"
        />

        <div className="chat-card-main">
          <div className="chat-card-top">
            <h3>{otherUserName}</h3>
            <time>{formatMessageTime(latestMessage?.created_at)}</time>
          </div>

          <p className="chat-card-subtitle">Item: {listingName}</p>

          <div className="chat-card-bottom">
            <p className={latestMessage ? "" : "chat-muted"}>{preview}</p>
            {unreadCount > 0 && (
              <span className="chat-unread-count">{unreadCount}</span>
            )}
          </div>
        </div>
      </Link>

      <button
        type="button"
        className="chat-card-delete-button"
        onClick={() => onDelete(room)}
        aria-label={`Delete chat with ${otherUserName}`}
        title="Delete chat"
      >
        <FaTrashAlt aria-hidden="true" />
      </button>
    </div>
  );
}
