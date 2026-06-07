import { useCallback, useEffect, useState } from "react";
import httpClient from "../httpClient";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import ProfileCard from "../components/ProfileCard";
import ConfirmModal from "../components/ConfirmModal";
import UserReviews from "../components/UserReviews";
import "../styles/ProfileCard.css";
import { prepareImageFile } from "../utils/imageUpload";

export default function MyProfile() {
    const [profile, setProfile] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reviewsLoading, setReviewsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reviewsError, setReviewsError] = useState(null);
    const [unauthorized, setUnauthorized] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [uploadingPicture, setUploadingPicture] = useState(false);
    const navigate = useNavigate();

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            setReviewsLoading(true);
            const meRes = await httpClient.get("/api/auth/me");
            const userId = meRes.data;
            const [profileRes, reviewsRes] = await Promise.all([
                httpClient.get(`/api/profile/${userId}`),
                httpClient.get(`/api/reviews/users/${userId}`)
            ]);
            setProfile({ ...profileRes.data, user_id: userId });
            setReviews(reviewsRes.data);
            setReviewsError(null);
        } catch (err) {
            if (err.response?.status === 401) {
                setUnauthorized(true);
            } else {
                setError("Failed to fetch profile");
            }
        } finally {
            setLoading(false);
            setReviewsLoading(false);
        }
    }, []);
    
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            fetchProfile();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [fetchProfile]);

    const handleEdit = () => {
        navigate("/myprofile/edit");
    };

    const handleProfilePictureChange = async (file) => {
        if (!profile?.user_id) return;

        const previousPicture = profile.profile_picture;
        let previewUrl = "";

        try {
            const preparedFile = await prepareImageFile(file, {
                label: "Profile picture",
                maxDimension: 900
            });
            previewUrl = URL.createObjectURL(preparedFile);
            setUploadingPicture(true);
            setError(null);
            setProfile((currentProfile) => ({
                ...currentProfile,
                profile_picture: previewUrl
            }));

            const formData = new FormData();
            formData.append("file", preparedFile);
            const res = await httpClient.post(
                `/api/profile/${profile.user_id}/picture`,
                formData
            );

            setProfile((currentProfile) => ({
                ...currentProfile,
                profile_picture: res.data.profile_picture
            }));
        } catch (err) {
            setProfile((currentProfile) => ({
                ...currentProfile,
                profile_picture: previousPicture
            }));
            setError(err.response?.data?.detail || err.message || "Failed to update profile picture");
        } finally {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
            setUploadingPicture(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            setDeletingAccount(true);
            setError(null);
            await httpClient.delete("/api/auth/me");
            localStorage.removeItem("token");
            navigate("/login");
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to delete account");
            setDeleteConfirmOpen(false);
        } finally {
            setDeletingAccount(false);
        }
    };

    if(loading) {
        return (
            <div>
                <TopNav />
                <p style={{padding: "30px"}}>Loading Your Profile...</p>
            </div>
        );
    }

    return (
        <div>
            <TopNav />
            <div className="profile-page profile-page-stacked">
                {unauthorized ? (
                    <p style={{color: "red"}}>Please log in to view your profile.</p>
                ) : error ? (
                    <p style={{color: "red"}}>{error}</p>
                ) : (
                    profile && (
                        <>
                            <ProfileCard
                                profile={profile}
                                onEdit={handleEdit}
                                onDelete={() => setDeleteConfirmOpen(true)}
                                onProfilePictureChange={handleProfilePictureChange}
                                disableDelete={deletingAccount}
                                disableProfilePictureEdit={uploadingPicture}
                            />
                            <UserReviews
                                reviews={reviews}
                                loading={reviewsLoading}
                                error={reviewsError}
                            />
                        </>
                    )
                )}
            </div>
            {deleteConfirmOpen && (
                <ConfirmModal
                    title="Delete Account"
                    message="Delete your account? This will remove your profile, listings, chats, reservations, and cannot be undone."
                    confirmLabel="Delete Account"
                    danger
                    busy={deletingAccount}
                    onConfirm={handleDeleteAccount}
                    onCancel={() => setDeleteConfirmOpen(false)}
                />
            )}
        </div>
    );

}
