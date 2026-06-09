import axios from 'axios';

let rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
// Normalize API URL to ensure it ends with /api (stripping any trailing slash first)
rawApiBase = rawApiBase.replace(/\/$/, '');
if (!rawApiBase.endsWith('/api')) {
  rawApiBase += '/api';
}

export const API_BASE = rawApiBase;
export const IMAGE_BASE = API_BASE.replace(/\/api$/, '');

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Salon & Locations ──
export const getSalonBySlug = (slug) => api.get(`/salon/${slug}`).then(r => r.data);
export const getLocations = (salonId) => api.get('/locations', { params: { salonId } }).then(r => r.data);

// ── Services ──
export const getServices = (params) => api.get('/services', { params }).then(r => r.data);

// ── Barbers ──
export const getBarbers = (params) => api.get('/barbers', { params }).then(r => r.data);

// ── Clients ──
export const lookupClient = (phone, salonId) =>
  api.get('/clients/lookup', { params: { phone, salonId } }).then(r => r.data);
export const getClients = (params) => api.get('/clients', { params }).then(r => r.data);

// ── Client Retention ──
export const getRetentionData = (params) => api.get('/clients/retention', { params }).then(r => r.data);
export const sendRetentionSMS = (clientId, message) => api.post('/clients/retention/send-sms', { clientId, message }).then(r => r.data);

// ── Appointments ──
export const getAppointments = (params) => api.get('/appointments', { params }).then(r => r.data);
export const getAppointment = (id) => api.get(`/appointments/${id}`).then(r => r.data);
export const createAppointment = (data) => api.post('/appointments', data).then(r => r.data);
export const updateAppointment = (id, data) => api.patch(`/appointments/${id}`, data).then(r => r.data);

// ── Availability ──
export const getAvailability = (params) => api.get('/appointments/availability', { params }).then(r => r.data);

// ── Barber Matching ──
export const matchBarbers = (data) => api.post('/appointments/match-barbers', data).then(r => r.data);

// ── File Upload ──
export const uploadPhoto = (file) => {
  const formData = new FormData();
  formData.append('photo', file);
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export default api;
