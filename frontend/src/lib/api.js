import axios from 'axios';
import { getCopilotContextPayload } from '@/lib/copilotContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  try {
    if (typeof config.url === 'string' && config.url.includes('/copilot/chat') && config.data && typeof config.data === 'object') {
      config.data = {
        ...config.data,
        ui_context: getCopilotContextPayload(),
      };
    }
  } catch {
    // no-op
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('hp_token');
      localStorage.removeItem('hp_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => {
    localStorage.removeItem('hp_token');
    localStorage.removeItem('hp_user');
  },
};

export const setSession = (token, user) => {
  localStorage.setItem('hp_token', token);
  localStorage.setItem('hp_user', JSON.stringify(user));
};

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('hp_user') || 'null'); }
  catch { return null; }
};

/* ------------------------------------------------------------------
 * Impersonation helpers — used by the Super Admin Console.
 * When Mike clicks "Login as Kenny", we stash his super_admin token
 * under hp_super_token and swap to Kenny's token. A sticky banner
 * shows app-wide. Calling endImpersonation() restores Mike's session.
 * ------------------------------------------------------------------ */

export const beginImpersonation = (newToken, newUser) => {
  const currentToken = localStorage.getItem('hp_token') || '';
  const currentUser  = localStorage.getItem('hp_user')  || '';
  localStorage.setItem('hp_super_token', currentToken);
  localStorage.setItem('hp_super_user',  currentUser);
  setSession(newToken, newUser);
};

export const isImpersonating = () => {
  return !!localStorage.getItem('hp_super_token');
};

export const endImpersonation = () => {
  const superToken = localStorage.getItem('hp_super_token');
  const superUser  = localStorage.getItem('hp_super_user');
  localStorage.removeItem('hp_super_token');
  localStorage.removeItem('hp_super_user');
  if (superToken && superUser) {
    localStorage.setItem('hp_token', superToken);
    localStorage.setItem('hp_user',  superUser);
  }
};
