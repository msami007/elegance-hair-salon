import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAppointments, getBarbers, getLocations, getServices,
  updateAppointment, createAppointment, getRetentionData,
  sendRetentionSMS, IMAGE_BASE, createBarber, updateBarber,
  deleteBarber, createService, updateService, deleteService,
  createClient, updateClient, getClients, updateSalonSettings,
  sendCopilotMessage, uploadPhoto, getSalonBySlug, getBarberPerformanceReport
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

  // AI Copilot State
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'bot', text: 'Hello, I am your Elegance Copilot. How can I help you manage the salon today? You can ask me questions about appointments, barbers, or send SMS reminders!' }
  ]);
  const [isListening, setIsListening] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Reports States
  const [reportsData, setReportsData] = useState({ summary: {}, barberPerformance: [] });
  const [reportsLoading, setReportsLoading] = useState(false);

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
    return ((h - 8) * 60 + m) / 60 * 64; // 64px per hour
  };

  const getSlotHeight = (startTime, endTime) => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(duration / 60 * 64, 28);
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
    await updateAppointment(id, { notes });
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

  const handleSaveClient = async () => {
    try {
      const payload = {
        salonId,
        ...clientForm
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

    setChatHistory(prev => [...prev, { sender: 'user', text }]);
    setCopilotInput('');
    setCopilotLoading(true);

    try {
      const res = await sendCopilotMessage(text, salonId);
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
  };

  return (
    <div className="admin-layout">
      {/* Booksy Sidebar Navigation */}
      <aside className="booksy-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.jpeg" alt="Elegance Logo" className="brand-logo" />
          <div className="brand-title">
            <h2>Elegance</h2>
            <span className="brand-subtitle">Management Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </span> Calendar
          </button>
          <button className={`nav-item ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </span> Barbers & Staff
          </button>
          <button className={`nav-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
            </span> Services Catalog
          </button>
          <button className={`nav-item ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </span> Clients Directory
          </button>
          <button className={`nav-item ${activeTab === 'retention' ? 'active' : ''}`} onClick={() => setActiveTab('retention')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            </span> AI Client Retention
          </button>
          <button className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
            </span> Reports
          </button>
          <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </span> Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <a href="/" className="booking-link">← Client Booking Site</a>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="admin-main">
        {/* Top bar with location selector and actions */}
        <header className="main-header">
          <div className="header-left">
            <h1 className="tab-title">
              {activeTab === 'calendar' && 'Calendar Schedule'}
              {activeTab === 'staff' && 'Barbers & Staff Management'}
              {activeTab === 'services' && 'Services Catalog'}
              {activeTab === 'clients' && 'Client Directory'}
              {activeTab === 'retention' && 'AI Client Retention Dashboard'}
              {activeTab === 'reports' && 'Staff Performance & Analytics'}
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
              <button className="btn btn-gold" onClick={() => handleOpenClientModal()}>
                + Add Client
              </button>
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
                          return appts.map(appt => (
                            <div key={appt._id}
                              className={`appt-block ${appt.status}`}
                              style={{
                                top: `${getSlotPosition(appt.startTime)}px`,
                                height: `${getSlotHeight(appt.startTime, appt.endTime)}px`,
                              }}
                              onClick={() => setSelectedAppointment(appt)}
                              title={`${appt.firstName} ${appt.lastName} - ${appt.serviceId?.name}`}>
                              <span className="appt-time">{dayjs(`2024-01-01 ${appt.startTime}`).format('h:mm A')}</span>
                              <span className="appt-client">{appt.firstName} {appt.lastName}</span>
                              <span className="appt-barber-tag">{appt.barberId?.name}</span>
                            </div>
                          ));
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
                      <img src={b.photo ? `${IMAGE_BASE}${b.photo}` : '/favicon.avif'} alt={b.name} className="staff-avatar" />
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
                  placeholder="🔍 Search clients by name or phone number..."
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
                          <button className="btn btn-outline btn-sm" onClick={() => handleOpenClientModal(c)}>Edit</button>
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
                                <span className="reengaged-tag">✓ Re-engaged</span>
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

                  {/* Staff Performance Report Detail */}
                  <div className="retention-table-container">
                    <div className="table-header">
                      <h2>Barber Performance & Return Rates</h2>
                      <p>Analyze unique client return rates, total bookings, no-show rates, and revenue per barber to guide staffing decisions.</p>
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

                  {/* Audit Notice Box */}
                  <div className="audit-notice-container">
                    <h4>⚠️ Legacy Calculation Audit Correction Notice</h4>
                    <p>
                      Unlike legacy salon reporting platforms (which calculate return rates using total booking counts or include cancelled/no-show appointments, resulting in inflated repeat visitor metrics or division-by-zero <code>NaN</code> bugs for new staff members), the Elegance Performance Report strictly filters for unique clients with 2 or more confirmed or completed visits, and returns 0% when there are no clients.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 6: SETTINGS & CONFIGURATION */}
          {activeTab === 'settings' && (
            <div className="tab-pane settings-pane animate-fade-in">
              <div className="settings-grid">
                <div className="settings-section-card">
                  <h3>🏢 Business branding & Profile</h3>
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
                  <h3>💬 Twilio SMS Gateway</h3>
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
                  <h3>🧠 AI Agent Permissions</h3>
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

      {/* Persistent Floating AI Copilot Console */}
      <div className={`copilot-container ${showCopilot ? 'active' : ''}`}>
        <button className="copilot-fab" onClick={() => setShowCopilot(!showCopilot)}>
          <span className="fab-icon">🧠</span>
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
                {chat.actions && chat.actions.map((act, actIdx) => (
                  <div key={actIdx} className="copilot-action-card">
                    <span className="action-type-tag">⚡ Executed Twilio SMS Action</span>
                    <p className="action-summary">Sent {act.count} message(s) successfully.</p>
                  </div>
                ))}
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
            <button className="suggestion-pill" onClick={() => handleSendCopilot("How many appointments do we have tomorrow?")}>
              Appointments Tomorrow
            </button>
            <button className="suggestion-pill" onClick={() => handleSendCopilot("Who is our most popular barber?")}>
              Most Popular Barber
            </button>
            <button className="suggestion-pill" onClick={() => handleSendCopilot("Which clients are slip-aways?")}>
              Slip-away Clients
            </button>
            <button className="suggestion-pill" onClick={() => handleSendCopilot("Send SMS reminders to tomorrow's appointments")}>
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
              🎙️
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
                <p className="detail-value">{selectedAppointment.firstName} {selectedAppointment.lastName}</p>
                <p className="detail-sub">{selectedAppointment.phone}</p>
                {selectedAppointment.email && <p className="detail-sub">{selectedAppointment.email}</p>}
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

              {selectedAppointment.referencePhoto && (
                <div className="detail-section">
                  <h4>Reference Photo</h4>
                  <img src={`${IMAGE_BASE}${selectedAppointment.referencePhoto}`} alt="Reference" className="ref-photo" />
                </div>
              )}

              <div className="detail-section">
                <h4>Notes</h4>
                <textarea className="form-input notes-input"
                  defaultValue={selectedAppointment.notes}
                  placeholder="Add notes about this appointment..."
                  onBlur={e => handleNotesUpdate(selectedAppointment._id, e.target.value)} />
              </div>

              <div className="detail-section detail-meta">
                <small>Source: {selectedAppointment.source}</small>
                <small>SMS Status: {selectedAppointment.status === 'confirmed' ? '✅ Confirmed' : '—'}</small>
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
                    <img src={`${IMAGE_BASE}${barberForm.photo}`} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
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
                onClick={handleSaveClient} disabled={!clientForm.firstName || !clientForm.phone}>
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
    </div>
  );
}
