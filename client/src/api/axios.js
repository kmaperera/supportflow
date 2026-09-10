import axios from 'axios';
import { getAccessToken } from '../auth/accessToken';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    Accept: 'application/json',
  },
});

// Read the current bridge value per request; never retain a token in defaults.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  else config.headers.delete('Authorization');
  return config;
});

export default api;