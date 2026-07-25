import axios from "axios";

const api = axios.create({
  // Use environment variable or fallback to default port 5001
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
  // Don't set default Content-Type - let browser/axios handle it
  withCredentials: true, // Cho phép gửi cookies
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers["x-auth-token"] = token;
  }
  
  // Only set Content-Type for non-FormData requests
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  // For FormData, browser will automatically set Content-Type with boundary
  
  return config;
});

export default api;
