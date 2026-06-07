import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  IoCalendarOutline,
  IoCheckmarkCircleOutline,
  IoCheckmarkDone,
  IoChevronBack,
  IoChevronForward,
  IoClose,
  IoPaperPlane,
} from "react-icons/io5";
import { FaTrashAlt } from "react-icons/fa";
import ConfirmModal from "./ConfirmModal";
import ProfileAvatar from "./ProfileAvatar";
import httpClient, { getWebSocketUrl } from "../httpClient";
import { parseUtcDate } from "../utils/dateTime";
import type {
  ChatMessage,
  DateRange,
  EntityId,
  ReservationContext,
  ReservationStatus,
} from "../types";

type ChatRoomProps = {
  roomId: EntityId;
  currentUserId: EntityId;
};

type CalendarMessage = {
  type: "success" | "error";
  text: string;
};

type MessageContextMenu = {
  x: number;
  y: number;
  message: ChatMessage;
};

type ReservationAction = "approve" | "cancel" | "confirm-borrow" | "confirm-return";

type PendingConfirmation = {
  action: ReservationAction;
  title: string;
  message: string;
  confirmLabel: string;
};

type ChatSocketEvent =
  | { type: "message_updated"; message: ChatMessage }
  | { type: "message_deleted"; message_id: EntityId }
  | { type: "messages_read"; message_ids?: EntityId[] }
  | ChatMessage;

type CalendarEventResponse = {
  message: string;
  calendar_added: boolean;
  events?: unknown[];
};

type CalendarConnectResponse = {
  auth_url: string;
};

type AiDraftResponse = {
  draft: string;
};

function formatBubbleTime(value?: string | null) {
  if (!value) return "";

  return parseUtcDate(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value?: string | null) {
  const date = parseDateKey(value);
  if (!date) return "";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderMessageContent(content: string): ReactNode[] {
  const parts = content.split(/(\s+)/);

  return parts.map((part, index) => {
    if (part.startsWith("/reviews/reservations/")) {
      return (
        <Link key={`${part}-${index}`} to={part} className="chat-message-link">
          Rate this item here
        </Link>
      );
    }

    return part;
  });
}

function readHiddenMessageIds(currentUserId: EntityId, roomId: EntityId): EntityId[] {
  const storageKey = `hidden-chat-message-ids:${currentUserId}:${roomId}`;

  try {
    const savedIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(savedIds) ? savedIds : [];
  } catch {
    return [];
  }
}

function isDateWithinRange(dateKey: string, range: DateRange) {
  return dateKey >= range.start_date && dateKey <= range.end_date;
}

function rangesOverlap(startDate: string, endDate: string, ranges: DateRange[]) {
  if (!startDate || !endDate) return false;
  return ranges.some(
    (range) => startDate <= range.end_date && endDate >= range.start_date
  );
}

function buildCalendarDays(monthDate: Date): Array<Date | null> {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingDays = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let index = 0; index < leadingDays; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }

  return days;
}

const calendarEligibleStatuses = new Set<ReservationStatus>(["approved", "borrowed"]);

export default function ChatRoom({ roomId, currentUserId }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setIsConnected] = useState(false);
  const [reservationContext, setReservationContext] = useState<ReservationContext | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationBusy, setReservationBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<CalendarMessage | null>(() => {
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
  });
  const [isReserveOpen, setIsReserveOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<MessageContextMenu | null>(null);
  const [pendingMessageDelete, setPendingMessageDelete] = useState<ChatMessage | null>(null);
  const [deleteForMe, setDeleteForMe] = useState(true);
  const [deleteForOtherUser, setDeleteForOtherUser] = useState(false);
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState(() =>
    readHiddenMessageIds(currentUserId, roomId)
  );
  const [selectedStart, setSelectedStart] = useState("");
  const [selectedEnd, setSelectedEnd] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const socketRef = useRef<WebSocket | null>(null);
  const loadingRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const currentReservation = reservationContext?.current_reservation;
  const listingName = reservationContext?.listing_name || "Listing chat";
  const otherUserName = reservationContext?.other_user?.name || "Chat participant";
  const otherUserId = reservationContext?.other_user?.id;
  const otherUserProfilePicture = reservationContext?.other_user?.profile_picture;
  const isBorrower = reservationContext?.borrower_id === currentUserId;
  const isOwner = reservationContext?.lender_id === currentUserId;
  const calendarAdded = Boolean(
    currentReservation &&
      (isBorrower
        ? currentReservation.borrower_calendar_added
        : currentReservation.lender_calendar_added)
  );
  const activeBlockedRanges = reservationContext?.blocked_ranges || [];
  const todayKey = toDateKey(new Date());
  const unavailableUntilKey =
    reservationContext?.listing_status === "Unavailable"
      ? reservationContext?.listing_due_date
      : null;
  const isFullyUnavailable =
    reservationContext?.listing_status === "Unavailable" &&
    !unavailableUntilKey &&
    !currentReservation;
  const canReserve = isBorrower && !currentReservation && !isFullyUnavailable;
  const selectedRangeBlocked = rangesOverlap(
    selectedStart,
    selectedEnd || selectedStart,
    activeBlockedRanges
  );
  const hiddenMessageStorageKey = `hidden-chat-message-ids:${currentUserId}:${roomId}`;

  const sortedMessages = useMemo(() => {
    const hiddenIds = new Set(hiddenMessageIds);

    return messages
      .filter((msg) => !hiddenIds.has(msg.id))
      .sort(
        (a, b) =>
          parseUtcDate(a.created_at).getTime() -
          parseUtcDate(b.created_at).getTime()
      );
  }, [hiddenMessageIds, messages]);

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth]
  );

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const calendarConnected = hashParams.get("calendar_connected");
    const calendarError = hashParams.get("calendar_error");

    if (calendarConnected === "true" || calendarError) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const res = await httpClient.get<ChatMessage[]>(`/api/chat/${roomId}/messages`);
        setMessages(res.data);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    if (roomId) loadMessages();
  }, [roomId]);

  const loadReservationContext = useCallback(async () => {
    try {
      const res = await httpClient.get<ReservationContext>(`/api/chat/${roomId}/reservation`);
      setReservationContext(res.data);
      setReservationError(null);
    } catch (err) {
      setReservationError(
        err.response?.data?.detail || "Failed to load reservation details"
      );
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return undefined;

    const timeoutId = window.setTimeout(() => {
      loadReservationContext();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [roomId, loadReservationContext]);

  useEffect(() => {
    if (!roomId) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const ws = new WebSocket(
      getWebSocketUrl(`/api/chat/ws/${roomId}?token=${encodeURIComponent(token)}`)
    );

    socketRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      const newMessage = JSON.parse(event.data) as ChatSocketEvent;

      if ("type" in newMessage && newMessage.type === "message_updated") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === newMessage.message.id ? newMessage.message : msg
          )
        );
        return;
      }

      if ("type" in newMessage && newMessage.type === "message_deleted") {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== newMessage.message_id)
        );
        return;
      }

      if ("type" in newMessage && newMessage.type === "messages_read") {
        const readMessageIds = new Set(newMessage.message_ids || []);
        setMessages((prev) =>
          prev.map((msg) =>
            readMessageIds.has(msg.id) ? { ...msg, is_read: true } : msg
          )
        );
        return;
      }

      setMessages((prev) => {
        if (prev.some((msg) => msg.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      loadReservationContext();
    };

    ws.onerror = () => {
      if (!loadingRef.current) {
        setError("Live chat connection failed");
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId, loadReservationContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  const hideMessageForMe = (messageId: EntityId) => {
    setHiddenMessageIds((currentIds) => {
      if (currentIds.includes(messageId)) return currentIds;

      const nextIds = [...currentIds, messageId];
      localStorage.setItem(hiddenMessageStorageKey, JSON.stringify(nextIds));
      return nextIds;
    });
  };

  const sendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    if (editingMessage) {
      try {
        setMessageActionBusy(true);
        const response = await httpClient.patch<ChatMessage>(
          `/api/chat/${roomId}/messages/${editingMessage.id}`,
          { content: trimmedMessage }
        );
        setMessages((prev) =>
          prev.map((msg) => (msg.id === editingMessage.id ? response.data : msg))
        );
        setEditingMessage(null);
        setMessage("");
        setAiDraftError(null);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to edit message");
      } finally {
        setMessageActionBusy(false);
      }
      return;
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          content: trimmedMessage,
        })
      );

      setMessage("");
      setAiDraftError(null);
      return;
    }

    try {
      setMessageActionBusy(true);
      const response = await httpClient.post<ChatMessage>(`/api/chat/${roomId}/messages`, {
        content: trimmedMessage,
      });
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === response.data.id)) return prev;
        return [...prev, response.data];
      });
      setMessage("");
      setAiDraftError(null);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to send message");
    } finally {
      setMessageActionBusy(false);
    }
  };

  const openMessageMenu = (e: MouseEvent<HTMLElement>, msg: ChatMessage) => {
    e.preventDefault();
    if (msg.is_system) {
      setContextMenu(null);
      return;
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message: msg,
    });
  };

  const startEditMessage = (msg: ChatMessage) => {
    setEditingMessage(msg);
    setMessage(msg.content);
    setContextMenu(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const startDeleteMessage = (msg: ChatMessage) => {
    setPendingMessageDelete(msg);
    setDeleteForMe(true);
    setDeleteForOtherUser(false);
    setContextMenu(null);
  };

  const confirmDeleteMessage = async () => {
    if (!pendingMessageDelete) return;

    try {
      setMessageActionBusy(true);

      if (deleteForOtherUser) {
        await httpClient.delete(
          `/api/chat/${roomId}/messages/${pendingMessageDelete.id}`
        );
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== pendingMessageDelete.id)
        );
      } else if (deleteForMe) {
        hideMessageForMe(pendingMessageDelete.id);
      }

      setPendingMessageDelete(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete message");
    } finally {
      setMessageActionBusy(false);
    }
  };

  const draftChatReply = async () => {
    try {
      setAiDraftLoading(true);
      setAiDraftError(null);
      setAiDraft("");
      const response = await httpClient.post<AiDraftResponse>("/api/ai/draft", {
        mode: "chat_reply",
        input: message.trim(),
        tone: "friendly",
        context_ref: {
          type: "chat_room",
          room_id: Number(roomId),
        },
      });
      setAiDraft(response.data.draft);
    } catch (err) {
      setAiDraftError(
        err.response?.data?.detail || "Failed to draft a reply"
      );
    } finally {
      setAiDraftLoading(false);
    }
  };

  const acceptAiDraft = () => {
    setMessage(aiDraft);
    setAiDraft("");
    setAiDraftError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const shiftVisibleMonth = (amount: number) => {
    setVisibleMonth((current) => {
      return new Date(current.getFullYear(), current.getMonth() + amount, 1);
    });
  };

  const isDateDisabled = (date: Date) => {
    const dateKey = toDateKey(date);

    if (dateKey < todayKey) return true;
    if (isFullyUnavailable) return true;
    if (unavailableUntilKey && dateKey <= unavailableUntilKey) return true;

    return activeBlockedRanges.some((range) => isDateWithinRange(dateKey, range));
  };

  const handleDateClick = (date: Date) => {
    if (isDateDisabled(date)) return;

    const dateKey = toDateKey(date);

    if (!selectedStart || selectedEnd || dateKey < selectedStart) {
      setSelectedStart(dateKey);
      setSelectedEnd("");
      return;
    }

    setSelectedEnd(dateKey);
  };

  const submitReservation = async () => {
    const endDate = selectedEnd || selectedStart;

    if (!selectedStart || !endDate || selectedRangeBlocked) return;

    try {
      setReservationBusy(true);
      await httpClient.post(`/api/chat/${roomId}/reservations`, {
        start_date: selectedStart,
        end_date: endDate,
      });
      await loadReservationContext();
      setIsReserveOpen(false);
      setSelectedStart("");
      setSelectedEnd("");
      setReservationError(null);
    } catch (err) {
      setReservationError(
        err.response?.data?.detail || "Failed to reserve listing"
      );
    } finally {
      setReservationBusy(false);
    }
  };

  const runReservationAction = async (action: ReservationAction) => {
    if (!currentReservation) return;

    try {
      setReservationBusy(true);
      await httpClient.post(
        `/api/chat/${roomId}/reservations/${currentReservation.id}/${action}`
      );
      await loadReservationContext();
      setReservationError(null);
    } catch (err) {
      setReservationError(
        err.response?.data?.detail || "Failed to update reservation"
      );
    } finally {
      setReservationBusy(false);
    }
  };

  const confirmReservationAction = () => {
    if (!pendingConfirmation) return;
    const action = pendingConfirmation.action;

    setPendingConfirmation(null);
    runReservationAction(action);
  };

  const connectGoogleCalendar = async () => {
    const response = await httpClient.post<CalendarConnectResponse>("/api/calendar/connect-url", {
      return_path: window.location.pathname,
    });
    window.location.assign(response.data.auth_url);
  };

  const addReservationToCalendar = async () => {
    if (!currentReservation) return;

    try {
      setCalendarBusy(true);
      setCalendarMessage(null);
      const response = await httpClient.post<CalendarEventResponse>(
        `/api/calendar/reservations/${currentReservation.id}/event`
      );
      setCalendarMessage({
        type: "success",
        text:
          response.data.events?.length > 1
            ? "Reservation dates added to Google Calendar."
            : response.data.message,
      });
      if (response.data.calendar_added) {
        await loadReservationContext();
      }
    } catch (err) {
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
      setCalendarBusy(false);
    }
  };

  const reservationSummary = currentReservation
    ? `${formatDisplayDate(currentReservation.start_date)} to ${formatDisplayDate(
        currentReservation.end_date
      )}`
    : "";
  const ownerHasReservationActions =
    isOwner &&
    currentReservation &&
    ["pending", "approved", "borrowed"].includes(currentReservation.status);
  const borrowerHasReservationActions =
    isBorrower &&
    (canReserve ||
      (currentReservation &&
        ["pending", "approved"].includes(currentReservation.status)));
  const canAddReservationToCalendar =
    currentReservation &&
    calendarEligibleStatuses.has(currentReservation.status);

  const renderOwnerReservationActions = (className = "owner-reservation-actions") => {
    if (!isOwner || !currentReservation) return null;

    return (
      <div className={className}>
        {currentReservation.status === "pending" && (
          <button
            type="button"
            onClick={() => runReservationAction("approve")}
            disabled={reservationBusy}
          >
            <IoCheckmarkCircleOutline aria-hidden="true" />
            <span>Approve</span>
          </button>
        )}

        {["pending", "approved"].includes(currentReservation.status) && (
          <button
            type="button"
            onClick={() =>
              setPendingConfirmation({
                action: "confirm-borrow",
                title: "Confirm Borrow",
                message: "Confirm that this item has been handed over to the borrower?",
                confirmLabel: "Confirm Borrow",
              })
            }
            disabled={reservationBusy}
          >
            <IoCheckmarkDone aria-hidden="true" />
            <span>Confirm Borrow</span>
          </button>
        )}

        {currentReservation.status === "borrowed" && (
          <button
            type="button"
            onClick={() =>
              setPendingConfirmation({
                action: "confirm-return",
                title: "Confirm Return",
                message: "Confirm that this item has been returned?",
                confirmLabel: "Confirm Return",
              })
            }
            disabled={reservationBusy}
          >
            <IoCheckmarkCircleOutline aria-hidden="true" />
            <span>Confirm Return</span>
          </button>
        )}

        {["pending", "approved"].includes(currentReservation.status) && (
          <button
            type="button"
            className="reservation-danger-button"
            onClick={() => runReservationAction("cancel")}
            disabled={reservationBusy}
          >
            <IoClose aria-hidden="true" />
            <span>Cancel</span>
          </button>
        )}
      </div>
    );
  };

  const renderBorrowerReservationActions = () => {
    if (!isBorrower) return null;

    return (
      <div className="owner-reservation-actions chat-reservation-dock-actions">
        {canReserve && (
          <button
            type="button"
            onClick={() => setIsReserveOpen(true)}
          >
            <IoCalendarOutline aria-hidden="true" />
            <span>Reserve Listing</span>
          </button>
        )}

        {currentReservation &&
          ["pending", "approved"].includes(currentReservation.status) && (
          <button
            type="button"
            className="reservation-danger-button"
            onClick={() => runReservationAction("cancel")}
            disabled={reservationBusy}
          >
            <IoClose aria-hidden="true" />
            <span>Cancel Request</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="chat-room" aria-label="Chat room">
      <header className="chat-room-header">
        {otherUserId ? (
          <Link
            className="chat-room-person chat-room-header-link"
            to={`/profile/${otherUserId}`}
            state={{ fromChatRoomId: roomId }}
          >
            <ProfileAvatar
              name={otherUserName}
              src={otherUserProfilePicture}
              size="chatHeader"
              className="chat-room-avatar"
            />
            <div>
              <h1>{otherUserName}</h1>
              <p>Item: {listingName}</p>
            </div>
          </Link>
        ) : (
          <div className="chat-room-person chat-room-header-link">
            <ProfileAvatar
              name={otherUserName}
              src={otherUserProfilePicture}
              size="chatHeader"
              className="chat-room-avatar"
            />
            <div>
              <h1>{otherUserName}</h1>
              <p>Item: {listingName}</p>
            </div>
          </div>
        )}
      </header>

      {reservationError && (
        <p className="reservation-inline-error">{reservationError}</p>
      )}

      {calendarMessage && (
        <p
          className={
            calendarMessage.type === "error"
              ? "reservation-inline-error"
              : "reservation-inline-success"
          }
        >
          {calendarMessage.text}
        </p>
      )}

      <div className="chat-messages">
        {loading && <p className="chat-state">Loading chat...</p>}
        {error && <p className="chat-state chat-error">{error}</p>}

        {!loading &&
          sortedMessages.map((msg) => {
            const isMine = msg.sender_id === currentUserId;

            return (
              <article
                key={msg.id}
                className={`message-row ${isMine ? "message-row-own" : ""}`}
                onContextMenu={(e) => openMessageMenu(e, msg)}
              >
                <div className={`message-bubble ${isMine ? "message-own" : ""}`}>
                  <p>{renderMessageContent(msg.content)}</p>
                  <span>
                    {formatBubbleTime(msg.created_at)}
                    {isMine && msg.is_read && (
                      <IoCheckmarkDone aria-label="Seen" title="Seen" />
                    )}
                  </span>
                </div>
              </article>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {(ownerHasReservationActions || borrowerHasReservationActions || canAddReservationToCalendar) && (
        <section className="chat-reservation-dock" aria-label="Reservation actions">
          {currentReservation && (
            <div className="chat-reservation-dock-summary">
              <IoCalendarOutline aria-hidden="true" />
              <span>{reservationSummary}</span>
            </div>
          )}
          <div className="chat-reservation-dock-controls">
            {canAddReservationToCalendar && (
              <button
                type="button"
                className="reservation-calendar-button"
                onClick={addReservationToCalendar}
                disabled={calendarBusy || calendarAdded}
              >
                <IoCalendarOutline aria-hidden="true" />
                <span>
                  {calendarAdded
                    ? "Added to Calendar"
                    : calendarBusy
                      ? "Adding..."
                      : "Add to Calendar"}
                </span>
              </button>
            )}
            {renderOwnerReservationActions("owner-reservation-actions chat-reservation-dock-actions")}
            {renderBorrowerReservationActions()}
          </div>
        </section>
      )}

      <footer className="chat-composer">
        <div className="chat-composer-main">
          {editingMessage && (
            <div className="chat-editing-banner">
              <span>Editing message</span>
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setMessage("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {aiDraftError && <p className="chat-ai-draft-error">{aiDraftError}</p>}
          {aiDraft && (
            <section className="chat-ai-draft-preview" aria-label="AI chat reply draft">
              <p>{aiDraft}</p>
              <div>
                <button type="button" onClick={acceptAiDraft}>
                  Use Draft
                </button>
                <button type="button" onClick={() => setAiDraft("")}>
                  Discard
                </button>
              </div>
            </section>
          )}
          <textarea
            ref={composerRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            rows={1}
          />
        </div>

        <button
          type="button"
          className="chat-ai-draft-button"
          onClick={draftChatReply}
          disabled={aiDraftLoading || loading}
        >
          {aiDraftLoading ? "Drafting..." : "AI Draft"}
        </button>

        <button
          type="button"
          onClick={sendMessage}
          disabled={
            !message.trim() ||
            messageActionBusy
          }
          aria-label="Send message"
          title={editingMessage ? "Save edit" : "Send message"}
        >
          <IoPaperPlane aria-hidden="true" />
        </button>
      </footer>

      {contextMenu && (
        <>
          <button
            type="button"
            className="message-context-backdrop"
            aria-label="Close message options"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="message-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            {contextMenu.message.sender_id === currentUserId &&
              !contextMenu.message.is_system && (
              <button
                type="button"
                onClick={() => startEditMessage(contextMenu.message)}
                role="menuitem"
              >
                Edit
              </button>
            )}
            {!contextMenu.message.is_system && (
              <button
                type="button"
                onClick={() => startDeleteMessage(contextMenu.message)}
                role="menuitem"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {isReserveOpen && (
        <div className="reservation-modal-backdrop" role="presentation">
          <section
            className="reservation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-title"
          >
            <header>
              <div>
                <h2 id="reservation-title">Reserve Listing</h2>
                <p>
                  {selectedStart
                    ? `${formatDisplayDate(selectedStart)}${
                        selectedEnd ? ` to ${formatDisplayDate(selectedEnd)}` : ""
                      }`
                    : "Choose the borrowing dates"}
                </p>
              </div>

              <button
                type="button"
                className="reservation-icon-button"
                onClick={() => setIsReserveOpen(false)}
                aria-label="Close reservation dialog"
                title="Close"
              >
                <IoClose aria-hidden="true" />
              </button>
            </header>

            <div className="reservation-calendar-toolbar">
              <button
                type="button"
                className="reservation-icon-button"
                onClick={() => shiftVisibleMonth(-1)}
                aria-label="Previous month"
                title="Previous month"
              >
                <IoChevronBack aria-hidden="true" />
              </button>
              <strong>
                {visibleMonth.toLocaleDateString([], {
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              <button
                type="button"
                className="reservation-icon-button"
                onClick={() => shiftVisibleMonth(1)}
                aria-label="Next month"
                title="Next month"
              >
                <IoChevronForward aria-hidden="true" />
              </button>
            </div>

            <div className="reservation-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="reservation-calendar-grid">
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <span key={`empty-${index}`} aria-hidden="true" />;
                }

                const dateKey = toDateKey(date);
                const disabled = isDateDisabled(date);
                const selected =
                  dateKey === selectedStart || dateKey === selectedEnd;
                const inRange =
                  selectedStart &&
                  (selectedEnd || selectedStart) &&
                  dateKey >= selectedStart &&
                  dateKey <= (selectedEnd || selectedStart);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={[
                      "reservation-day",
                      selected ? "reservation-day-selected" : "",
                      inRange ? "reservation-day-in-range" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleDateClick(date)}
                    disabled={disabled}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {selectedRangeBlocked && (
              <p className="reservation-inline-error">
                That range includes unavailable or reserved dates.
              </p>
            )}

            <footer>
              <button
                type="button"
                className="reservation-secondary-button"
                onClick={() => {
                  setSelectedStart("");
                  setSelectedEnd("");
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="reservation-primary-button"
                onClick={submitReservation}
                disabled={
                  reservationBusy ||
                  !selectedStart ||
                  !selectedEnd ||
                  selectedRangeBlocked
                }
              >
                <IoCalendarOutline aria-hidden="true" />
                <span>Request Reservation</span>
              </button>
            </footer>
          </section>
        </div>
      )}

      {pendingConfirmation && (
        <ConfirmModal
          title={pendingConfirmation.title}
          message={pendingConfirmation.message}
          confirmLabel={pendingConfirmation.confirmLabel}
          busy={reservationBusy}
          onConfirm={confirmReservationAction}
          onCancel={() => setPendingConfirmation(null)}
        />
      )}

      {pendingMessageDelete && (
        <div className="reservation-modal-backdrop" role="presentation">
          <section
            className="message-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-delete-title"
          >
            <header>
              <div>
                <h2 id="message-delete-title">Delete Message</h2>
                <p>Choose where this message should be deleted.</p>
              </div>
            </header>

            <div className="message-delete-options">
              <label>
                <input
                  type="checkbox"
                  checked={deleteForMe}
                  onChange={(e) => setDeleteForMe(e.target.checked)}
                />
                <span>Delete for me</span>
              </label>
              <label
                className={
                  pendingMessageDelete.sender_id === currentUserId
                    ? ""
                    : "message-delete-option-disabled"
                }
              >
                <input
                  type="checkbox"
                  checked={deleteForOtherUser}
                  onChange={(e) => {
                    setDeleteForOtherUser(e.target.checked);
                    if (e.target.checked) setDeleteForMe(true);
                  }}
                  disabled={pendingMessageDelete.sender_id !== currentUserId}
                />
                <span>
                  Delete for {otherUserName}
                  {pendingMessageDelete.sender_id !== currentUserId
                    ? " (only your own messages)"
                    : ""}
                </span>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="reservation-secondary-button"
                onClick={() => setPendingMessageDelete(null)}
                disabled={messageActionBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="message-delete-confirm-button"
                onClick={confirmDeleteMessage}
                disabled={messageActionBusy || (!deleteForMe && !deleteForOtherUser)}
              >
                <FaTrashAlt aria-hidden="true" />
                <span>{messageActionBusy ? "Deleting..." : "Delete"}</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
