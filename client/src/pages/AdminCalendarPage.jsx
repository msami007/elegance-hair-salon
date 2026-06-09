import { useState, useEffect, useCallback } from 'react';
import { getAppointments, getBarbers, getLocations, getServices, updateAppointment, createAppointment, getRetentionData, sendRetentionSMS, IMAGE_BASE } from '../services/api';
import dayjs from 'dayjs';
import './AdminCalendarPage.css';

const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`); // 8AM - 8PM

export default function AdminCalendarPage() {
  const [appointments, setAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [salonId, setSalonId] = useState('');

  // Retention State
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'retention'
  const [retentionData, setRetentionData] = useState({ summary: {}, clients: [] });
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [selectedRetentionClient, setSelectedRetentionClient] = useState(null);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(null);

  // Init
  useEffect(() => {
    getLocations().then(locs => {
      setLocations(locs);
      if (locs.length > 0) {
        setSelectedLocation(locs[0]._id);
        setSalonId(locs[0].salonId);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    getBarbers({ locationId: selectedLocation }).then(setBarbers);
    getServices({ locationId: selectedLocation }).then(setServices);
  }, [selectedLocation]);

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
    return Math.max(duration / 60 * 64, 28); // min 28px
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

  // Add appointment form state
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

  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <h1>Elegance</h1>
            <span className="admin-badge">Admin</span>
          </div>
          <div className="admin-actions">
            <select className="form-input form-select loc-select"
              value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
              {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
            <button className="btn btn-gold btn-sm" onClick={() => setShowAddModal(true)}>
              + New Appointment
            </button>
            <a href="/" className="btn btn-ghost btn-sm admin-link">Booking Page →</a>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="admin-tabs-nav">
        <button className={`tab-nav-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          📅 Appointments Calendar
        </button>
        <button className={`tab-nav-btn ${activeTab === 'retention' ? 'active' : ''}`} onClick={() => setActiveTab('retention')}>
          ✨ AI Client Retention
        </button>
      </div>

      {activeTab === 'calendar' ? (
        <>
          {/* Week Navigation */}
          <div className="week-nav">
            <button className="btn btn-ghost" onClick={() => setWeekStart(w => w.subtract(7, 'day'))}>← Prev</button>
            <h2 className="week-title">
              {weekStart.format('MMM D')} – {weekStart.add(6, 'day').format('MMM D, YYYY')}
            </h2>
            <button className="btn btn-ghost" onClick={() => setWeekStart(dayjs().startOf('week'))}>Today</button>
            <button className="btn btn-ghost" onClick={() => setWeekStart(w => w.add(7, 'day'))}>Next →</button>
          </div>

          {/* Calendar Grid */}
          <div className="calendar-container">
            <div className="calendar-grid">
              {/* Time column */}
              <div className="time-column">
                <div className="day-header-cell" />
                {HOURS.map(h => (
                  <div key={h} className="time-label">
                    {dayjs(`2024-01-01 ${h}`).format('h A')}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map(day => (
                <div key={day.format('YYYY-MM-DD')} className={`day-column ${day.isSame(dayjs(), 'day') ? 'today' : ''}`}>
                  <div className="day-header-cell">
                    <span className="day-name">{day.format('ddd')}</span>
                    <span className={`day-number ${day.isSame(dayjs(), 'day') ? 'today-num' : ''}`}>{day.format('D')}</span>
                  </div>
                  <div className="day-body">
                    {/* Hour grid lines */}
                    {HOURS.map(h => <div key={h} className="hour-line" />)}

                    {/* Appointments for each barber */}
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
                          title={`${appt.clientId?.firstName} ${appt.clientId?.lastName} - ${appt.serviceId?.name}`}>
                          <span className="appt-time">{dayjs(`2024-01-01 ${appt.startTime}`).format('h:mm')}</span>
                          <span className="appt-client">{appt.clientId?.firstName}</span>
                          <span className="appt-barber-tag">{appt.barberId?.name}</span>
                        </div>
                      ));
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Barber Legend */}
          <div className="barber-legend">
            {barbers.map(b => (
              <span key={b._id} className="legend-item">
                <span className="legend-dot" />
                {b.name} · {b.title}
              </span>
            ))}
          </div>
        </>
      ) : (
        /* Client Retention View */
        <div className="retention-dashboard animate-fade-in">
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-icon">👥</span>
              <div className="metric-info">
                <h3>Total Clients</h3>
                <p className="metric-value">{retentionData.summary?.totalClients || 0}</p>
              </div>
            </div>
            <div className="metric-card active">
              <span className="metric-icon">🟢</span>
              <div className="metric-info">
                <h3>Active</h3>
                <p className="metric-value">{retentionData.summary?.activeCount || 0}</p>
                <small className="metric-sub">Visited in last 30d</small>
              </div>
            </div>
            <div className="metric-card slipping">
              <span className="metric-icon">🟡</span>
              <div className="metric-info">
                <h3>Slipping</h3>
                <p className="metric-value">{retentionData.summary?.slippingCount || 0}</p>
                <small className="metric-sub">Last visit 30-60d</small>
              </div>
            </div>
            <div className="metric-card dormant">
              <span className="metric-icon">🔴</span>
              <div className="metric-info">
                <h3>At Risk</h3>
                <p className="metric-value">{retentionData.summary?.dormantCount || 0}</p>
                <small className="metric-sub">No visit in 60d+ (2m+)</small>
              </div>
            </div>
            <div className="metric-card loyalty">
              <span className="metric-icon">📈</span>
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
              <div className="retention-empty">All clients are active! Great job keeping them engaged. 🎉</div>
            ) : (
              <table className="retention-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Last Visit</th>
                    <th>Days Idle</th>
                    <th>Status</th>
                    <th>Preferred Barber</th>
                    <th>AI Prediction & Recommendation</th>
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
                          <span className="ai-sparkle">✨ AI Suggestion:</span>
                          <p className="ai-desc">{client.aiRecommendation}</p>
                          {client.tags?.includes('sms-reengaged') && (
                            <span className="reengaged-tag">✓ Re-engaged</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-gold btn-sm" onClick={() => handleOpenSMSModal(client)}>
                          ✉ Re-Engage
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
                  {selectedAppointment.clientId?.firstName} {selectedAppointment.clientId?.lastName}
                </p>
                <p className="detail-sub">{selectedAppointment.clientId?.phone}</p>
                {selectedAppointment.clientId?.email && (
                  <p className="detail-sub">{selectedAppointment.clientId.email}</p>
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
                <p className="detail-value">
                  {dayjs(selectedAppointment.date).format('ddd, MMM D, YYYY')}
                </p>
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
                <small>SMS: {selectedAppointment.smsConfirmationSent ? '✅ Sent' : '—'}</small>
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

      {/* SMS Re-engagement Modal */}
      {selectedRetentionClient && (
        <div className="detail-overlay" onClick={() => setSelectedRetentionClient(null)}>
          <div className="detail-panel add-modal sms-modal animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>✉ Send SMS Promotion</h3>
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
                {smsSending ? 'Sending SMS...' : '✉ Send Re-engagement SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
