import axios from 'axios';

// In production: VITE_API_URL = https://your-railway-app.up.railway.app
// In development: falls back to '/api' (handled by Vite proxy)
let rawUrl = import.meta.env.VITE_API_URL || '';
if (rawUrl && !rawUrl.startsWith('http')) {
  rawUrl = `https://${rawUrl}`;
}
if (rawUrl.endsWith('/')) {
  rawUrl = rawUrl.slice(0, -1);
}

const BASE = rawUrl ? `${rawUrl}/api` : '/api';


const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jobbie_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jobbie_token');
      localStorage.removeItem('jobbie_user');
      window.location.href = '/auth';
    }
    return Promise.reject(err);
  }
);

export default api;
