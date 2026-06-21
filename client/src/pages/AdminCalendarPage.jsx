import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAppointments, getBarbers, getLocations, getServices,
  updateAppointment, createAppointment, getRetentionData,
  sendRetentionSMS, IMAGE_BASE, createBarber, updateBarber,
  deleteBarber, createService, updateService, deleteService,
  createClient, updateClient, getClients, updateSalonSettings,
  mergeClients, bulkImportClients,
  sendCopilotMessage, uploadPhoto, getSalonBySlug, getBarberPerformanceReport,
  getCadences, updateCadence, getCadenceEnrollments,
  getCallLogs, triggerVoiceCall
} from '../services/api';
import dayjs from 'dayjs';
import './AdminCalendarPage.css';

const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`); // 8AM - 8PM

export default function AdminCalendarPage() {
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'staff' | 'services' | 'clients' | 'retention' | 'settings'
  const [appointments, setAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [salonId, setSalonId] = useState('');
  const [salon, setSalon] = useState(null);

  // Client Search State
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Retention Dashboard State
  const [retentionData, setRetentionData] = useState({ summary: {}, clients: [] });
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [selectedRetentionClient, setSelectedRetentionClient] = useState(null);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(null);

  // Barber Modal State
  const [showBarberModal, setShowBarberModal] = useState(false);
  const [editingBarberId, setEditingBarberId] = useState(null);
  const [barberForm, setBarberForm] = useState({
    name: '', title: '', phone: '', email: '', bio: '',
    specialismsText: '', role: 'staffer', photo: ''
  });

  // Service Modal State
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: '', category: 'mens-services', duration: 30,
    priceDollars: '45.00', description: '', styleTagsText: ''
  });

  // Client Modal State
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [clientForm, setClientForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    notes: '', hairType: '', isTrusted: false
  });

  // Client Merge States
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceClient, setMergeSourceClient] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);

  // CSV Import States
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [importMapping, setImportMapping] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    notes: '', hairType: '', visitCount: '', totalRevenue: '', noShowCount: ''
  });
  const [dedupeStrategy, setDedupeStrategy] = useState('merge'); // 'skip' | 'overwrite' | 'merge'
  const [importStep, setImportStep] = useState(1); // 1: Upload, 2: Map, 3: Strategy & Preview, 4: Results
  const [importResults, setImportResults] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  // Voice Agent States
  const [callLogs, setCallLogs] = useState([]);
  const [selectedCallLog, setSelectedCallLog] = useState(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [showCallDetailsModal, setShowCallDetailsModal] = useState(false);
  const [triggerCallForm, setTriggerCallForm] = useState({
    clientId: '',
    type: 'confirmation',
    appointmentId: ''
  });
  const [voiceTabMessage, setVoiceTabMessage] = useState({ type: '', text: '' });

  // Settings State
  const [settingsForm, setSettingsForm] = useState({
    twilioTollFreeNumber: '',
    reminderHours: 24,
    voiceCallEscalation: false,
    aiAutoReschedule: false,
    aiActionPermissions: false,
    name: '',
    contactEmail: '',
    website: '',
    instagramHandle: ''
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  // AI Copilot State
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'bot', text: 'Hello, I am your Elegance Copilot. How can I help you manage the salon today? You can ask me questions about appointments, barbers, or send SMS reminders!' }
  ]);
  const [isListening, setIsListening] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Outreach Cadence States
  const [cadences, setCadences] = useState([]);
  const [cadencesLoading, setCadencesLoading] = useState(false);
  const [selectedCadence, setSelectedCadence] = useState(null);
  const [cadenceEnrollments, setCadenceEnrollments] = useState([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [stepForm, setStepForm] = useState({ delayValue: 24, delayUnit: 'hours', messageTemplate: '' });

  const loadCadences = useCallback(() => {
    if (!salonId) return;
    setCadencesLoading(true);
    getCadences(salonId)
      .then(data => { setCadences(data); setCadencesLoading(false); })
      .catch(() => setCadencesLoading(false));
  }, [salonId]);

  useEffect(() => {
    if (activeTab === 'outreach') loadCadences();
  }, [activeTab, loadCadences]);

  const loadEnrollments = useCallback((cadenceId) => {
    setEnrollmentsLoading(true);
    getCadenceEnrollments(cadenceId)
      .then(data => { setCadenceEnrollments(data); setEnrollmentsLoading(false); })
      .catch(() => setEnrollmentsLoading(false));
  }, []);

  const handleToggleCadence = async (cadence) => {
    await updateCadence(cadence._id, { isActive: !cadence.isActive });
    loadCadences();
  };

  const handleSaveStep = async (cadence, stepOrder) => {
    const updatedSteps = cadence.steps.map(s =>
      s.order === stepOrder
        ? { ...s, delayValue: stepForm.delayValue, delayUnit: stepForm.delayUnit, messageTemplate: stepForm.messageTemplate }
        : s
    );
    await updateCadence(cadence._id, { steps: updatedSteps });
    setEditingStep(null);
    loadCadences();
  };

  // Reports States
  const [reportsData, setReportsData] = useState({ summary: {}, barberPerformance: [], revenueTrends: [], servicePopularity: [], locationComparison: [] });
  const [reportsLoading, setReportsLoading] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState('staff');

  const loadReportsData = useCallback(() => {
    if (!salonId) return;
    setReportsLoading(true);
    getBarberPerformanceReport(salonId)
      .then(data => {
        setReportsData(data);
        setReportsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load reports:', err);
        setReportsLoading(false);
      });
  }, [salonId]);

  // CSV Data Export Utility
  const downloadCSV = (data, headers, filename) => {
    if (!data || !data.length) return;
    const headerRow = headers.map(h => `"${h.label}"`).join(',');
    const rows = data.map(item => {
      return headers.map(h => {
        const val = typeof h.key === 'function' ? h.key(item) : item[h.key];
        const strVal = val === null || val === undefined ? '' : String(val);
        return `"${strVal.replace(/"/g, '""')}"`;
      }).join(',');
    });
    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      loadReportsData();
    }
  }, [activeTab, loadReportsData]);

  // Initialize
  useEffect(() => {
    getLocations().then(locs => {
      setLocations(locs);
      if (locs.length > 0) {
        const defaultLoc = locs[0]._id;
        setSelectedLocation(defaultLoc);
        setSalonId(locs[0].salonId);

        getSalonBySlug('elegance-hair-salon').then(res => {
          setSalon(res.salon);
          if (res.salon) {
            setSettingsForm({
              twilioTollFreeNumber: res.salon.settings?.twilioTollFreeNumber || '',
              reminderHours: res.salon.settings?.reminderHours || 24,
              voiceCallEscalation: res.salon.settings?.voiceCallEscalation || false,
              aiAutoReschedule: res.salon.settings?.aiAutoReschedule || false,
              aiActionPermissions: res.salon.settings?.aiActionPermissions || false,
              name: res.salon.name || '',
              contactEmail: res.salon.contactEmail || '',
              website: res.salon.website || '',
              instagramHandle: res.salon.instagramHandle || ''
            });
          }
        });
      }
    });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedLocation) return;
    getBarbers({ locationId: selectedLocation }).then(setBarbers);
    getServices({ locationId: selectedLocation }).then(setServices);
    getClients({ salonId }).then(setClients);
  }, [selectedLocation, salonId]);

  useEffect(() => {
    loadData();
  }, [selectedLocation, loadData]);

  const loadAppointments = useCallback(() => {
    if (!selectedLocation) return;
    getAppointments({
      locationId: selectedLocation,
      weekStart: weekStart.format('YYYY-MM-DD'),
    }).then(setAppointments);
  }, [selectedLocation, weekStart]);

  useEffect(loadAppointments, [loadAppointments]);

  const loadRetentionData = useCallback(() => {
    if (!selectedLocation) return;
    setRetentionLoading(true);
    getRetentionData({ salonId })
      .then(data => {
        setRetentionData(data);
        setRetentionLoading(false);
      })
      .catch(err => {
        console.error('Failed to load retention data:', err);
        setRetentionLoading(false);
      });
  }, [selectedLocation, salonId]);

  useEffect(() => {
    if (activeTab === 'retention') {
      loadRetentionData();
    }
  }, [activeTab, loadRetentionData]);

  useEffect(() => {
    if (activeTab === 'clients') {
      getClients({ salonId, search: clientSearchQuery }).then(setClients);
    }
  }, [activeTab, clientSearchQuery, salonId]);

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, copilotLoading]);

  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

  const getAppointmentsForBarberDay = (barberId, date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    return appointments.filter(a =>
      a.barberId?._id === barberId && a.date === dateStr
    );
  };

  const getSlotPosition = (time) => {
    const [h, m] = time.split(':').map(Number);
    return ((h - 8) * 60 + m) / 60 * 100; // 100px per hour
  };

  const getSlotHeight = (startTime, endTime) => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(duration / 60 * 100, 32);
  };

  const statusColors = {
    'confirmed': 'badge-confirmed',
    'completed': 'badge-completed',
    'cancelled': 'badge-cancelled',
    'no-show': 'badge-no-show',
    'need-confirm': 'badge-need-confirm',
  };

  const handleStatusChange = async (id, status) => {
    await updateAppointment(id, { status });
    loadAppointments();
    if (selectedAppointment?._id === id) {
      setSelectedAppointment(prev => ({ ...prev, status }));
    }
  };

  const handleNotesUpdate = async (id, notes) => {
    try {
      await updateAppointment(id, { notes });
      loadAppointments();
      if (selectedAppointment?._id === id) {
        setSelectedAppointment(prev => prev ? { ...prev, notes } : null);
      }
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  };

  const handlePhotoUpload = async (apptId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploadResult = await uploadPhoto(file);
      await updateAppointment(apptId, { referencePhoto: uploadResult.url });
      loadAppointments();
      if (selectedAppointment?._id === apptId) {
        setSelectedAppointment(prev => prev ? { ...prev, referencePhoto: uploadResult.url } : null);
      }
    } catch (err) {
      console.error('Failed to upload photo:', err);
      alert('Failed to upload photo: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRemovePhoto = async (apptId) => {
    try {
      await updateAppointment(apptId, { referencePhoto: '' });
      loadAppointments();
      if (selectedAppointment?._id === apptId) {
        setSelectedAppointment(prev => prev ? { ...prev, referencePhoto: '' } : null);
      }
    } catch (err) {
      console.error('Failed to remove photo:', err);
      alert('Failed to remove photo');
    }
  };

  // Add Appointment Form State
  const [addForm, setAddForm] = useState({
    firstName: '', lastName: '', phone: '', serviceId: '', barberId: '',
    date: dayjs().format('YYYY-MM-DD'), startTime: '09:00', source: 'walk-in',
  });

  const handleAddAppointment = async () => {
    try {
      await createAppointment({
        salonId, locationId: selectedLocation,
        ...addForm,
      });
      setShowAddModal(false);
      setAddForm({ firstName: '', lastName: '', phone: '', serviceId: '', barberId: '', date: dayjs().format('YYYY-MM-DD'), startTime: '09:00', source: 'walk-in' });
      loadAppointments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create appointment');
    }
  };

  // Barber Actions
  const handleOpenBarberModal = (barber = null) => {
    if (barber) {
      setEditingBarberId(barber._id);
      setBarberForm({
        name: barber.name,
        title: barber.title,
        phone: barber.phone || '',
        email: barber.email || '',
        bio: barber.bio || '',
        specialismsText: barber.specialisms ? barber.specialisms.join(', ') : '',
        role: barber.role || 'staffer',
        photo: barber.photo || ''
      });
    } else {
      setEditingBarberId(null);
      setBarberForm({
        name: '', title: '', phone: '', email: '', bio: '',
        specialismsText: '', role: 'staffer', photo: ''
      });
    }
    setShowBarberModal(true);
  };

  const handleSaveBarber = async () => {
    try {
      const payload = {
        salonId,
        locationId: selectedLocation,
        name: barberForm.name,
        title: barberForm.title,
        phone: barberForm.phone,
        email: barberForm.email,
        bio: barberForm.bio,
        role: barberForm.role,
        photo: barberForm.photo,
        specialisms: barberForm.specialismsText.split(',').map(s => s.trim()).filter(Boolean)
      };

      if (editingBarberId) {
        await updateBarber(editingBarberId, payload);
      } else {
        await createBarber(payload);
      }
      setShowBarberModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save barber');
    }
  };

  const handleDeleteBarber = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this barber?')) return;
    try {
      await deleteBarber(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete barber');
    }
  };

  const handleBarberPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await uploadPhoto(file);
      setBarberForm(f => ({ ...f, photo: res.url }));
    } catch (err) {
      alert('Photo upload failed');
    }
  };

  // Service Actions
  const handleOpenServiceModal = (service = null) => {
    if (service) {
      setEditingServiceId(service._id);
      setServiceForm({
        name: service.name,
        category: service.category,
        duration: service.duration,
        priceDollars: (service.price / 100).toFixed(2),
        description: service.description || '',
        styleTagsText: service.styleTags ? service.styleTags.join(', ') : ''
      });
    } else {
      setEditingServiceId(null);
      setServiceForm({
        name: '', category: 'mens-services', duration: 30,
        priceDollars: '45.00', description: '', styleTagsText: ''
      });
    }
    setShowServiceModal(true);
  };

  const handleSaveService = async () => {
    try {
      const payload = {
        salonId,
        locationId: selectedLocation,
        name: serviceForm.name,
        category: serviceForm.category,
        duration: Number(serviceForm.duration),
        price: Math.round(parseFloat(serviceForm.priceDollars) * 100),
        description: serviceForm.description,
        styleTags: serviceForm.styleTagsText.split(',').map(t => t.trim()).filter(Boolean)
      };

      if (editingServiceId) {
        await updateService(editingServiceId, payload);
      } else {
        await createService(payload);
      }
      setShowServiceModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save service');
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this service?')) return;
    try {
      await deleteService(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete service');
    }
  };

  // Client Actions
  const handleOpenClientModal = (client = null) => {
    if (client) {
      setEditingClientId(client._id);
      setClientForm({
        firstName: client.firstName,
        lastName: client.lastName || '',
        phone: client.phone,
        email: client.email || '',
        notes: client.notes || '',
        hairType: client.hairType || '',
        isTrusted: client.isTrusted || false
      });
    } else {
      setEditingClientId(null);
      setClientForm({
        firstName: '', lastName: '', phone: '', email: '',
        notes: '', hairType: '', isTrusted: false
      });
    }
    setShowClientModal(true);
  };

  const normalizePhone = (p) => {
    if (!p) return '';
    let normalized = p.replace(/[^0-9+]/g, '');
    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('1') && normalized.length === 11) normalized = '+' + normalized;
      else if (normalized.length === 10) normalized = '+1' + normalized;
    }
    return normalized;
  };

  const isValidE164 = (p) => {
    if (!p) return false;
    const normalized = normalizePhone(p);
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    if (!e164Regex.test(normalized)) return false;
    if (normalized.startsWith('+1')) {
      if (normalized.length !== 12) return false;
      const areaFirst = normalized.charAt(2);
      if (areaFirst === '0' || areaFirst === '1') return false;
    }
    return true;
  };

  const handleSaveClient = async () => {
    if (!isValidE164(clientForm.phone)) {
      alert('Please enter a valid phone number (e.g. +1xxxxxxxxxx or 10 digits for US numbers).');
      return;
    }
    try {
      const payload = {
        salonId,
        ...clientForm,
        phone: normalizePhone(clientForm.phone)
      };
      if (editingClientId) {
        await updateClient(editingClientId, payload);
      } else {
        await createClient(payload);
      }
      setShowClientModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save client');
    }
  };

  const handleOpenMergeModal = (client) => {
    setMergeSourceClient(client);
    setMergeTargetId('');
    setShowMergeModal(true);
  };

  const handleExecuteMerge = async () => {
    if (!mergeSourceClient || !mergeTargetId) return;
    setMergeLoading(true);
    try {
      await mergeClients(mergeSourceClient._id, mergeTargetId, salonId);
      alert('Clients merged successfully! History consolidated.');
      setShowMergeModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to merge clients');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleOpenImportModal = () => {
    setCsvHeaders([]);
    setCsvRows([]);
    setImportMapping({
      firstName: '', lastName: '', phone: '', email: '',
      notes: '', hairType: '', visitCount: '', totalRevenue: '', noShowCount: ''
    });
    setDedupeStrategy('merge');
    setImportStep(1);
    setImportResults(null);
    setShowImportModal(true);
  };

  const handleProcessCSV = (text) => {
    const lines = text.split(/\r\n|\n/);
    if (lines.length === 0) return;

    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(val => val.replace(/^"|"$/g, '').trim());
    };

    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      if (values.length > 0) {
        rows.push(values);
      }
    }

    setCsvHeaders(headers);
    setCsvRows(rows);

    const autoMap = {
      firstName: '', lastName: '', phone: '', email: '',
      notes: '', hairType: '', visitCount: '', totalRevenue: '', noShowCount: ''
    };

    headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower.includes('first name') || lower === 'first_name' || lower === 'firstname' || lower === 'given name') {
        autoMap.firstName = String(idx);
      } else if (lower.includes('last name') || lower === 'last_name' || lower === 'lastname' || lower === 'family name' || lower === 'surname') {
        autoMap.lastName = String(idx);
      } else if (lower === 'name' || lower === 'client name' || lower === 'full name' || lower === 'client') {
        if (!autoMap.firstName) autoMap.firstName = String(idx);
      } else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('tel') || lower === 'cell') {
        autoMap.phone = String(idx);
      } else if (lower.includes('email') || lower === 'mail' || lower === 'e-mail') {
        autoMap.email = String(idx);
      } else if (lower.includes('note') || lower.includes('comment') || lower.includes('desc') || lower.includes('preference')) {
        autoMap.notes = String(idx);
      } else if (lower.includes('hair') || lower === 'hair_type' || lower === 'hairtype') {
        autoMap.hairType = String(idx);
      } else if (lower.includes('visit') || lower.includes('booking') || lower.includes('appointment')) {
        autoMap.visitCount = String(idx);
      } else if (lower.includes('spend') || lower.includes('revenue') || lower.includes('sales') || lower.includes('paid')) {
        autoMap.totalRevenue = String(idx);
      } else if (lower.includes('no-show') || lower.includes('no show')) {
        autoMap.noShowCount = String(idx);
      }
    });

    setImportMapping(autoMap);
    setImportStep(2);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      handleProcessCSV(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!importMapping.firstName || !importMapping.phone) {
      alert('First Name and Phone Number mappings are required!');
      return;
    }
    setImportLoading(true);
    try {
      const clientsToImport = csvRows.map(row => {
        const first = row[Number(importMapping.firstName)] || '';
        const phoneVal = row[Number(importMapping.phone)] || '';
        
        let clientFirstName = first;
        let clientLastName = '';
        if (importMapping.lastName && row[Number(importMapping.lastName)]) {
          clientLastName = row[Number(importMapping.lastName)];
        } else if (first && !importMapping.lastName) {
          const parts = first.split(/\s+/);
          if (parts.length > 1) {
            clientFirstName = parts[0];
            clientLastName = parts.slice(1).join(' ');
          }
        }

        let revenueCents = 0;
        if (importMapping.totalRevenue && row[Number(importMapping.totalRevenue)]) {
          const rawRevenue = row[Number(importMapping.totalRevenue)].replace(/[^0-9.]/g, '');
          revenueCents = Math.round(parseFloat(rawRevenue) * 100) || 0;
        }

        return {
          firstName: clientFirstName,
          lastName: clientLastName,
          phone: phoneVal,
          email: importMapping.email ? (row[Number(importMapping.email)] || '') : '',
          notes: importMapping.notes ? (row[Number(importMapping.notes)] || '') : '',
          hairType: importMapping.hairType ? (row[Number(importMapping.hairType)] || '') : '',
          visitCount: importMapping.visitCount ? (parseInt(row[Number(importMapping.visitCount)]) || 0) : 0,
          noShowCount: importMapping.noShowCount ? (parseInt(row[Number(importMapping.noShowCount)]) || 0) : 0,
          totalRevenue: revenueCents,
        };
      });

      const res = await bulkImportClients(clientsToImport, salonId, dedupeStrategy);
      setImportResults(res.summary);
      setImportStep(4);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import clients');
    } finally {
      setImportLoading(false);
    }
  };

  // ── AI Voice Agent Handlers ──
  const loadCallLogs = useCallback(() => {
    setVoiceLoading(true);
    getCallLogs(salonId)
      .then(res => {
        setCallLogs(res.logs || []);
        setVoiceLoading(false);
      })
      .catch(err => {
        console.error('Failed to load call logs:', err);
        setVoiceLoading(false);
      });
  }, [salonId]);

  useEffect(() => {
    if (activeTab === 'voice') {
      loadCallLogs();
      if (selectedLocation) {
        getAppointments({
          locationId: selectedLocation,
          weekStart: weekStart.format('YYYY-MM-DD'),
        }).then(res => {
          if (res && res.appointments) {
            setAppointments(res.appointments);
          } else if (Array.isArray(res)) {
            setAppointments(res);
          }
        });
      }
    }
  }, [activeTab, loadCallLogs, selectedLocation, weekStart]);

  const handleTriggerVoiceCall = async (e) => {
    e.preventDefault();
    if (!triggerCallForm.clientId || !triggerCallForm.type) {
      setVoiceTabMessage({ type: 'error', text: 'Client ID and Call Type are required!' });
      return;
    }
    
    if (triggerCallForm.type === 'confirmation' && !triggerCallForm.appointmentId) {
      setVoiceTabMessage({ type: 'error', text: 'Appointment selection is required for confirmation calls!' });
      return;
    }

    setVoiceLoading(true);
    setVoiceTabMessage({ type: '', text: '' });
    try {
      const payload = {
        clientId: triggerCallForm.clientId,
        type: triggerCallForm.type,
        salonId,
        appointmentId: triggerCallForm.type === 'confirmation' ? triggerCallForm.appointmentId : undefined,
      };
      
      const res = await triggerVoiceCall(payload);
      if (res.success) {
        setVoiceTabMessage({ 
          type: 'success', 
          text: res.mock 
            ? 'Mock call completed! View the simulated transcript below.' 
            : 'Outbound call triggered successfully via Twilio!' 
        });
        setTriggerCallForm(f => ({ ...f, clientId: '', appointmentId: '' }));
        loadCallLogs();
        loadData();
      } else {
        setVoiceTabMessage({ type: 'error', text: res.error || 'Failed to trigger outbound voice call' });
      }
    } catch (err) {
      setVoiceTabMessage({ type: 'error', text: err.response?.data?.error || 'Failed to initiate outbound call' });
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleOpenCallDetails = (log) => {
    setSelectedCallLog(log);
    setShowCallDetailsModal(true);
  };

  // Settings Action
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateSalonSettings(salonId, {
        name: settingsForm.name,
        contactEmail: settingsForm.contactEmail,
        website: settingsForm.website,
        instagramHandle: settingsForm.instagramHandle,
        twilioTollFreeNumber: settingsForm.twilioTollFreeNumber,
        reminderHours: Number(settingsForm.reminderHours),
        voiceCallEscalation: settingsForm.voiceCallEscalation,
        aiAutoReschedule: settingsForm.aiAutoReschedule,
        aiActionPermissions: settingsForm.aiActionPermissions
      });
      alert('Settings saved successfully');
      // Refresh salon metadata
      getSalonBySlug('elegance-hair-salon').then(res => {
        setSalon(res.salon);
      });
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Retention SMS Confirmation
  const handleOpenSMSModal = (client) => {
    setSelectedRetentionClient(client);
    setSmsSuccess(null);
    const code = 'FRESH15';
    const msg = `Elegance Salon: Hi ${client.firstName}! We miss you. Use code ${code} for 15% off your next visit. Book now: http://bit.ly/elegance-salon`;
    setSmsMessage(msg);
  };

  const handleSendSMS = async () => {
    setSmsSending(true);
    setSmsSuccess(null);
    try {
      const result = await sendRetentionSMS(selectedRetentionClient._id, smsMessage);
      if (result.success) {
        setSmsSuccess(`✓ SMS Sent successfully! ${result.mock ? '(Mock Mode)' : ''}`);
        loadRetentionData();
        setTimeout(() => {
          setSelectedRetentionClient(null);
        }, 2000);
      } else {
        alert(result.error || 'Failed to send SMS');
      }
    } catch (err) {
      console.error(err);
      alert('Error sending SMS');
    } finally {
      setSmsSending(false);
    }
  };

  // Copilot Call Handler
  const handleSendCopilot = async (textToSend = null) => {
    const text = textToSend || copilotInput;
    if (!text.trim()) return;

    // Fallback to first location's salonId if salonId state is not loaded yet
    let activeSalonId = salonId;
    if (!activeSalonId && locations.length > 0) {
      activeSalonId = locations[0].salonId;
    }

    setChatHistory(prev => [...prev, { sender: 'user', text }]);
    setCopilotInput('');
    setCopilotLoading(true);

    try {
      const res = await sendCopilotMessage(text, activeSalonId, dayjs().format('YYYY-MM-DD'), chatHistory);
      setChatHistory(prev => [...prev, { sender: 'bot', text: res.response, actions: res.actions }]);
      
      // If the AI took calendar or retention actions, refresh data
      if (res.actions && res.actions.length > 0) {
        loadAppointments();
        loadRetentionData();
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { sender: 'bot', text: 'Sorry, I encountered an issue processing your request.' }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  // Voice Speech Recognition Handler
  const handleToggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Browser Speech Recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error', e);
      setIsListening(false);
      if (e.error === 'not-allowed') {
        alert('Microphone access blocked. Please allow microphone permissions in your browser settings to use voice input.');
      } else if (e.error === 'no-speech') {
        alert('No speech detected. Please speak clearly into the microphone.');
      } else {
        alert(`Speech recognition failed: ${e.error || 'Unknown error'}`);
      }
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setCopilotInput(transcript);
      // Automatically send transcription after a brief delay
      setTimeout(() => {
        handleSendCopilot(transcript);
      }, 500);
    };

    recognition.start();
  };    return (
    <div className="admin-layout">
      {/* Booksy Sidebar Navigation */}
      <aside className={`booksy-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/logo.jpeg" alt="Elegance Logo" className="brand-logo" />
          <div className="brand-title">
            <h2>Elegance</h2>
            <span className="brand-subtitle">Management Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <span className="sidebar-section-header">Bookings & Schedule</span>
            <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => handleTabChange('calendar')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </span> Calendar
            </button>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-section-header">Operations</span>
            <button className={`nav-item ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => handleTabChange('staff')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </span> Barbers & Staff
            </button>
            <button className={`nav-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => handleTabChange('services')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
              </span> Services Catalog
            </button>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-section-header">Customers & Marketing</span>
            <button className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => handleTabChange('clients')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </span> Clients Directory
            </button>
            <button className={`nav-item ${activeTab === 'retention' ? 'active' : ''}`} onClick={() => handleTabChange('retention')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              </span> AI Client Retention
            </button>
            <button className={`nav-item ${activeTab === 'outreach' ? 'active' : ''}`} onClick={() => handleTabChange('outreach')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"></path><path d="M22 2L15 22L11 13L2 9L22 2Z"></path></svg>
              </span> Outreach
            </button>
            <button className={`nav-item ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => handleTabChange('voice')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </span> AI Voice Agent
            </button>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-section-header">Analytics & Config</span>
            <button className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => handleTabChange('reports')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
              </span> Reports
            </button>
            <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabChange('settings')}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span> Settings
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <a href="/" className="booking-link">← Client Booking Site</a>
        </div>
      </aside>

      {/* Sidebar Overlay for Mobile */}
      <div className={`sidebar-overlay ${mobileSidebarOpen ? 'open' : ''}`} onClick={() => setMobileSidebarOpen(false)} />

      {/* Main Content Pane */}
      <main className="admin-main">
        {/* Top bar with location selector and actions */}
        <header className="main-header">
          <button type="button" className="sidebar-toggle-btn" onClick={() => setMobileSidebarOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="header-left">
            <h1 className="tab-title">
              {activeTab === 'calendar' && 'Calendar Schedule'}
              {activeTab === 'staff' && 'Barbers & Staff Management'}
              {activeTab === 'services' && 'Services Catalog'}
              {activeTab === 'clients' && 'Client Directory'}
              {activeTab === 'retention' && 'AI Client Retention Dashboard'}
              {activeTab === 'reports' && 'Staff Performance & Analytics'}
              {activeTab === 'outreach' && 'Outreach Cadences'}
              {activeTab === 'settings' && 'Salon Administration Settings'}
            </h1>
          </div>
          <div className="header-right">
            <select className="form-input form-select location-selector"
              value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
              {locations.map(l => <option key={l._id} value={l._id}>{l.name} Location</option>)}
            </select>
            {activeTab === 'calendar' && (
              <button className="btn btn-gold" onClick={() => setShowAddModal(true)}>
                + New Appointment
              </button>
            )}
            {activeTab === 'staff' && (
              <button className="btn btn-gold" onClick={() => handleOpenBarberModal()}>
                + Add Staff Member
              </button>
            )}
            {activeTab === 'services' && (
              <button className="btn btn-gold" onClick={() => handleOpenServiceModal()}>
                + Add Service
              </button>
            )}
            {activeTab === 'clients' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-outline csv-export-btn" onClick={handleOpenImportModal}>
                  Import CSV
                </button>
                <button className="btn btn-gold" onClick={() => handleOpenClientModal()}>
                  + Add Client
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="main-content-scroll">
          {/* TAB 1: CALENDAR VIEW */}
          {activeTab === 'calendar' && (
            <div className="tab-pane animate-fade-in">
              <div className="week-nav">
                <button className="btn btn-ghost" onClick={() => setWeekStart(w => w.subtract(7, 'day'))}>← Prev Week</button>
                <h2 className="week-title">
                  {weekStart.format('MMMM D')} – {weekStart.add(6, 'day').format('MMMM D, YYYY')}
                </h2>
                <button className="btn btn-ghost" onClick={() => setWeekStart(dayjs().startOf('week'))}>Today</button>
                <button className="btn btn-ghost" onClick={() => setWeekStart(w => w.add(7, 'day'))}>Next Week →</button>
              </div>

              <div className="calendar-container">
                <div className="calendar-grid">
                  <div className="time-column">
                    <div className="day-header-cell" />
                    {HOURS.map(h => (
                      <div key={h} className="time-label">
                        {dayjs(`2024-01-01 ${h}`).format('h A')}
                      </div>
                    ))}
                  </div>

                  {weekDays.map(day => (
                    <div key={day.format('YYYY-MM-DD')} className={`day-column ${day.isSame(dayjs(), 'day') ? 'today' : ''}`}>
                      <div className="day-header-cell">
                        <span className="day-name">{day.format('ddd')}</span>
                        <span className={`day-number ${day.isSame(dayjs(), 'day') ? 'today-num' : ''}`}>{day.format('D')}</span>
                      </div>
                      <div className="day-body">
                        {HOURS.map(h => <div key={h} className="hour-line" />)}

                         {barbers.map(barber => {
                          const appts = getAppointmentsForBarberDay(barber._id, day);
                          return appts.map(appt => {
                            const clientName = `${appt.clientId?.firstName || appt.firstName || 'Client'} ${appt.clientId?.lastName || appt.lastName || ''}`;
                            return (
                              <div key={appt._id}
                                className={`appt-block ${appt.status} density-high`}
                                style={{
                                  top: `${getSlotPosition(appt.startTime)}px`,
                                  height: `${getSlotHeight(appt.startTime, appt.endTime)}px`,
                                }}
                                onClick={() => setSelectedAppointment(appt)}
                                title={`${clientName} - ${appt.serviceId?.name || 'Service'}`}>
                                <div className="appt-row">
                                  <span className="appt-time">{dayjs(`2024-01-01 ${appt.startTime}`).format('h:mm A')}</span>
                                  <span className={`appt-status-tag tag-${appt.status}`}>{appt.status.replace('-', ' ')}</span>
                                </div>
                                <span className="appt-client">{clientName}</span>
                                <span className="appt-service">{appt.serviceId?.name || 'Service'}</span>
                                <span className="appt-barber-tag">{appt.barberId?.name}</span>
                              </div>
                            );
                          });
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="barber-legend">
                {barbers.map(b => (
                  <span key={b._id} className="legend-item">
                    <span className="legend-dot" />
                    {b.name} ({b.title || 'Barber'})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: STAFF/BARBER MANAGEMENT */}
          {activeTab === 'staff' && (
            <div className="tab-pane animate-fade-in">
              <div className="cards-grid">
                {barbers.map(b => (
                  <div key={b._id} className="staff-card">
                    <div className="staff-card-header">
                      <img src={b.photo ? (b.photo.startsWith('http') ? b.photo : `${IMAGE_BASE}${b.photo}`) : '/favicon.avif'} alt={b.name} className="staff-avatar" />
                      <div className="staff-header-info">
                        <h3>{b.name}</h3>
                        <p className="staff-title">{b.title || 'Barber'}</p>
                        <span className="badge-role">{b.role}</span>
                      </div>
                    </div>
                    <div className="staff-card-body">
                      <p className="staff-bio">"{b.bio || 'No biography written yet.'}"</p>
                      <div className="specialisms-list">
                        {b.specialisms && b.specialisms.map(s => (
                          <span key={s} className="spec-tag">{s.replace(/-/g, ' ')}</span>
                        ))}
                      </div>
                    </div>
                    <div className="staff-card-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => handleOpenBarberModal(b)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBarber(b._id)}>Deactivate</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SERVICES CATALOG */}
          {activeTab === 'services' && (
            <div className="tab-pane animate-fade-in">
              {['mens-services', 'womens-services', 'color', 'mens-color', 'smoothing-perms', 'threading-wax'].map(cat => {
                const catServices = services.filter(s => s.category === cat);
                if (catServices.length === 0) return null;
                return (
                  <div key={cat} className="service-category-group">
                    <h2 className="category-section-title">{cat.replace(/-/g, ' ').toUpperCase()}</h2>
                    <div className="services-list-grid">
                      {catServices.map(s => (
                        <div key={s._id} className="service-admin-card">
                          <div className="service-info-col">
                            <h4>{s.name}</h4>
                            <p className="service-desc">{s.description || 'No description provided.'}</p>
                            <span className="service-duration">{s.duration} min</span>
                          </div>
                          <div className="service-price-col">
                            <span className="service-price">${(s.price / 100).toFixed(2)}{s.priceVaries ? '+' : ''}</span>
                            <div className="service-actions">
                              <button className="btn btn-outline btn-sm" onClick={() => handleOpenServiceModal(s)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteService(s._id)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: CLIENTS DIRECTORY */}
          {activeTab === 'clients' && (
            <div className="tab-pane animate-fade-in">
              <div className="directory-controls">
                <input
                  type="text"
                  className="form-input search-box"
                  placeholder="Search clients by name or phone number..."
                  value={clientSearchQuery}
                  onChange={e => setClientSearchQuery(e.target.value)}
                />
              </div>

              <div className="table-responsive">
                <table className="clients-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Visit Count</th>
                      <th>Last Visit</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c._id}>
                        <td><strong>{c.firstName} {c.lastName}</strong> {c.isTrusted && <span className="vip-badge">VIP</span>}</td>
                        <td>{c.phone}</td>
                        <td>{c.email || '—'}</td>
                        <td><span className="visit-badge">{c.visitCount || 0} visits</span></td>
                        <td>{c.lastVisit ? dayjs(c.lastVisit).format('MMM D, YYYY') : 'Never'}</td>
                        <td className="client-notes-cell">{c.notes || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => handleOpenClientModal(c)}>Edit</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleOpenMergeModal(c)}>Merge</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {clients.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                          No clients found matching the criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: CLIENT RETENTION */}
          {activeTab === 'retention' && (
            <div className="tab-pane animate-fade-in">
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-dot total"></span>
                  <div className="metric-info">
                    <h3>Total Clients</h3>
                    <p className="metric-value">{retentionData.summary?.totalClients || 0}</p>
                  </div>
                </div>
                <div className="metric-card active">
                  <span className="metric-dot active"></span>
                  <div className="metric-info">
                    <h3>Active</h3>
                    <p className="metric-value">{retentionData.summary?.activeCount || 0}</p>
                    <small className="metric-sub">Visited in last 30d</small>
                  </div>
                </div>
                <div className="metric-card slipping">
                  <span className="metric-dot slipping"></span>
                  <div className="metric-info">
                    <h3>Slipping</h3>
                    <p className="metric-value">{retentionData.summary?.slippingCount || 0}</p>
                    <small className="metric-sub">Last visit 30-60d</small>
                  </div>
                </div>
                <div className="metric-card dormant">
                  <span className="metric-dot dormant"></span>
                  <div className="metric-info">
                    <h3>At Risk</h3>
                    <p className="metric-value">{retentionData.summary?.dormantCount || 0}</p>
                    <small className="metric-sub">No visit in 60d+</small>
                  </div>
                </div>
                <div className="metric-card loyalty">
                  <span className="metric-dot loyalty"></span>
                  <div className="metric-info">
                    <h3>Retention Rate</h3>
                    <p className="metric-value">{retentionData.summary?.retentionRate || 0}%</p>
                    <small className="metric-sub">Loyalty index score</small>
                  </div>
                </div>
              </div>

              <div className="retention-table-container">
                <div className="table-header">
                  <h2>At-Risk & Dormant Clients</h2>
                  <p>Clients who haven't booked an appointment recently. Use AI re-engagement to win them back.</p>
                </div>

                {retentionLoading ? (
                  <div className="retention-loading">Loading retention insights...</div>
                ) : retentionData.clients?.length === 0 ? (
                  <div className="retention-empty">All clients are active! Great job keeping them engaged.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="retention-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Last Visit</th>
                          <th>Days Idle</th>
                          <th>Status</th>
                          <th>Preferred Barber</th>
                          <th>AI Recommendation</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retentionData.clients?.map(client => (
                          <tr key={client._id} className={client.engagementStatus}>
                            <td>
                              <div className="client-cell">
                                <strong>{client.firstName} {client.lastName}</strong>
                                <span className="client-sub">{client.phone}</span>
                              </div>
                            </td>
                            <td>{client.lastVisit ? dayjs(client.lastVisit).format('MMM D, YYYY') : 'Never'}</td>
                            <td>
                              <span className={`days-badge ${client.daysSinceLastVisit > 60 ? 'critical' : 'warning'}`}>
                                {client.daysSinceLastVisit} days
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${client.engagementStatus}`}>
                                {client.engagementStatus === 'dormant' ? 'At Risk' : 'Slipping'}
                              </span>
                            </td>
                            <td>{client.preferredBarberId?.name || 'Any Stylist'}</td>
                            <td>
                              <div className="ai-rec-box">
                                <span className="ai-sparkle">AI Suggestion:</span>
                                <p className="ai-desc">{client.aiRecommendation}</p>
                                {client.tags?.includes('sms-reengaged') && (
                                  <span className="reengaged-tag">Re-engaged</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <button className="btn btn-gold btn-sm" onClick={() => handleOpenSMSModal(client)}>
                                Re-Engage
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: REPORTS & PERFORMANCE */}
          {activeTab === 'reports' && (
            <div className="tab-pane animate-fade-in">
              {reportsLoading ? (
                <div className="retention-loading">Loading staff reports...</div>
              ) : (
                <>
                  {/* Shop Summary Metrics Grid */}
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span className="metric-dot total"></span>
                      <div className="metric-info">
                        <h3>Total Salon Revenue</h3>
                        <p className="metric-value">${reportsData.summary?.totalRevenue?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                    <div className="metric-card active">
                      <span className="metric-dot active"></span>
                      <div className="metric-info">
                        <h3>Confirmed Bookings</h3>
                        <p className="metric-value">{reportsData.summary?.totalBookings || 0}</p>
                      </div>
                    </div>
                    <div className="metric-card loyalty">
                      <span className="metric-dot loyalty"></span>
                      <div className="metric-info">
                        <h3>Overall Client Return Rate</h3>
                        <p className="metric-value">{reportsData.summary?.returnRate || 0}%</p>
                        <small className="metric-sub">Repeat visitors index</small>
                      </div>
                    </div>
                    <div className="metric-card dormant">
                      <span className="metric-dot dormant"></span>
                      <div className="metric-info">
                        <h3>Total No-Shows</h3>
                        <p className="metric-value">{reportsData.summary?.totalNoShows || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Reports Sub-Tabs Navigation */}
                  <div className="reports-subtabs-nav">
                    <button 
                      type="button" 
                      className={`reports-subtab-btn ${activeReportTab === 'staff' ? 'active' : ''}`}
                      onClick={() => setActiveReportTab('staff')}
                    >
                      Staff Performance
                    </button>
                    <button 
                      type="button" 
                      className={`reports-subtab-btn ${activeReportTab === 'trends' ? 'active' : ''}`}
                      onClick={() => setActiveReportTab('trends')}
                    >
                      Revenue Trends
                    </button>
                    <button 
                      type="button" 
                      className={`reports-subtab-btn ${activeReportTab === 'services' ? 'active' : ''}`}
                      onClick={() => setActiveReportTab('services')}
                    >
                      Service Popularity
                    </button>
                    <button 
                      type="button" 
                      className={`reports-subtab-btn ${activeReportTab === 'locations' ? 'active' : ''}`}
                      onClick={() => setActiveReportTab('locations')}
                    >
                      Location Comparison
                    </button>
                  </div>

                  {/* Staff Performance Table */}
                  {activeReportTab === 'staff' && (
                    <div className="retention-table-container animate-fade-in">
                      <div className="table-header">
                        <div>
                          <h2>Barber Performance & Return Rates</h2>
                          <p>Analyze unique client return rates, total bookings, no-show rates, and revenue per barber to guide staffing decisions.</p>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-outline btn-sm csv-export-btn"
                          onClick={() => {
                            const headers = [
                              { label: 'Barber', key: (p) => p.barber.name },
                              { label: 'Role', key: (p) => p.barber.role },
                              { label: 'Status', key: (p) => p.barber.isActive ? 'Active' : 'Inactive' },
                              { label: 'Total Bookings', key: 'totalBookings' },
                              { label: 'Unique Clients', key: 'uniqueClientsCount' },
                              { label: 'Repeat Clients', key: 'repeatClientsCount' },
                              { label: 'Return Rate (%)', key: 'returnRate' },
                              { label: 'No-Show Rate (%)', key: 'noShowRate' },
                              { label: 'Cancellation Rate (%)', key: 'cancellationRate' },
                              { label: 'Total Revenue ($)', key: 'totalRevenue' }
                            ];
                            downloadCSV(reportsData.barberPerformance, headers, 'staff_performance_report.csv');
                          }}
                        >
                          Export CSV
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="retention-table reports-table">
                          <thead>
                            <tr>
                              <th>Barber</th>
                              <th>Role</th>
                              <th>Status</th>
                              <th>Total Bookings</th>
                              <th>Unique Clients</th>
                              <th>Repeat Clients</th>
                              <th>Return Rate</th>
                              <th>No-Show Rate</th>
                              <th>Cancellation Rate</th>
                              <th>Total Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportsData.barberPerformance?.map(perf => (
                              <tr key={perf.barber._id}>
                                <td>
                                  <div className="client-cell">
                                    <img src={perf.barber.photo ? `${IMAGE_BASE}${perf.barber.photo}` : '/favicon.avif'} alt={perf.barber.name} className="barber-reports-avatar" />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <strong>{perf.barber.name}</strong>
                                      <span className="client-sub">{perf.barber.title || 'Barber'}</span>
                                    </div>
                                  </div>
                                </td>
                                <td><span className="badge-role">{perf.barber.role}</span></td>
                                <td>
                                  <span className={`status-badge ${perf.barber.isActive ? 'active' : 'dormant'}`}>
                                    {perf.barber.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td><span className="visit-badge">{perf.totalBookings} bookings</span></td>
                                <td>{perf.uniqueClientsCount}</td>
                                <td>{perf.repeatClientsCount}</td>
                                <td>
                                  <span className={`days-badge ${perf.returnRate >= 50 ? 'loyalty-high' : 'loyalty-low'}`}>
                                    {perf.returnRate}%
                                  </span>
                                </td>
                                <td>{perf.noShowRate}% ({perf.noShowCount})</td>
                                <td>{perf.cancellationRate}% ({perf.cancelledCount})</td>
                                <td><strong>${perf.totalRevenue?.toFixed(2) || '0.00'}</strong></td>
                              </tr>
                            ))}
                            {(!reportsData.barberPerformance || reportsData.barberPerformance.length === 0) && (
                              <tr>
                                <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                                  No staff performance records available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Revenue Trends Table */}
                  {activeReportTab === 'trends' && (
                    <div className="retention-table-container animate-fade-in">
                      <div className="table-header">
                        <div>
                          <h2>Salon Revenue Trends</h2>
                          <p>Track daily bookings count and generated revenue salon-wide over time.</p>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-outline btn-sm csv-export-btn"
                          onClick={() => {
                            const headers = [
                              { label: 'Date', key: 'date' },
                              { label: 'Bookings Count', key: 'bookings' },
                              { label: 'Total Revenue ($)', key: 'revenue' }
                            ];
                            downloadCSV(reportsData.revenueTrends, headers, 'revenue_trends_report.csv');
                          }}
                        >
                          Export CSV
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="retention-table reports-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Bookings Count</th>
                              <th>Generated Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportsData.revenueTrends?.map(trend => (
                              <tr key={trend.date}>
                                <td><strong>{trend.date}</strong></td>
                                <td><span className="visit-badge">{trend.bookings} bookings</span></td>
                                <td><strong>${trend.revenue?.toFixed(2) || '0.00'}</strong></td>
                              </tr>
                            ))}
                            {(!reportsData.revenueTrends || reportsData.revenueTrends.length === 0) && (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                                  No revenue trends records available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Service Popularity Table */}
                  {activeReportTab === 'services' && (
                    <div className="retention-table-container animate-fade-in">
                      <div className="table-header">
                        <div>
                          <h2>Service Popularity & Performance</h2>
                          <p>Analyze booking volume and generated revenue per service type to find the salon's most in-demand services.</p>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-outline btn-sm csv-export-btn"
                          onClick={() => {
                            const headers = [
                              { label: 'Service Name', key: 'name' },
                              { label: 'Category', key: 'category' },
                              { label: 'Standard Price ($)', key: 'price' },
                              { label: 'Bookings Count', key: 'bookingsCount' },
                              { label: 'Total Revenue ($)', key: 'revenue' }
                            ];
                            downloadCSV(reportsData.servicePopularity, headers, 'service_popularity_report.csv');
                          }}
                        >
                          Export CSV
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="retention-table reports-table">
                          <thead>
                            <tr>
                              <th>Service</th>
                              <th>Category</th>
                              <th>Standard Price</th>
                              <th>Bookings Count</th>
                              <th>Total Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportsData.servicePopularity?.map(service => (
                              <tr key={service.id}>
                                <td><strong>{service.name}</strong></td>
                                <td><span className="badge-role">{service.category?.replace('-', ' ')}</span></td>
                                <td>${service.price?.toFixed(2) || '0.00'}</td>
                                <td><span className="visit-badge">{service.bookingsCount} bookings</span></td>
                                <td><strong>${service.revenue?.toFixed(2) || '0.00'}</strong></td>
                              </tr>
                            ))}
                            {(!reportsData.servicePopularity || reportsData.servicePopularity.length === 0) && (
                              <tr>
                                <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                                  No service popularity records available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Location Comparison Table */}
                  {activeReportTab === 'locations' && (
                    <div className="retention-table-container animate-fade-in">
                      <div className="table-header">
                        <div>
                          <h2>Location Performance Comparison</h2>
                          <p>Compare booking volumes, client return rates, cancellation indices, and overall revenue side-by-side across locations.</p>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-outline btn-sm csv-export-btn"
                          onClick={() => {
                            const headers = [
                              { label: 'Location Name', key: (l) => l.location.name },
                              { label: 'City', key: (l) => l.location.city },
                              { label: 'State', key: (l) => l.location.state },
                              { label: 'Total Bookings', key: 'totalBookings' },
                              { label: 'Unique Clients', key: 'uniqueClientsCount' },
                              { label: 'Repeat Clients', key: 'repeatClientsCount' },
                              { label: 'Return Rate (%)', key: 'returnRate' },
                              { label: 'No-Show Rate (%)', key: 'noShowRate' },
                              { label: 'Cancellation Rate (%)', key: 'cancellationRate' },
                              { label: 'Total Revenue ($)', key: 'totalRevenue' }
                            ];
                            downloadCSV(reportsData.locationComparison, headers, 'location_comparison_report.csv');
                          }}
                        >
                          Export CSV
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="retention-table reports-table">
                          <thead>
                            <tr>
                              <th>Location</th>
                              <th>City / State</th>
                              <th>Total Bookings</th>
                              <th>Unique Clients</th>
                              <th>Repeat Clients</th>
                              <th>Return Rate</th>
                              <th>No-Show Rate</th>
                              <th>Cancellation Rate</th>
                              <th>Total Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportsData.locationComparison?.map(loc => (
                              <tr key={loc.location._id}>
                                <td><strong>{loc.location.name}</strong></td>
                                <td>{loc.location.city}, {loc.location.state}</td>
                                <td><span className="visit-badge">{loc.totalBookings} bookings</span></td>
                                <td>{loc.uniqueClientsCount}</td>
                                <td>{loc.repeatClientsCount}</td>
                                <td>
                                  <span className={`days-badge ${loc.returnRate >= 50 ? 'loyalty-high' : 'loyalty-low'}`}>
                                    {loc.returnRate}%
                                  </span>
                                </td>
                                <td>{loc.noShowRate}% ({loc.noShowCount})</td>
                                <td>{loc.cancellationRate}% ({loc.cancelledCount})</td>
                                <td><strong>${loc.totalRevenue?.toFixed(2) || '0.00'}</strong></td>
                              </tr>
                            ))}
                            {(!reportsData.locationComparison || reportsData.locationComparison.length === 0) && (
                              <tr>
                                <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                                  No location comparison records available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Audit Notice Box */}
                  <div className="audit-notice-container">
                    <h4>Legacy Calculation Audit Correction Notice</h4>
                    <p>
                      Unlike legacy salon reporting platforms (which calculate return rates using total booking counts or include cancelled/no-show appointments, resulting in inflated repeat visitor metrics or division-by-zero <code>NaN</code> bugs for new staff members), the Elegance Performance Report strictly filters for unique clients with 2 or more confirmed or completed visits, and returns 0% when there are no clients.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 8: OUTREACH CADENCES */}
          {activeTab === 'outreach' && (
            <div className="tab-pane animate-fade-in">
              {cadencesLoading ? (
                <div className="retention-loading">Loading outreach cadences...</div>
              ) : cadences.length === 0 ? (
                <div className="retention-empty">No outreach cadences configured. Run the seed script to create the default pre-appointment reminder flow.</div>
              ) : (
                <>
                  {cadences.map(cadence => (
                    <div key={cadence._id} className="cadence-card">
                      <div className="cadence-card-header">
                        <div className="cadence-header-left">
                          <h2 className="cadence-name">{cadence.name}</h2>
                          <span className="cadence-type-badge">{cadence.type.replace('-', ' ')}</span>
                        </div>
                        <div className="cadence-header-right">
                          <div className="cadence-stats-row">
                            <span className="cadence-stat">{cadence.stats?.totalEnrollments || 0} enrolled</span>
                            <span className="cadence-stat">{cadence.stats?.totalMessagesSent || 0} sent</span>
                            <span className="cadence-stat">{cadence.stats?.completedEnrollments || 0} completed</span>
                          </div>
                          <button
                            className={`btn btn-sm ${cadence.isActive ? 'btn-gold' : 'btn-outline'}`}
                            onClick={() => handleToggleCadence(cadence)}>
                            {cadence.isActive ? 'Active' : 'Paused'}
                          </button>
                        </div>
                      </div>

                      {/* Visual Step Timeline */}
                      <div className="cadence-timeline">
                        {cadence.steps.sort((a, b) => a.order - b.order).map((step, idx) => (
                          <div key={step._id || idx} className="cadence-step-node">
                            <div className="step-connector-line"></div>
                            <div className="step-icon-circle">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                              </svg>
                            </div>
                            <div className="step-content">
                              <div className="step-timing-badge">
                                {step.delayValue} {step.delayUnit} {step.delayDirection} appointment
                              </div>
                              <div className="step-channel-tag">SMS</div>

                              {editingStep === step.order ? (
                                <div className="step-edit-form">
                                  <div className="step-edit-row">
                                    <input type="number" className="form-input" value={stepForm.delayValue}
                                      onChange={e => setStepForm(f => ({ ...f, delayValue: Number(e.target.value) }))} style={{ width: '80px' }} />
                                    <select className="form-input" value={stepForm.delayUnit}
                                      onChange={e => setStepForm(f => ({ ...f, delayUnit: e.target.value }))}>
                                      <option value="hours">hours</option>
                                      <option value="minutes">minutes</option>
                                    </select>
                                    <span>before appointment</span>
                                  </div>
                                  <textarea className="form-input" rows="3" value={stepForm.messageTemplate}
                                    onChange={e => setStepForm(f => ({ ...f, messageTemplate: e.target.value }))} />
                                  <div className="step-edit-actions">
                                    <button className="btn btn-gold btn-sm" onClick={() => handleSaveStep(cadence, step.order)}>Save</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingStep(null)}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="step-message-preview">{step.messageTemplate}</p>
                                  <button className="btn btn-outline btn-sm" onClick={() => {
                                    setEditingStep(step.order);
                                    setStepForm({ delayValue: step.delayValue, delayUnit: step.delayUnit, messageTemplate: step.messageTemplate });
                                  }}>Edit Step</button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Enrollment Log */}
                      <div className="cadence-enrollments-section">
                        <button className="btn btn-outline btn-sm" onClick={() => {
                          if (selectedCadence === cadence._id) {
                            setSelectedCadence(null);
                            setCadenceEnrollments([]);
                          } else {
                            setSelectedCadence(cadence._id);
                            loadEnrollments(cadence._id);
                          }
                        }}>
                          {selectedCadence === cadence._id ? 'Hide Enrollment Log' : 'View Enrollment Log'}
                        </button>

                        {selectedCadence === cadence._id && (
                          <div className="enrollment-log">
                            {enrollmentsLoading ? (
                              <p className="retention-loading">Loading enrollments...</p>
                            ) : cadenceEnrollments.length === 0 ? (
                              <p className="retention-empty">No enrollments yet. Appointments will auto-enroll when booked.</p>
                            ) : (
                              <div className="table-responsive">
                                <table className="retention-table">
                                  <thead>
                                    <tr>
                                      <th>Client</th>
                                      <th>Appointment</th>
                                      <th>Status</th>
                                      <th>Steps</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cadenceEnrollments.map(enr => (
                                      <tr key={enr._id}>
                                        <td>
                                          <div className="client-cell">
                                            <strong>{enr.clientId?.firstName} {enr.clientId?.lastName}</strong>
                                            <span className="client-sub">{enr.clientId?.phone}</span>
                                          </div>
                                        </td>
                                        <td>{enr.appointmentId?.date} at {enr.appointmentId?.startTime}</td>
                                        <td>
                                          <span className={`status-badge ${enr.status}`}>{enr.status}</span>
                                        </td>
                                        <td>
                                          <div className="step-status-dots">
                                            {enr.stepExecutions?.map((se, i) => (
                                              <span key={i} className={`step-dot ${se.status}`} title={`Step ${se.stepOrder}: ${se.status}${se.executedAt ? ' at ' + dayjs(se.executedAt).format('MMM D h:mm A') : ''}`}></span>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* TAB 8: AI VOICE AGENT & CALL LOGS */}
          {activeTab === 'voice' && (
            <div className="tab-pane voice-pane animate-fade-in">
              <div className="voice-dashboard-grid">
                
                {/* Trigger Manual Call Panel */}
                <div className="voice-card trigger-card">
                  <h3>Initiate Outbound Call</h3>
                  <form onSubmit={handleTriggerVoiceCall}>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">Select Client</label>
                      <select 
                        className="form-input form-select"
                        value={triggerCallForm.clientId}
                        onChange={e => setTriggerCallForm(f => ({ ...f, clientId: e.target.value }))}
                        required
                      >
                        <option value="">-- Choose Client --</option>
                        {clients.map(c => (
                          <option key={c._id} value={c._id}>{c.firstName} {c.lastName} ({c.phone})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">Call Purpose</label>
                      <select 
                        className="form-input form-select"
                        value={triggerCallForm.type}
                        onChange={e => setTriggerCallForm(f => ({ ...f, type: e.target.value }))}
                        required
                      >
                        <option value="confirmation">Appointment Confirmation</option>
                        <option value="feedback">Post-Visit Feedback Collection</option>
                        <option value="re-engagement">Dormant Client Re-engagement</option>
                      </select>
                    </div>

                    {triggerCallForm.type === 'confirmation' && (
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label className="form-label">Select Appointment</label>
                        <select 
                          className="form-input form-select"
                          value={triggerCallForm.appointmentId}
                          onChange={e => setTriggerCallForm(f => ({ ...f, appointmentId: e.target.value }))}
                          required={triggerCallForm.type === 'confirmation'}
                        >
                          <option value="">-- Choose Appointment --</option>
                          {appointments
                            .filter(a => a.clientId?._id === triggerCallForm.clientId || a.clientId === triggerCallForm.clientId)
                            .map(a => (
                              <option key={a._id} value={a._id}>
                                {a.date} at {dayjs(`2024-01-01 ${a.startTime}`).format('h:mm A')} - {a.serviceId?.name || 'Service'}
                              </option>
                            ))
                          }
                        </select>
                        {appointments.filter(a => a.clientId?._id === triggerCallForm.clientId || a.clientId === triggerCallForm.clientId).length === 0 && triggerCallForm.clientId && (
                          <small style={{ color: '#DC2626', marginTop: '4px', display: 'block' }}>
                            No appointments found for this client to confirm.
                          </small>
                        )}
                      </div>
                    )}

                    {voiceTabMessage.text && (
                      <div className={`alert-banner ${voiceTabMessage.type === 'error' ? 'error-banner' : 'success-banner'}`} style={{ marginBottom: '16px', padding: '10px', borderRadius: '4px', fontSize: '0.85em', background: voiceTabMessage.type === 'error' ? 'rgba(220, 38, 38, 0.05)' : 'rgba(34, 197, 94, 0.05)', color: voiceTabMessage.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${voiceTabMessage.type === 'error' ? '#FCA5A5' : '#86EFAC'}` }}>
                        {voiceTabMessage.text}
                      </div>
                    )}

                    <button 
                      type="submit" 
                      className="btn btn-gold btn-lg" 
                      style={{ width: '100%' }}
                      disabled={voiceLoading}
                    >
                      {voiceLoading ? 'Triggering Call...' : 'Initiate Outbound Call'}
                    </button>
                  </form>
                </div>

                {/* Call Logs Panel */}
                <div className="voice-card logs-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1em', fontFamily: 'var(--font-display)' }}>Outbound Call Logs</h3>
                    <button className="btn btn-outline btn-sm" onClick={loadCallLogs} disabled={voiceLoading}>
                      Refresh Logs
                    </button>
                  </div>

                  <div className="table-responsive">
                    <table className="clients-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Outcome</th>
                          <th>Duration</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {callLogs.map(log => (
                          <tr key={log._id}>
                            <td>
                              <strong>{log.clientId?.firstName} {log.clientId?.lastName}</strong>
                              <div style={{ fontSize: '0.8em', color: 'var(--color-gray-400)' }}>{log.clientId?.phone}</div>
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{log.type}</td>
                            <td>
                              <span className={`status-pill ${log.status}`}>
                                {log.status}
                              </span>
                            </td>
                            <td>
                              <strong style={{ fontSize: '0.9em' }}>{log.outcome || 'Pending'}</strong>
                            </td>
                            <td>{log.duration}s</td>
                            <td>
                              <button className="btn btn-outline btn-sm" onClick={() => handleOpenCallDetails(log)}>
                                Transcript
                              </button>
                            </td>
                          </tr>
                        ))}
                        {callLogs.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-400)' }}>
                              No outbound call logs found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS & CONFIGURATION */}
          {activeTab === 'settings' && (
            <div className="tab-pane settings-pane animate-fade-in">
              <div className="settings-grid">
                <div className="settings-section-card">
                  <h3>Business branding & Profile</h3>
                  <div className="form-group">
                    <label className="form-label">Business Name</label>
                    <input type="text" className="form-input" value={settingsForm.name}
                      onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Email Address</label>
                    <input type="email" className="form-input" value={settingsForm.contactEmail}
                      onChange={e => setSettingsForm(f => ({ ...f, contactEmail: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Website URL</label>
                    <input type="text" className="form-input" value={settingsForm.website}
                      onChange={e => setSettingsForm(f => ({ ...f, website: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Instagram Handle</label>
                    <input type="text" className="form-input" value={settingsForm.instagramHandle}
                      onChange={e => setSettingsForm(f => ({ ...f, instagramHandle: e.target.value }))} />
                  </div>
                </div>

                <div className="settings-section-card">
                  <h3>Twilio SMS Gateway</h3>
                  <div className="form-group">
                    <label className="form-label">Twilio Toll-Free Sender Number</label>
                    <input type="text" className="form-input" placeholder="+18005550199" value={settingsForm.twilioTollFreeNumber}
                      onChange={e => setSettingsForm(f => ({ ...f, twilioTollFreeNumber: e.target.value }))} />
                    <small className="help-text">Input verified toll-free business sender number to bypass local carrier spam filters.</small>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Appointment Reminder Cadence (Hours Before)</label>
                    <input type="number" className="form-input" value={settingsForm.reminderHours}
                      onChange={e => setSettingsForm(f => ({ ...f, reminderHours: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group checkbox-group">
                    <input type="checkbox" id="voiceCallEscalation" checked={settingsForm.voiceCallEscalation}
                      onChange={e => setSettingsForm(f => ({ ...f, voiceCallEscalation: e.target.checked }))} />
                    <label htmlFor="voiceCallEscalation">Enable outbound Voice Agent escalation if SMS fails to confirm</label>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h3>AI Agent Permissions</h3>
                  <div className="form-group checkbox-group">
                    <input type="checkbox" id="aiActionPermissions" checked={settingsForm.aiActionPermissions}
                      onChange={e => setSettingsForm(f => ({ ...f, aiActionPermissions: e.target.checked }))} />
                    <label htmlFor="aiActionPermissions">Allow AI Copilot to execute automated SMS campaigns directly</label>
                  </div>
                  <div className="form-group checkbox-group">
                    <input type="checkbox" id="aiAutoReschedule" checked={settingsForm.aiAutoReschedule}
                      onChange={e => setSettingsForm(f => ({ ...f, aiAutoReschedule: e.target.checked }))} />
                    <label htmlFor="aiAutoReschedule">Allow voice assistant to auto-reschedule/update backend appointments</label>
                  </div>
                </div>
              </div>

              <div className="settings-actions-footer">
                <button className="btn btn-gold btn-lg" onClick={handleSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving Configurations...' : 'Save Settings Configuration'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className={`copilot-container ${showCopilot ? 'active' : ''}`}>
        <button className="copilot-fab" onClick={() => setShowCopilot(!showCopilot)}>
          <span className="fab-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-3.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-3.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z"></path></svg>
          </span>
          <span className="fab-label">AI Copilot</span>
        </button>

        <div className="copilot-drawer">
          <div className="copilot-header">
            <div className="copilot-header-info">
              <h3>Elegance Copilot</h3>
              <span className="copilot-status">Online · database Access</span>
            </div>
            <button className="copilot-close" onClick={() => setShowCopilot(false)}>✕</button>
          </div>

          <div className="copilot-messages">
            {chatHistory.map((chat, idx) => (
              <div key={idx} className={`chat-bubble ${chat.sender}`}>
                <p className="chat-text">{chat.text}</p>
                {chat.actions && chat.actions.map((act, actIdx) => {
                  if (act.type === 'cancel_appointment') {
                    return (
                      <div key={actIdx} className="copilot-action-card">
                        <span className="action-type-tag">Cancelled Appointment</span>
                        <p className="action-summary">
                          Cancelled appointment for {act.clientName || 'Client'}.
                          {act.smsSent ? ' Notification SMS sent.' : ' SMS not sent.'}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={actIdx} className="copilot-action-card">
                      <span className="action-type-tag">Executed Twilio SMS Action</span>
                      <p className="action-summary">Sent {act.count} message(s) successfully.</p>
                    </div>
                  );
                })}
              </div>
            ))}
            {copilotLoading && (
              <div className="chat-bubble bot loading">
                <span className="loading-dot"></span>
                <span className="loading-dot"></span>
                <span className="loading-dot"></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="copilot-suggestions">
            <button type="button" className="suggestion-pill" onClick={() => handleSendCopilot("How many appointments do we have tomorrow?")}>
              Appointments Tomorrow
            </button>
            <button type="button" className="suggestion-pill" onClick={() => handleSendCopilot("Who is our most popular barber?")}>
              Most Popular Barber
            </button>
            <button type="button" className="suggestion-pill" onClick={() => handleSendCopilot("Which clients are slip-aways?")}>
              Slip-away Clients
            </button>
            <button type="button" className="suggestion-pill" onClick={() => handleSendCopilot("Send SMS reminders to tomorrow's appointments")}>
              Send Reminders
            </button>
          </div>

          <div className="copilot-input-area">
            <input
              type="text"
              className="copilot-input"
              placeholder="Ask copilot to query database or trigger SMS..."
              value={copilotInput}
              onChange={e => setCopilotInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendCopilot()}
            />
             <button className={`copilot-mic ${isListening ? 'listening' : ''}`} onClick={handleToggleListening} title="Voice Command">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block', margin: 'auto' }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </button>
            <button className="btn btn-gold copilot-send" onClick={() => handleSendCopilot()}>Send</button>
          </div>
        </div>
      </div>

      {/* Appointment Detail Panel */}
      {selectedAppointment && (
        <div className="detail-overlay" onClick={() => setSelectedAppointment(null)}>
          <div className="detail-panel animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>Appointment Details</h3>
              <button className="btn btn-ghost" onClick={() => setSelectedAppointment(null)}>✕</button>
            </div>

            <div className="detail-body">
              <div className="detail-section">
                <h4>Client</h4>
                <p className="detail-value">
                  {selectedAppointment.clientId?.firstName || selectedAppointment.firstName || 'Client'}{' '}
                  {selectedAppointment.clientId?.lastName || selectedAppointment.lastName || ''}
                </p>
                <p className="detail-sub">{selectedAppointment.clientId?.phone || selectedAppointment.phone}</p>
                {(selectedAppointment.clientId?.email || selectedAppointment.email) && (
                  <p className="detail-sub">{selectedAppointment.clientId?.email || selectedAppointment.email}</p>
                )}
              </div>

              <div className="detail-section">
                <h4>Service</h4>
                <p className="detail-value">{selectedAppointment.serviceId?.name}</p>
                <p className="detail-sub">{selectedAppointment.serviceId?.duration}min · ${(selectedAppointment.serviceId?.price / 100).toFixed(0)}</p>
              </div>

              <div className="detail-section">
                <h4>Barber</h4>
                <p className="detail-value">{selectedAppointment.barberId?.name}</p>
                <p className="detail-sub">{selectedAppointment.barberId?.title}</p>
              </div>

              <div className="detail-section">
                <h4>Date & Time</h4>
                <p className="detail-value">{dayjs(selectedAppointment.date).format('ddd, MMM D, YYYY')}</p>
                <p className="detail-sub">
                  {dayjs(`2024-01-01 ${selectedAppointment.startTime}`).format('h:mm A')} –{' '}
                  {dayjs(`2024-01-01 ${selectedAppointment.endTime}`).format('h:mm A')}
                </p>
              </div>

              <div className="detail-section">
                <h4>Status</h4>
                <div className="status-buttons">
                  {['confirmed', 'completed', 'no-show', 'cancelled'].map(s => (
                    <button key={s}
                      className={`btn btn-sm ${selectedAppointment.status === s ? 'active-status' : 'btn-outline'}`}
                      onClick={() => handleStatusChange(selectedAppointment._id, s)}>
                      {s.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {selectedAppointment.haircutStyle && (
                <div className="detail-section">
                  <h4>Haircut Style</h4>
                  <span className="spec-tag">{selectedAppointment.haircutStyle.replace(/-/g, ' ')}</span>
                </div>
              )}

              <div className="detail-section">
                <h4>Reference Photo / Attachment</h4>
                {selectedAppointment.referencePhoto ? (
                  <div className="detail-photo-wrapper">
                    <img
                      src={selectedAppointment.referencePhoto.startsWith('http') ? selectedAppointment.referencePhoto : `${IMAGE_BASE}${selectedAppointment.referencePhoto}`}
                      alt="Reference"
                      className="ref-photo"
                    />
                    <button className="btn btn-sm btn-outline btn-danger mt-2" onClick={() => handleRemovePhoto(selectedAppointment._id)}>
                      Remove Photo
                    </button>
                  </div>
                ) : (
                  <div className="photo-upload-container">
                    <label className="photo-upload-label">
                      <input type="file" accept="image/*" onChange={e => handlePhotoUpload(selectedAppointment._id, e)} hidden />
                      <span className="upload-btn">＋ Add/Upload Photo</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>Notes</h4>
                <textarea className="form-input notes-input"
                  defaultValue={selectedAppointment.notes}
                  placeholder="Add notes about this appointment..."
                  onBlur={e => handleNotesUpdate(selectedAppointment._id, e.target.value)} />
              </div>

              <div className="detail-section detail-meta">
                <small>Source: {selectedAppointment.source}</small>
                <small>SMS Status: {selectedAppointment.smsConfirmationSent ? 'Sent' : 'Failed / Not Sent'}</small>
                <small>Created: {dayjs(selectedAppointment.createdAt).format('MMM D, h:mm A')}</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div className="detail-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel add-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>New Appointment</h3>
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="form-group">
                <label className="form-label">Client Name</label>
                <div className="name-row">
                  <input className="form-input" placeholder="First" value={addForm.firstName}
                    onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))} />
                  <input className="form-input" placeholder="Last" value={addForm.lastName}
                    onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" placeholder="(312) 555-1234" value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Service</label>
                <select className="form-input form-select" value={addForm.serviceId}
                  onChange={e => setAddForm(f => ({ ...f, serviceId: e.target.value }))}>
                  <option value="">Select service...</option>
                  {services.map(s => <option key={s._id} value={s._id}>{s.name} - ${(s.price / 100).toFixed(0)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Barber</label>
                <select className="form-input form-select" value={addForm.barberId}
                  onChange={e => setAddForm(f => ({ ...f, barberId: e.target.value }))}>
                  <option value="">Select barber...</option>
                  {barbers.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div className="name-row">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={addForm.date}
                    onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input type="time" className="form-input" value={addForm.startTime}
                    onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Source</label>
                <select className="form-input form-select" value={addForm.source}
                  onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}>
                  <option value="walk-in">Walk-in</option>
                  <option value="phone">Phone</option>
                  <option value="instagram">Instagram</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: '8px' }}
                onClick={handleAddAppointment}
                disabled={!addForm.firstName || !addForm.phone || !addForm.serviceId || !addForm.barberId}>
                Create Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff (Barber) Modal */}
      {showBarberModal && (
        <div className="detail-overlay" onClick={() => setShowBarberModal(false)}>
          <div className="detail-panel add-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>{editingBarberId ? 'Edit Staff Details' : 'Add Staff Member'}</h3>
              <button className="btn btn-ghost" onClick={() => setShowBarberModal(false)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input type="text" className="form-input" value={barberForm.name}
                  onChange={e => setBarberForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Job Title</label>
                <input type="text" className="form-input" placeholder="e.g. Master Barber, Skin Fade Expert" value={barberForm.title}
                  onChange={e => setBarberForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Biography</label>
                <textarea className="form-input" value={barberForm.bio} rows="3"
                  onChange={e => setBarberForm(f => ({ ...f, bio: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Specialisms (Comma-separated)</label>
                <input type="text" className="form-input" placeholder="e.g. skin-fade, beard, color" value={barberForm.specialismsText}
                  onChange={e => setBarberForm(f => ({ ...f, specialismsText: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input form-select" value={barberForm.role}
                  onChange={e => setBarberForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="owner">Owner</option>
                  <option value="staffer">Senior Staffer</option>
                  <option value="basic_staffer">Basic Staffer</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Profile Picture</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {barberForm.photo && (
                    <img src={barberForm.photo.startsWith('http') ? barberForm.photo : `${IMAGE_BASE}${barberForm.photo}`} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <input type="file" onChange={handleBarberPhotoUpload} />
                </div>
              </div>

              <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: '16px' }}
                onClick={handleSaveBarber} disabled={!barberForm.name}>
                {editingBarberId ? 'Update Staff Info' : 'Create Staff Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Modal */}
      {showServiceModal && (
        <div className="detail-overlay" onClick={() => setShowServiceModal(false)}>
          <div className="detail-panel add-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>{editingServiceId ? 'Edit Service Details' : 'Add New Service'}</h3>
              <button className="btn btn-ghost" onClick={() => setShowServiceModal(false)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="form-group">
                <label className="form-label">Service Name</label>
                <input type="text" className="form-input" value={serviceForm.name}
                  onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input form-select" value={serviceForm.category}
                  onChange={e => setServiceForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="mens-services">Men's Services</option>
                  <option value="womens-services">Women's Services</option>
                  <option value="color">Color Catalog</option>
                  <option value="mens-color">Men's Color Catalog</option>
                  <option value="smoothing-perms">Smoothing & Perms</option>
                  <option value="threading-wax">Threading & Waxing</option>
                </select>
              </div>
              <div className="name-row">
                <div className="form-group">
                  <label className="form-label">Duration (Minutes)</label>
                  <input type="number" className="form-input" value={serviceForm.duration}
                    onChange={e => setServiceForm(f => ({ ...f, duration: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (USD)</label>
                  <input type="text" className="form-input" placeholder="45.00" value={serviceForm.priceDollars}
                    onChange={e => setServiceForm(f => ({ ...f, priceDollars: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" value={serviceForm.description} rows="3"
                  onChange={e => setServiceForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Style Tags (Comma-separated)</label>
                <input type="text" className="form-input" placeholder="e.g. fade, classic, beard" value={serviceForm.styleTagsText}
                  onChange={e => setServiceForm(f => ({ ...f, styleTagsText: e.target.value }))} />
              </div>

              <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: '16px' }}
                onClick={handleSaveService} disabled={!serviceForm.name || !serviceForm.priceDollars}>
                {editingServiceId ? 'Update Service Catalog' : 'Add Service Catalog'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Modal */}
      {showClientModal && (
        <div className="detail-overlay" onClick={() => setShowClientModal(false)}>
          <div className="detail-panel add-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>{editingClientId ? 'Edit Client Record' : 'Add New Client'}</h3>
              <button className="btn btn-ghost" onClick={() => setShowClientModal(false)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="name-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input type="text" className="form-input" value={clientForm.firstName}
                    onChange={e => setClientForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input type="text" className="form-input" value={clientForm.lastName}
                    onChange={e => setClientForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input type="text" className="form-input" placeholder="+1xxxxxxxxxx" value={clientForm.phone}
                  onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))} />
                {clientForm.phone && !isValidE164(clientForm.phone) && (
                  <small style={{ color: '#DC2626', marginTop: '4px', display: 'block' }}>
                    Invalid format. Enforce E.164 (e.g. +13125550199 or 10 digits).
                  </small>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-input" value={clientForm.email}
                  onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Hair Type / Preferences</label>
                <input type="text" className="form-input" placeholder="e.g. curly, straight, fades only" value={clientForm.hairType}
                  onChange={e => setClientForm(f => ({ ...f, hairType: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Administrative Notes</label>
                <textarea className="form-input" value={clientForm.notes} rows="3"
                  onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="form-group checkbox-group">
                <input type="checkbox" id="isTrustedClient" checked={clientForm.isTrusted}
                  onChange={e => setClientForm(f => ({ ...f, isTrusted: e.target.checked }))} />
                <label htmlFor="isTrustedClient">Trusted VIP Client status</label>
              </div>

              <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: '16px' }}
                onClick={handleSaveClient} disabled={!clientForm.firstName || !clientForm.phone || !isValidE164(clientForm.phone)}>
                {editingClientId ? 'Update Client Profile' : 'Register Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Re-engagement Modal */}
      {selectedRetentionClient && (
        <div className="detail-overlay" onClick={() => setSelectedRetentionClient(null)}>
          <div className="detail-panel add-modal sms-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>Send SMS Promotion</h3>
              <button className="btn btn-ghost" onClick={() => setSelectedRetentionClient(null)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="sms-client-summary">
                <p>Sending message to: <strong>{selectedRetentionClient.firstName} {selectedRetentionClient.lastName}</strong></p>
                <p className="client-sub">{selectedRetentionClient.phone} · Last visited {selectedRetentionClient.daysSinceLastVisit} days ago</p>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Custom Re-engagement Message</label>
                <textarea className="form-input sms-textarea"
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                  rows={5}
                  placeholder="Enter custom SMS text..." />
              </div>

              {smsSuccess && <div className="sms-success-banner">{smsSuccess}</div>}

              <button className="btn btn-gold btn-lg" style={{ width: '100%', marginTop: '16px' }}
                onClick={handleSendSMS}
                disabled={smsSending || !smsMessage}>
                {smsSending ? 'Sending SMS...' : 'Send Re-engagement SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Clients Modal */}
      {showMergeModal && (
        <div className="detail-overlay" onClick={() => setShowMergeModal(false)}>
          <div className="detail-panel add-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>Merge Client Accounts</h3>
              <button className="btn btn-ghost" onClick={() => setShowMergeModal(false)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="alert-banner warning-banner" style={{ marginBottom: '16px', background: 'var(--color-bg-light)', borderLeft: '4px solid var(--color-gold)', padding: '12px', borderRadius: '4px' }}>
                <strong style={{ color: 'var(--color-gold)' }}>Warning:</strong> This action is irreversible. All booking history, visits, revenue, and notes from the duplicate client will be merged into the target master client. The duplicate client profile will be deleted.
              </div>

              {mergeSourceClient && (
                <div className="form-group">
                  <label className="form-label">Duplicate Profile (To be deleted)</label>
                  <div className="client-display-box" style={{ padding: '12px', background: 'var(--color-bg-light)', borderRadius: '4px', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
                    <strong>{mergeSourceClient.firstName} {mergeSourceClient.lastName}</strong>
                    <div style={{ fontSize: '0.85em', color: 'var(--color-gray-400)', marginTop: '4px' }}>
                      Phone: {mergeSourceClient.phone} · Email: {mergeSourceClient.email || '—'} · Visits: {mergeSourceClient.visitCount || 0}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Select Target Master Client (To keep)</label>
                <select 
                  className="form-input form-select" 
                  value={mergeTargetId} 
                  onChange={e => setMergeTargetId(e.target.value)}
                >
                  <option value="">-- Choose Master Client --</option>
                  {clients
                    .filter(c => !mergeSourceClient || c._id !== mergeSourceClient._id)
                    .map(c => (
                      <option key={c._id} value={c._id}>
                        {c.firstName} {c.lastName} ({c.phone} - {c.visitCount || 0} visits)
                      </option>
                    ))
                  }
                </select>
              </div>

              {mergeTargetId && mergeSourceClient && (() => {
                const target = clients.find(c => c._id === mergeTargetId);
                if (!target) return null;
                return (
                  <div className="merge-preview-box" style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-light)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95em' }}>Merged Profile Preview</h4>
                    <table style={{ width: '100%', fontSize: '0.85em', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--color-gray-400)' }}>Name:</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}><strong>{target.firstName} {target.lastName}</strong></td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--color-gray-400)' }}>Phone:</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>{target.phone}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--color-gray-400)' }}>Visits:</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>{(target.visitCount || 0) + (mergeSourceClient.visitCount || 0)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--color-gray-400)' }}>Revenue:</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>${(((target.totalRevenue || 0) + (mergeSourceClient.totalRevenue || 0)) / 100).toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <button 
                className="btn btn-gold btn-lg" 
                style={{ width: '100%', marginTop: '20px' }}
                onClick={handleExecuteMerge} 
                disabled={!mergeTargetId || mergeLoading}
              >
                {mergeLoading ? 'Merging Profiles...' : 'Confirm & Execute Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Wizard Modal */}
      {showImportModal && (
        <div className="detail-overlay" onClick={() => setShowImportModal(false)}>
          <div className="detail-panel add-modal wizard-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>Client Import Wizard</h3>
              <button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            
            {/* Step Indicators */}
            <div className="wizard-steps">
              <div className={`step-item ${importStep >= 1 ? 'active' : ''}`} style={{ fontWeight: importStep === 1 ? 'bold' : 'normal' }}>1. Upload</div>
              <div className={`step-item ${importStep >= 2 ? 'active' : ''}`} style={{ fontWeight: importStep === 2 ? 'bold' : 'normal' }}>2. Map Fields</div>
              <div className={`step-item ${importStep >= 3 ? 'active' : ''}`} style={{ fontWeight: importStep === 3 ? 'bold' : 'normal' }}>3. Strategy</div>
              <div className={`step-item ${importStep >= 4 ? 'active' : ''}`} style={{ fontWeight: importStep === 4 ? 'bold' : 'normal' }}>4. Results</div>
            </div>

            <div className="detail-body">
              
              {/* STEP 1: UPLOAD */}
              {importStep === 1 && (
                <div className="wizard-step-content animate-fade-in">
                  <p style={{ color: 'var(--color-gray-400)', fontSize: '0.9em', marginBottom: '20px' }}>
                    Upload a client export CSV file (e.g. from Booksy). The wizard will help you map columns and handle duplicates.
                  </p>
                  <div className="csv-upload-dropzone">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" style={{ marginBottom: '12px', display: 'inline-block' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>Choose CSV File</p>
                    <small style={{ color: 'var(--color-gray-400)', display: 'block', marginBottom: '12px' }}>Only standard .csv files are supported</small>
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleFileUpload} 
                      style={{ margin: '0 auto', fontSize: '0.9em' }} 
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: MAP FIELDS */}
              {importStep === 2 && (
                <div className="wizard-step-content animate-fade-in">
                  <p style={{ color: 'var(--color-gray-400)', fontSize: '0.9em', marginBottom: '16px' }}>
                    Map CSV headers to the Salon Client database fields. <strong>First Name</strong> and <strong>Phone Number</strong> are required.
                  </p>

                  <div className="mapping-table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Database Field</th>
                          <th>Mapped CSV Column</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'firstName', label: 'First Name *' },
                          { key: 'lastName', label: 'Last Name' },
                          { key: 'phone', label: 'Phone Number *' },
                          { key: 'email', label: 'Email' },
                          { key: 'notes', label: 'Notes' },
                          { key: 'hairType', label: 'Hair Type' },
                          { key: 'visitCount', label: 'Total Visits' },
                          { key: 'totalRevenue', label: 'Total Revenue' },
                          { key: 'noShowCount', label: 'No-Shows' },
                        ].map(field => (
                          <tr key={field.key}>
                            <td style={{ fontWeight: '500' }}>{field.label}</td>
                            <td>
                              <select 
                                className="form-input form-select"
                                style={{ padding: '6px 10px', height: 'auto', fontSize: '0.95em' }}
                                value={importMapping[field.key] || ''}
                                onChange={e => setImportMapping(m => ({ ...m, [field.key]: e.target.value }))}
                              >
                                <option value="">-- Ignore Field --</option>
                                {csvHeaders.map((header, idx) => (
                                  <option key={idx} value={String(idx)}>{header}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                    <button className="btn btn-outline" onClick={() => setImportStep(1)}>Back</button>
                    <button 
                      className="btn btn-gold" 
                      onClick={() => setImportStep(3)}
                      disabled={!importMapping.firstName || !importMapping.phone}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: DEDUPE STRATEGY & CONFIRM */}
              {importStep === 3 && (
                <div className="wizard-step-content animate-fade-in">
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontFamily: 'var(--font-display)' }}>Choose Conflict Strategy</h4>
                  <p style={{ color: 'var(--color-gray-400)', fontSize: '0.9em', marginBottom: '16px' }}>
                    Select how the system should handle records with phone numbers that already exist in your directory.
                  </p>

                  <div className="strategy-options" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    <label className={`strategy-option-card ${dedupeStrategy === 'merge' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name="dedupeStrategy" 
                        value="merge" 
                        checked={dedupeStrategy === 'merge'} 
                        onChange={() => setDedupeStrategy('merge')}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>Merge History (Recommended)</strong>
                      <p style={{ paddingLeft: '22px' }}>
                        Add up visits, revenue, and no-shows from both records. Update notes and preserve both first/last visit dates.
                      </p>
                    </label>

                    <label className={`strategy-option-card ${dedupeStrategy === 'overwrite' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name="dedupeStrategy" 
                        value="overwrite" 
                        checked={dedupeStrategy === 'overwrite'} 
                        onChange={() => setDedupeStrategy('overwrite')}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>Overwrite Profile</strong>
                      <p style={{ paddingLeft: '22px' }}>
                        Replace fields in the database with information from the CSV. Visits/revenue stats are overwritten.
                      </p>
                    </label>

                    <label className={`strategy-option-card ${dedupeStrategy === 'skip' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name="dedupeStrategy" 
                        value="skip" 
                        checked={dedupeStrategy === 'skip'} 
                        onChange={() => setDedupeStrategy('skip')}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>Skip Duplicates</strong>
                      <p style={{ paddingLeft: '22px' }}>
                        Ignore any CSV rows that match an existing phone number. No database profiles are changed.
                      </p>
                    </label>
                  </div>

                  <div className="preview-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.9em', color: 'var(--color-gray-700)' }}>Mapped Data Sample</span>
                      <small style={{ color: 'var(--color-gray-400)' }}>Parsed {csvRows.length} total rows</small>
                    </div>
                    
                    <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.85em', color: 'var(--color-gray-600)' }}>
                      {csvRows.slice(0, 3).map((row, rIdx) => {
                        const nameVal = row[Number(importMapping.firstName)] || '';
                        const phoneVal = row[Number(importMapping.phone)] || '';
                        return (
                          <div key={rIdx} style={{ padding: '6px 0', borderBottom: rIdx < 2 ? '1px solid var(--color-gray-100)' : 'none' }}>
                            <strong>Row {rIdx + 1}:</strong> {nameVal} ({phoneVal}) 
                            {importMapping.email && row[Number(importMapping.email)] && ` · ${row[Number(importMapping.email)]}`}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn btn-outline" onClick={() => setImportStep(2)}>Back</button>
                    <button 
                      className="btn btn-gold" 
                      onClick={handleExecuteImport}
                      disabled={importLoading}
                    >
                      {importLoading ? 'Importing...' : 'Execute Import'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: RESULTS */}
              {importStep === 4 && importResults && (
                <div className="wizard-step-content animate-fade-in" style={{ textAlign: 'center', padding: '10px' }}>
                  <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1em', fontFamily: 'var(--font-display)' }}>Import Completed!</h4>
                  <p style={{ color: 'var(--color-gray-400)', fontSize: '0.9em', marginBottom: '20px' }}>
                    The CSV import was processed successfully.
                  </p>

                  <div className="results-summary-grid">
                    <div className="results-summary-card">
                      <span className="number">{importResults.imported || 0}</span>
                      <span className="label">New Imported</span>
                    </div>
                    <div className="results-summary-card">
                      <span className="number" style={{ color: 'var(--color-gray-800)' }}>{importResults.merged || 0}</span>
                      <span className="label">Merged/Updated</span>
                    </div>
                    <div className="results-summary-card">
                      <span className="number" style={{ color: 'var(--color-gray-400)' }}>{importResults.skipped || 0}</span>
                      <span className="label">Skipped</span>
                    </div>
                  </div>

                  <button className="btn btn-gold btn-lg" style={{ width: '100%' }} onClick={() => setShowImportModal(false)}>
                    Finish
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* AI Voice Call Details / Transcript Modal */}
      {showCallDetailsModal && selectedCallLog && (
        <div className="detail-overlay" onClick={() => setShowCallDetailsModal(false)}>
          <div className="detail-panel add-modal sms-modal animate-slide-in" onClick={e => e.stopPropagation()} style={{ width: '500px', maxWidth: '90vw' }}>
            <div className="detail-header">
              <h3>Voice Call Details</h3>
              <button className="btn btn-ghost" onClick={() => setShowCallDetailsModal(false)}>✕</button>
            </div>
            <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 60px)', padding: '20px' }}>
              
              {/* Metadata summary */}
              <div className="call-metadata-summary" style={{ padding: '12px', background: 'var(--color-bg-light)', borderRadius: '6px', border: '1px solid var(--color-border)', marginBottom: '16px', fontSize: '0.9em' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-gray-400)' }}>Client:</span>
                  <strong>{selectedCallLog.clientId?.firstName} {selectedCallLog.clientId?.lastName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-gray-400)' }}>Purpose:</span>
                  <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{selectedCallLog.type} Call</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-gray-400)' }}>Outcome:</span>
                  <strong style={{ color: 'var(--color-gold)' }}>{selectedCallLog.outcome || 'Pending'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-gray-400)' }}>Duration:</span>
                  <span>{selectedCallLog.duration} seconds</span>
                </div>
                {selectedCallLog.summary && (
                  <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                    <span style={{ color: 'var(--color-gray-400)', display: 'block', marginBottom: '2px', fontSize: '0.85em' }}>AI Call Summary:</span>
                    <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.9em', lineHeight: '1.4' }}>"{selectedCallLog.summary}"</p>
                  </div>
                )}
              </div>

              {/* Chat Transcript Area */}
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95em', fontFamily: 'var(--font-display)' }}>Call Dialogue Transcript</h4>
              <div className="call-transcript-container" style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-light)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedCallLog.transcript && selectedCallLog.transcript.map((turn, index) => (
                  <div 
                    key={index} 
                    className={`chat-bubble-wrapper ${turn.speaker}`}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: turn.speaker === 'agent' ? 'flex-start' : 'flex-end',
                      width: '100%'
                    }}
                  >
                    <span style={{ fontSize: '0.75em', color: 'var(--color-gray-400)', marginBottom: '2px', marginLeft: turn.speaker === 'agent' ? '4px' : '0', marginRight: turn.speaker === 'customer' ? '4px' : '0' }}>
                      {turn.speaker === 'agent' ? 'AI Voice Agent' : 'Customer'}
                    </span>
                    <div 
                      className={`chat-bubble ${turn.speaker}`}
                      style={{ 
                        padding: '10px 14px', 
                        borderRadius: '12px', 
                        maxWidth: '85%', 
                        fontSize: '0.9em', 
                        lineHeight: '1.4',
                        background: turn.speaker === 'agent' ? 'var(--color-white)' : 'rgba(212, 175, 55, 0.1)',
                        color: 'var(--color-text)',
                        border: turn.speaker === 'agent' ? '1px solid var(--color-border)' : '1px solid rgba(212, 175, 55, 0.2)',
                        borderTopLeftRadius: turn.speaker === 'agent' ? '0' : '12px',
                        borderTopRightRadius: turn.speaker === 'customer' ? '0' : '12px'
                      }}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
                {(!selectedCallLog.transcript || selectedCallLog.transcript.length === 0) && (
                  <div style={{ textAlign: 'center', color: 'var(--color-gray-400)', margin: 'auto', fontSize: '0.9em' }}>
                    No conversation dialogue logged.
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
