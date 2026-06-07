import "../styles/ProfileAvatar.css";
import { useState } from "react";

type ProfileAvatarProps = {
    name?: string | null;
    src?: string | null;
    size?: "small" | "medium" | "large" | "chatHeader" | string;
    className?: string;
};

function getProfileInitials(name = "") {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return (parts[0] || "U").slice(0, 2).toUpperCase();
}

export default function ProfileAvatar({ name, src, size = "medium", className = "" }: ProfileAvatarProps) {
    const [failedSrc, setFailedSrc] = useState("");
    const classes = ["profile-avatar", `profile-avatar-${size}`, className]
        .filter(Boolean)
        .join(" ");

    if (src && failedSrc !== src) {
        return (
            <img
                className={classes}
                src={src}
                alt={`${name || "User"} profile`}
                onError={() => setFailedSrc(src)}
            />
        );
    }

    return (
        <div className={classes} aria-label={`${name || "User"} initials`}>
            {getProfileInitials(name)}
        </div>
    );
}
