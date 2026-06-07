export type EntityId = number | string;

export type ApiErrorResponse = {
  detail?: string;
};

export type User = {
  id: EntityId;
  name?: string | null;
  email?: string | null;
  contact_number?: string | null;
  bio?: string | null;
  profile_picture?: string | null;
};

export type ListingStatus = "Available" | "Unavailable" | "Reserved" | string;
export type ReservationStatus =
  | "pending"
  | "approved"
  | "borrowed"
  | "returned"
  | "cancelled";

export type Listing = {
  id: EntityId;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  location?: string | null;
  price?: number | string | null;
  status?: ListingStatus | null;
  image_url?: string | null;
  image_urls?: Array<string | null | undefined> | null;
  owner_id?: EntityId | null;
  owner?: User | null;
  owner_name?: string | null;
  due_date?: string | null;
  unavailable_start_date?: string | null;
  unavailable_end_date?: string | null;
  expected_borrow_start_date?: string | null;
  expected_borrow_end_date?: string | null;
  rating_average?: number | string | null;
  ratingAverage?: number | string | null;
  rating_count?: number | null;
  ratingCount?: number | null;
};

export type Review = {
  id: EntityId;
  created_at?: string | null;
  owner_score?: number | string | null;
  owner_comment?: string | null;
  reviewer?: User | null;
};

export type ChatMessage = {
  id: EntityId;
  room_id?: EntityId;
  content: string;
  sender_id?: EntityId | null;
  created_at: string;
  is_read?: boolean;
  is_system?: boolean;
  updated_at?: string | null;
};

export type ChatRoomSummary = {
  room_id: EntityId;
  listing_name?: string | null;
  other_user?: User | null;
  latest_message?: ChatMessage | null;
  unread_count?: number | null;
};

export type DateRange = {
  start_date: string;
  end_date: string;
  status?: ReservationStatus | string;
};

export type Reservation = {
  id: EntityId;
  listing_id?: EntityId;
  room_id?: EntityId;
  borrower_id?: EntityId;
  lender_id?: EntityId;
  status?: ReservationStatus | null;
  borrower_calendar_added?: boolean | null;
  lender_calendar_added?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type ReservationContext = {
  room_id?: EntityId;
  listing_id?: EntityId;
  current_reservation?: Reservation | null;
  listing_name?: string | null;
  listing_status?: ListingStatus | null;
  listing_due_date?: string | null;
  borrower_id?: EntityId | null;
  lender_id?: EntityId | null;
  current_user_role?: string | null;
  other_user?: User | null;
  blocked_ranges?: DateRange[];
};
