import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
