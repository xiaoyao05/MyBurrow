import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import RegisterForm from "./pages/RegisterForm";
import MyProfile from "./pages/MyProfile";
import Home from "./pages/Home";
import ListingForm from "./pages/ListingForm";
import MyListings from "./pages/MyListings";
import MyActivity from "./pages/MyActivity";
import ChatListPage from "./pages/ChatListPage";
import ChatRoomPage from "./pages/ChatRoomPage";
import ListingDetails from "./pages/ListingDetails";
import ReviewForm from "./pages/ReviewForm";
import UserProfile from "./pages/UserProfile";

export default function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registerform" element={<RegisterForm />} />
        <Route path="/myprofile" element={<MyProfile />} />
        <Route path="/profile/:userId" element={<UserProfile />} />
        <Route path="/home" element={<Home />} />
        <Route path="/listings/:id" element={<ListingDetails />} />
        <Route path="/reviews/reservations/:reservationId" element={<ReviewForm />} />
        <Route path="/listingform" element={<ListingForm />} />
        <Route path="/listing/:id/edit" element={<ListingForm />} />
        <Route path="/mylistings" element={<MyListings />} />
        <Route path="/myactivity" element={<MyActivity />} />
        <Route path="/myprofile/edit" element={<RegisterForm />} />
        <Route path="/chats" element={<ChatListPage />} />
        <Route path="/chats/:roomId" element={<ChatRoomPage />} />
      </Routes>
    </BrowserRouter>
  );
};
