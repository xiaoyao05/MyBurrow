import axios from "axios";

export const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

export function getWebSocketUrl(path) {
  const wsUrl = new URL(path, API_URL);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.hash = "";
  return wsUrl.toString();
}

console.log("API URL:", API_URL);

const instance = axios.create({ 
  baseURL: API_URL,
  withCredentials: true });

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default instance;
