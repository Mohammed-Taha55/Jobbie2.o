import axios from 'axios';

// In production, force the Railway backend URL to guarantee connectivity.
const PROD_URL = 'https://server-production-4f35.up.railway.app';
const BASE = import.meta.env.PROD ? `${PROD_URL}/api` : '/api';

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
