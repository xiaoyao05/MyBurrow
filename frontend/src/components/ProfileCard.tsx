import "../styles/ProfileCard.css";
import ProfileAvatar from "./ProfileAvatar";
import { FaCamera } from "react-icons/fa";
import type { EntityId, User } from "../types";

type ProfileCardProps = {
    profile: User;
    onEdit?: (id: EntityId) => void;
    onDelete?: () => void;
    onProfilePictureChange?: (file: File) => void;
    disableEdit?: boolean;
    disableDelete?: boolean;
    disableProfilePictureEdit?: boolean;
};

export default function ProfileCard({
    profile,
    onEdit,
    onDelete,
    onProfilePictureChange,
    disableEdit = false,
    disableDelete = false,
    disableProfilePictureEdit = false
}: ProfileCardProps) {
    const p: User = profile || { id: "" };
    return(
        <article className="profile-card">
            <div className="profile-card-header">
                {onProfilePictureChange ? (
                    <label className="profile-picture-edit">
                        <ProfileAvatar
                            name={p.name}
                            src={p.profile_picture}
                            size="large"
                        />
                        <span className="profile-picture-edit-bubble">
                            <FaCamera aria-hidden="true" />
                        </span>
                        <input
                            type="file"
                            accept="image/*"
                            disabled={disableProfilePictureEdit}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                    onProfilePictureChange(file);
                                    event.target.value = "";
                                }
                            }}
                            aria-label={disableProfilePictureEdit ? "Uploading profile picture" : "Change profile picture"}
                        />
                    </label>
                ) : (
                    <ProfileAvatar
                        name={p.name}
                        src={p.profile_picture}
                        size="large"
                    />
                )}
            </div>
            <h3>{p.name}</h3>
            <p><strong>Email:</strong> {p.email}</p>
            <p><strong>Contact Number:</strong> {p.contact_number}</p>
            <p><strong>Bio:</strong> {p.bio || "No bio added yet"}</p>
            {onEdit && (
                <button className="edit-button" 
                    disabled={disableEdit}
                    onClick={() => onEdit(p.id)}
                    aria-label="Edit Profile"
                >
                    Edit
                </button>
            )}
            {onDelete && (
                <button
                    type="button"
                    className="delete-account-button"
                    disabled={disableDelete}
                    onClick={onDelete}
                    aria-label="Delete account"
                >
                    Delete Account
                </button>
            )}
        </article>
    );
}
