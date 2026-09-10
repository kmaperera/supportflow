import axios from 'axios';
import { refreshSession } from './authApi';
import { API_ENDPOINTS } from './endpoints';
import { getSessionHandlers } from '../auth/sessionBridge';
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

const excludedPaths = new Set(['login', 'refresh', 'logout', 'logout-all'].map(name => `${API_ENDPOINTS.AUTH}/${name}`));
function isExcluded(config) {
  const base = new URL(config.baseURL || '/', 'http://supportflow.local');
  const url = new URL(config.url, `${base.href.replace(/\/$/, '')}/`);
  const path = url.pathname.replace(/\/$/, '');
  return [...excludedPaths].some(endpoint => path === endpoint || path === `${base.pathname.replace(/\/$/, '')}${endpoint}`);
}
let recovery = null;
api.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if (error.response?.status !== 401 || !config || config._authRetry || isExcluded(config)) throw error;
  const token = getAccessToken();
  const handlers = getSessionHandlers();
  if (!token || !handlers) throw error;
  config._authRetry = true;
  // A late 401 from the old token can use a refresh that already completed.
  if (config.headers.get('Authorization') !== `Bearer ${token}`) return api.request(config);
  if (!recovery) {
    recovery = refreshSession().then(({ user, accessToken }) => {
      if (getSessionHandlers() !== handlers) throw error;
      if (getAccessToken() === token) handlers.establishSession(user, accessToken);
      // Do not replay an old session's operation after a different login/clear.
      if (getAccessToken() !== accessToken) throw error;
    }).catch(refreshError => {
      if (getSessionHandlers() === handlers && getAccessToken() === token) handlers.clearSession();
      throw refreshError;
    }).finally(() => { recovery = null });
  }
  await recovery;
  if (!getAccessToken()) throw error;
  return api.request(config);
});

export default api;