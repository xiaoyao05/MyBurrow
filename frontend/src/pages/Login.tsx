// sends login request to backend
// if successful, stores jwt token in cookie and redirects to home page
// frontend send token on future requests to protected routes, backend verifies token and allows access if valid

import { useEffect, useState } from "react";
import {Link, useNavigate} from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { IoEye, IoEyeOff } from "react-icons/io5";
import "../styles/Login.css";
import httpClient, { API_URL } from "../httpClient";
import MyBurrow from "/assets/MyBurrow.png";

function getInitialGoogleError() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return hashParams.get("error");
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(getInitialGoogleError);
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = hashParams.get("token");
    const googleError = hashParams.get("error");
    const profileCompleted = hashParams.get("profile_completed");

    if (googleError) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (!token) return;

    localStorage.setItem("token", token);
    window.history.replaceState(null, "", window.location.pathname);

    if (profileCompleted === "true") {
      navigate("/home");
    } else {
      navigate("/myprofile/edit");
    }
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await httpClient.post("/api/auth/login", {
        email,
        password
      });

      const data = response.data;

      // store jwt token
      localStorage.setItem(
        "token",
        data.access_token
      );

      setError(null);

      navigate("/home");
    } catch (error) {
      setError(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${API_URL}/api/auth/google/login`;
  }

  return (
    <div className="login-page" >

      <form
        onSubmit={handleLogin}
        className="login-container"
      >
        <div className="auth-brand">
          <img src={MyBurrow} alt="My Burrow Logo" />
          <h1>Welcome to My Burrow!</h1>
          <p>Lend smarter, Borrow easier.</p>
        </div>

        <h2 className="login-title">Login</h2>

        <div className="login-form" >
          <label>Email:</label>

          <input className="login-input"
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />
        </div>

        <div className="login-form" >
          <label>Password:</label>

          <div className="password-input-wrapper">
            <input className="login-input password-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="login-button"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-login-button"
          onClick={handleGoogleLogin}
        >
          <FcGoogle aria-hidden="true" />
          Continue with Google
        </button>
        
        {error && <p className="error">{error}</p>}
        
        <p className="login-footer">
          Don't have an account?{" "}
          <Link to="/registerform" className="register-link">
            Register here
          </Link>
        </p>

      </form>
    </div>
  );
}
