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

// ── Admin Staff CRUD ──
export const createBarber = (data) => api.post('/barbers', data).then(r => r.data);
export const updateBarber = (id, data) => api.patch(`/barbers/${id}`, data).then(r => r.data);
export const deleteBarber = (id) => api.delete(`/barbers/${id}`).then(r => r.data);

// ── Admin Service CRUD ──
export const createService = (data) => api.post('/services', data).then(r => r.data);
export const updateService = (id, data) => api.patch(`/services/${id}`, data).then(r => r.data);
export const deleteService = (id) => api.delete(`/services/${id}`).then(r => r.data);

// ── Admin Client CRUD ──
export const createClient = (data) => api.post('/clients', data).then(r => r.data);
export const updateClient = (id, data) => api.patch(`/clients/${id}`, data).then(r => r.data);
export const mergeClients = (sourceId, targetId, salonId) => api.post('/clients/merge', { sourceId, targetId, salonId }).then(r => r.data);
export const bulkImportClients = (clients, salonId, dedupeStrategy) => api.post('/clients/bulk-import', { clients, salonId, dedupeStrategy }).then(r => r.data);

// ── Salon Settings ──
export const updateSalonSettings = (id, settings) => api.patch(`/salon/${id}/settings`, settings).then(r => r.data);

// ── AI Copilot ──
export const sendCopilotMessage = (message, salonId, clientDate, history) => api.post('/copilot/chat', { message, salonId, clientDate, history }).then(r => r.data);

// ── Admin Reports ──
export const getBarberPerformanceReport = (salonId, locationId) => api.get('/reports/barber-performance', { params: { salonId, locationId } }).then(r => r.data);

// ── Outreach Cadences ──
export const getCadences = (salonId) => api.get('/cadences', { params: { salonId } }).then(r => r.data);
export const createCadence = (data) => api.post('/cadences', data).then(r => r.data);
export const updateCadence = (id, data) => api.patch(`/cadences/${id}`, data).then(r => r.data);
export const deleteCadence = (id) => api.delete(`/cadences/${id}`).then(r => r.data);
export const getCadenceEnrollments = (cadenceId) => api.get(`/cadences/${cadenceId}/enrollments`).then(r => r.data);
export const bulkEnrollCadence = (cadenceId, data) => api.post(`/cadences/${cadenceId}/enroll`, data).then(r => r.data);

// ── Client Tags ──
export const getClientTags = (salonId) => api.get('/clients/tags', { params: { salonId } }).then(r => r.data);
export const bulkTagClients = (data) => api.patch('/clients/bulk-tag', data).then(r => r.data);

export default api;
