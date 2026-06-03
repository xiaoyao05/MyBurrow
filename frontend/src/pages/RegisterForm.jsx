import httpClient from "../httpClient";
import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { IoArrowBack, IoEye, IoEyeOff } from "react-icons/io5";
import "../styles/RegisterForm.css";
import MyBurrow from "/assets/MyBurrow.png";
import ProfileAvatar from "../components/ProfileAvatar";
import { prepareImageFile } from "../utils/imageUpload";

export default function RegisterForm() {
    const navigate = useNavigate();
    const location = useLocation();
    const updating = location.pathname === "/myprofile/edit";
    const [userId, setUserId] = useState(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [name, setName] = useState("");
    const [contact_number, setContactNumber] = useState("");
    const [bio, setBio] = useState("");
    const [profilePicture, setProfilePicture] = useState("");
    const [savedProfilePicture, setSavedProfilePicture] = useState("");
    const [profilePictureFile, setProfilePictureFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!updating) return;
        async function fetchProfile() {
            try {
                setLoading(true);
                const meRes = await httpClient.get("/api/auth/me");
                const id = meRes.data;
                setUserId(id);
                const profileRes = await httpClient.get(`/api/profile/${id}`);
                setName(profileRes.data.name || "");
                setEmail(profileRes.data.email || "");
                setContactNumber(profileRes.data.contact_number || "");
                setBio(profileRes.data.bio || "");
                setProfilePicture(profileRes.data.profile_picture || "");
                setSavedProfilePicture(profileRes.data.profile_picture || "");
                setProfilePictureFile(null);
            } catch {
                setError("Failed to load profile");
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, [updating]);

    const phoneRegex = /^(?:\+65)?[89]\d{7}$/;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/;

    const handleProfilePictureChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const preparedFile = await prepareImageFile(file, {
                label: "Profile picture",
                maxDimension: 900
            });
            setProfilePictureFile(preparedFile);
            setProfilePicture(URL.createObjectURL(preparedFile));
            setError(null);
        } catch (err) {
            setError(err.message);
            event.target.value = "";
        }
    };

    const uploadProfilePicture = async (id) => {
        if (!profilePictureFile) return;

        const formData = new FormData();
        formData.append("file", profilePictureFile);
        await httpClient.post(`/api/profile/${id}/picture`, formData);
    };

    const validateInputs = () => {
        if (name.trim() === "" || contact_number.trim() === "" || email === "" || (!updating && (password === "" || confirmPassword === ""))) {
            setError("All fields are required.");
            return false;
        }

        const normalizedPhone = contact_number.replace(/[\s-]/g, "");
        if (!phoneRegex.test(normalizedPhone)) {
            setError("Invalid Singapore phone number. Must start with 8 or 9 and have 8 digits (optional +65).");
            return false;
        }
        
        if (!/^(?=.*@)(?!.*\.$).+$/.test(email)) {
            setError("Invalid email format. Must contain '@' and not end with '.'.");
            return false;
        }

        if (!updating && !passwordRegex.test(password)) {
            setError("Password must be at least 8 characters long and include at least one letter and one number.");
            return false;
        }

        if (!updating && password !== confirmPassword) {
            setError("Confirm password must match password.");
            return false;
        }
        return true;
    }

    async function handleRegister(e) {
        e.preventDefault();
        if (!validateInputs()) return;

        try {
            setLoading(true);
            const res = await httpClient.post("/api/auth/register", {
                email,
                password,
                name,
                contact_number,
                bio
            });

            localStorage.setItem("token", res.data.access_token);

            await uploadProfilePicture(res.data.user_id);

            navigate("/home");

        } catch (error) {
            setError(error.response?.data?.detail || error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdate(e) {
        e.preventDefault();
        if (!validateInputs()) return;

        try {
            setLoading(true);
            await httpClient.put(`/api/profile/${userId}`, {
                name,
                email,
                contact_number,
                bio,
                profile_picture: profilePictureFile ? (savedProfilePicture || null) : (profilePicture || null)
            });

            await uploadProfilePicture(userId);

            navigate("/myprofile");

        } catch (error) {
            setError(error.response?.data?.detail || error.message);
        } finally {
            setLoading(false);
        }
    }
    return(
        <div className={`register-page ${updating ? "register-page-edit" : ""}`}>
            {updating && (
                <Link className="edit-profile-back-link" to="/myprofile">
                    <IoArrowBack aria-hidden="true" />
                    <span>Back to My Profile</span>
                </Link>
            )}
            <form onSubmit={updating ? handleUpdate : handleRegister} className="register-container">
                {!updating && (
                    <div className="auth-brand">
                        <img src={MyBurrow} alt="My Burrow Logo" />
                        <h1>Welcome to My Burrow!</h1>
                        <p>Lend smarter, Borrow easier.</p>
                    </div>
                )}

                <h2 className="register-title">{updating ? "Edit Profile" : "Register"}</h2>
                <div className="profile-picture-field">
                    <ProfileAvatar
                        name={name}
                        src={profilePicture}
                        size="medium"
                    />
                    <div className="profile-picture-controls">
                        <label htmlFor="profile-picture">
                            Profile Picture
                        </label>
                        <input
                            id="profile-picture"
                            type="file"
                            accept="image/*"
                            onChange={handleProfilePictureChange}
                            className="profile-picture-input"
                        />
                        {profilePicture && (
                            <button
                            type="button"
                            className="remove-profile-picture-button"
                                onClick={() => {
                                    setProfilePicture("");
                                    setSavedProfilePicture("");
                                    setProfilePictureFile(null);
                                }}
                        >
                            Remove Picture
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="register-form">
                    <label>Name:</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="register-input"
                    />
                </div>
                <div className="register-form">
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="register-input"
                    />
                    {!updating && (
                        <>
                            <label>Password:</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="register-input password-input"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <IoEyeOff aria-hidden="true" /> : <IoEye aria-hidden="true" />}
                                </button>
                            </div>
                            <label>Confirm Password:</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="register-input password-input"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                                >
                                    {showConfirmPassword ? <IoEyeOff aria-hidden="true" /> : <IoEye aria-hidden="true" />}
                                </button>
                            </div>
                        </>
                    )}
                    <label>Contact Number:</label>
                    <input
                        type="text"
                        value={contact_number}
                        onChange={(e) => setContactNumber(e.target.value)}
                        required
                        className="register-input"
                    />
                    <label>Bio:</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="register-input"
                    />
                </div>
                <button type="submit" disabled={loading} className="register-button">
                    {loading ? (updating ? "Updating..." : "Registering...") : (updating ? "Update" : "Register")}
                </button>

                {error && <p className="error">{error}</p>}

                {!updating && (
                    <div className="register-footer">
                        <p>
                            Already have an account? <Link to="/login" className="login-link">Login here</Link>
                        </p>
                    </div>
                )}
            </form>
        </div>
    )
}   
