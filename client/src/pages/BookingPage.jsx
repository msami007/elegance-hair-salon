import { useState, useEffect, useCallback } from 'react';
import { getServices, getLocations, lookupClient, matchBarbers, getAvailability, createAppointment, getBarbers, uploadPhoto } from '../services/api';
import dayjs from 'dayjs';
import './BookingPage.css';

const SALON_SLUG = 'elegance-hair-salon';

const SERVICE_CATEGORIES = [
  { key: 'mens-services', label: "Men's Services" },
  { key: 'womens-services', label: "Women's Services" },
  { key: 'color', label: 'Color' },
  { key: 'mens-color', label: "Men's Color" },
  { key: 'smoothing-perms', label: 'Smoothing & Perms' },
  { key: 'threading-wax', label: 'Threading & Wax' },
];

const STYLE_OPTIONS = [
  { key: 'skin-fade', label: 'Skin Fade' },
  { key: 'fade', label: 'Classic Fade' },
  { key: 'classic', label: 'Classic Cut' },
  { key: 'textured', label: 'Textured' },
  { key: 'buzz', label: 'Buzz Cut' },
  { key: 'beard', label: 'Beard Trim' },
  { key: 'lineup', label: 'Line Up' },
  { key: 'styling', label: 'Styling' },
  { key: 'blowout', label: 'Blowout' },
  { key: 'curly', label: 'Curly Hair' },
  { key: 'color', label: 'Color Work' },
  { key: 'balayage', label: 'Balayage' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'extensions', label: 'Extensions' },
  { key: 'updo', label: 'Updo' },
  { key: 'keratin', label: 'Keratin' },
  { key: 'smoothing', label: 'Smoothing' },
  { key: 'perm', label: 'Perm' },
];

const STEPS = ['customer', 'service', 'style', 'datetime', 'barber', 'confirm'];

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Data
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [salonId, setSalonId] = useState('');
  const [allBarbers, setAllBarbers] = useState([]);

  // Form state
  const [isReturning, setIsReturning] = useState(false);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [existingClient, setExistingClient] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [availability, setAvailability] = useState({});
  const [referencePhoto, setReferencePhoto] = useState(null);
  const [referencePhotoUrl, setReferencePhotoUrl] = useState('');
  const [bookingResult, setBookingResult] = useState(null);

  // Load initial data
  useEffect(() => {
    async function init() {
      try {
        const locs = await getLocations();
        setLocations(locs);
        if (locs.length > 0) {
          setSelectedLocation(locs[0]._id);
          setSalonId(locs[0].salonId);
          const svcs = await getServices({ locationId: locs[0]._id });
          setServices(svcs);
          const barbers = await getBarbers({ locationId: locs[0]._id });
          setAllBarbers(barbers);
        }
      } catch (err) {
        console.error('Init error:', err);
      }
    }
    init();
  }, []);

  // Load services when location changes
  useEffect(() => {
    if (!selectedLocation) return;
    getServices({ locationId: selectedLocation }).then(setServices).catch(console.error);
    getBarbers({ locationId: selectedLocation }).then(setAllBarbers).catch(console.error);
  }, [selectedLocation]);

  const filteredServices = services.filter(s => s.category === selectedCategory);

  // Phone lookup
  const handlePhoneLookup = useCallback(async () => {
    if (phone.length < 10) return;
    setLoading(true);
    setError('');
    try {
      const result = await lookupClient(phone, salonId);
      if (result.found) {
        setExistingClient(result.client);
        setFirstName(result.client.firstName);
        setLastName(result.client.lastName);
        setEmail(result.client.email || '');
      } else {
        setExistingClient(null);
        setError('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [phone, salonId]);

  // Fetch availability when date/service/barber changes
  useEffect(() => {
    if (!selectedDate || !selectedLocation) return;
    getAvailability({
      locationId: selectedLocation,
      date: selectedDate,
      serviceId: selectedService?._id,
    }).then(setAvailability).catch(console.error);
  }, [selectedDate, selectedLocation, selectedService]);

  // Fetch barber recommendations
  useEffect(() => {
    if (step !== 4 || !selectedStyle || !selectedLocation) return;
    matchBarbers({
      locationId: selectedLocation,
      haircutStyle: selectedStyle,
      serviceCategory: selectedCategory,
      date: selectedDate,
    }).then(setRecommendations).catch(console.error);
  }, [step, selectedStyle, selectedLocation, selectedCategory, selectedDate]);

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferencePhoto(file);
    try {
      const result = await uploadPhoto(file);
      setReferencePhotoUrl(result.url);
    } catch (err) {
      console.error('Upload error:', err);
    }
  };

  // Submit booking
  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const data = {
        salonId,
        locationId: selectedLocation,
        barberId: selectedBarber?._id,
        serviceId: selectedService?._id,
        date: selectedDate,
        startTime: selectedTime,
        haircutStyle: selectedStyle,
        referencePhoto: referencePhotoUrl,
        source: 'online',
        firstName,
        lastName,
        phone: normalizePhone(phone),
        email,
        clientId: existingClient?._id || undefined,
        isNewClient: !existingClient,
      };

      const result = await createAppointment(data);
      setBookingResult(result);
      setStep(5);
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  function normalizePhone(p) {
    let normalized = p.replace(/[^0-9+]/g, '');
    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('1') && normalized.length === 11) normalized = '+' + normalized;
      else if (normalized.length === 10) normalized = '+1' + normalized;
    }
    return normalized;
  }

  const canProceed = () => {
    switch (step) {
      case 0: return phone.length >= 10 && firstName.length > 0;
      case 1: return selectedService !== null;
      case 2: return selectedStyle !== '';
      case 3: return selectedTime !== '';
      case 4: return selectedBarber !== null;
      default: return false;
    }
  };

  const formatPrice = (cents, varies) => {
    const dollars = (cents / 100).toFixed(0);
    return `$${dollars}${varies ? '+' : ''}`;
  };

  const formatDuration = (mins) => {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  // Generate date options for next 14 days
  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const d = dayjs().add(i, 'day');
    return { value: d.format('YYYY-MM-DD'), label: d.format('ddd, MMM D'), isToday: i === 0 };
  });

  // Get all available time slots across barbers
  const allTimeSlots = Object.values(availability).reduce((acc, b) => {
    b.slots?.forEach(slot => {
      if (slot.available && !acc.find(s => s.startTime === slot.startTime)) {
        acc.push(slot);
      }
    });
    return acc;
  }, []).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="booking-page">
      {/* Header */}
      <header className="booking-header">
        <div className="booking-header-inner">
          <div className="brand">
            <img src="/logo.jpeg" alt="Elegance Logo" className="brand-logo" />
            <div className="brand-text">
              <h1 className="brand-name">Elegance</h1>
              <p className="brand-sub">Hair Salon & Barbershop</p>
            </div>
          </div>
          <a href="/admin" className="btn btn-ghost btn-sm">Admin</a>
        </div>
      </header>

      {/* Progress bar */}
      {step < 5 && (
        <div className="progress-bar">
          {STEPS.slice(0, 5).map((s, i) => (
            <div key={s} className={`progress-step ${i <= step ? 'active' : ''} ${i < step ? 'completed' : ''}`}>
              <div className="progress-dot">{i < step ? '✓' : i + 1}</div>
              <span className="progress-label">{['You', 'Service', 'Style', 'Date & Time', 'Barber'][i]}</span>
            </div>
          ))}
        </div>
      )}

      <main className="booking-content">
        {error && <div className="error-banner">{error}</div>}

        {/* Step 0: Customer Info */}
        {step === 0 && (
          <div className="step-container animate-fade-in">
            <div className="step-header">
              <h2>Welcome to Elegance</h2>
              <p>Let's get you booked in for a fresh look</p>
            </div>

            {/* Location selector */}
            {locations.length > 1 && (
              <div className="form-group">
                <label className="form-label">Location</label>
                <div className="location-cards">
                  {locations.map(loc => (
                    <button key={loc._id}
                      className={`location-card ${selectedLocation === loc._id ? 'selected' : ''}`}
                      onClick={() => setSelectedLocation(loc._id)}>
                      <div>
                        <strong>{loc.name}</strong>
                        <small>{loc.address}, {loc.city}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer type toggle */}
            <div className="form-group">
              <div className="toggle-group">
                <button className={`toggle-btn ${!isReturning ? 'active' : ''}`} onClick={() => { setIsReturning(false); setExistingClient(null); }}>
                  New Customer
                </button>
                <button className={`toggle-btn ${isReturning ? 'active' : ''}`} onClick={() => setIsReturning(true)}>
                  Returning Customer
                </button>
              </div>
            </div>

            {/* Phone */}
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="phone-input-group">
                <input type="tel" className="form-input" placeholder="(312) 555-1234" value={phone}
                  onChange={(e) => setPhone(e.target.value)} onBlur={isReturning ? handlePhoneLookup : undefined} />
                {isReturning && (
                  <button className="btn btn-outline btn-sm" onClick={handlePhoneLookup} disabled={loading}>
                    {loading ? '...' : 'Look Up'}
                  </button>
                )}
              </div>
              {existingClient && (
                <div className="client-found animate-slide-up">
                  <div>
                    <strong>✓ Welcome back, {existingClient.firstName}!</strong>
                    <small>{existingClient.visitCount} previous visits</small>
                  </div>
                </div>
              )}
            </div>

            {/* Name */}
            <div className="name-row">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input type="text" className="form-input" placeholder="First name" value={firstName}
                  onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input type="text" className="form-input" placeholder="Last name" value={lastName}
                  onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">Email (optional)</label>
              <input type="email" className="form-input" placeholder="your@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 1: Service Selection */}
        {step === 1 && (
          <div className="step-container animate-fade-in">
            <div className="step-header">
              <h2>Choose Your Service</h2>
              <p>Select the service category and the specific treatment you'd like</p>
            </div>

            <div className="category-grid">
              {SERVICE_CATEGORIES.map(cat => (
                <button key={cat.key}
                  className={`category-card ${selectedCategory === cat.key ? 'selected' : ''}`}
                  onClick={() => { setSelectedCategory(cat.key); setSelectedService(null); }}>
                  <span className="cat-label">{cat.label}</span>
                  <span className="cat-count">{services.filter(s => s.category === cat.key).length}</span>
                </button>
              ))}
            </div>

            {selectedCategory && (
              <div className="service-list animate-slide-up">
                <h3>{SERVICE_CATEGORIES.find(c => c.key === selectedCategory)?.label}</h3>
                {filteredServices.map(svc => (
                  <button key={svc._id}
                    className={`service-item ${selectedService?._id === svc._id ? 'selected' : ''}`}
                    onClick={() => setSelectedService(svc)}>
                    <div className="service-info">
                      <span className="service-name">{svc.name}</span>
                      {svc.description && <small className="service-desc">{svc.description}</small>}
                    </div>
                    <div className="service-meta">
                      <span className="service-price">{formatPrice(svc.price, svc.priceVaries)}</span>
                      <span className="service-duration">{formatDuration(svc.duration)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Style Selection */}
        {step === 2 && (
          <div className="step-container animate-fade-in">
            <div className="step-header">
              <h2>What's Your Style?</h2>
              <p>Select the style you're going for — this helps us match you with the perfect barber</p>
            </div>

            <div className="style-grid">
              {STYLE_OPTIONS.filter(s => {
                // Filter styles relevant to selected service category
                const menStyles = ['skin-fade', 'fade', 'classic', 'textured', 'buzz', 'beard', 'lineup'];
                const womenStyles = ['styling', 'blowout', 'curly', 'updo', 'extensions'];
                const colorStyles = ['color', 'balayage', 'highlights'];
                const treatmentStyles = ['keratin', 'smoothing', 'perm'];
                if (selectedCategory === 'mens-services') return menStyles.includes(s.key);
                if (selectedCategory === 'womens-services') return womenStyles.includes(s.key);
                if (selectedCategory === 'color' || selectedCategory === 'mens-color') return colorStyles.includes(s.key);
                if (selectedCategory === 'smoothing-perms') return treatmentStyles.includes(s.key);
                return true;
              }).map(style => (
                <button key={style.key}
                  className={`style-card ${selectedStyle === style.key ? 'selected' : ''}`}
                  onClick={() => setSelectedStyle(style.key)}>
                  <span className="style-label">{style.label}</span>
                </button>
              ))}
            </div>

            {/* Reference photo upload */}
            <div className="photo-upload-section">
              <h3>Reference Photo (Optional)</h3>
              <p>Upload a photo of the style you want — your barber will see this</p>
              <label className="photo-dropzone">
                <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
                {referencePhoto ? (
                  <div className="photo-preview">
                    <img src={URL.createObjectURL(referencePhoto)} alt="Reference" />
                    <span>✓ Photo uploaded</span>
                  </div>
                ) : (
                  <div className="photo-placeholder">
                    <span className="upload-icon-text">+</span>
                    <span>Click to upload a reference photo</span>
                  </div>
                )}
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === 3 && (
          <div className="step-container animate-fade-in">
            <div className="step-header">
              <h2>Pick a Date & Time</h2>
              <p>Choose when you'd like to come in</p>
            </div>

            <div className="date-scroll">
              {dateOptions.map(d => (
                <button key={d.value}
                  className={`date-chip ${selectedDate === d.value ? 'selected' : ''}`}
                  onClick={() => { setSelectedDate(d.value); setSelectedTime(''); }}>
                  <span className="date-day">{d.isToday ? 'Today' : dayjs(d.value).format('ddd')}</span>
                  <span className="date-num">{dayjs(d.value).format('D')}</span>
                  <span className="date-month">{dayjs(d.value).format('MMM')}</span>
                </button>
              ))}
            </div>

            <div className="time-grid">
              {allTimeSlots.length === 0 ? (
                <p className="no-slots">No available slots for this date. Try another day.</p>
              ) : (
                allTimeSlots.map(slot => (
                  <button key={slot.startTime}
                    className={`time-chip ${selectedTime === slot.startTime ? 'selected' : ''} ${!slot.available ? 'unavailable' : ''}`}
                    onClick={() => slot.available && setSelectedTime(slot.startTime)}
                    disabled={!slot.available}>
                    {dayjs(`2024-01-01 ${slot.startTime}`).format('h:mm A')}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 4: Barber Selection */}
        {step === 4 && (
          <div className="step-container animate-fade-in">
            <div className="step-header">
              <h2>Your Recommended Barbers</h2>
              <p>Based on your selected style, we recommend these barbers</p>
            </div>

            {recommendations.length > 0 && (
              <div className="recommendation-section">
                <h3 className="rec-title">AI Recommendations</h3>
                <div className="barber-cards">
                  {recommendations.slice(0, 2).map((rec, i) => (
                    <button key={rec._id}
                      className={`barber-card recommended ${selectedBarber?._id === rec._id ? 'selected' : ''}`}
                      onClick={() => setSelectedBarber(rec)}>
                      {i === 0 && <div className="best-match-badge">Best Match</div>}
                      <div className="barber-avatar">{rec.name[0]}</div>
                      <h4>{rec.name}</h4>
                      <p className="barber-title">{rec.title}</p>
                      <div className="match-reasons">
                        {rec.matchReasons.map((r, j) => (
                          <span key={j} className="reason-tag">✓ {r}</span>
                        ))}
                      </div>
                      <div className="specialism-tags">
                        {rec.specialisms?.slice(0, 4).map(s => (
                          <span key={s} className="spec-tag">{s.replace(/-/g, ' ')}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="all-barbers-section">
              <h3>Or choose any barber</h3>
              <div className="barber-cards">
                {allBarbers.map(b => (
                  <button key={b._id}
                    className={`barber-card ${selectedBarber?._id === b._id ? 'selected' : ''}`}
                    onClick={() => setSelectedBarber(b)}>
                    <div className="barber-avatar">{b.name[0]}</div>
                    <h4>{b.name}</h4>
                    <p className="barber-title">{b.title}</p>
                    <div className="specialism-tags">
                      {b.specialisms?.slice(0, 4).map(s => (
                        <span key={s} className="spec-tag">{s.replace(/-/g, ' ')}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && bookingResult && (
          <div className="step-container animate-fade-in confirmation-step">
            <div className="confirm-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="success-checkmark">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2>You're All Set!</h2>
            <p className="confirm-subtitle">Your appointment has been confirmed</p>

            <div className="confirm-card">
              <div className="confirm-row">
                <span className="confirm-label">Service</span>
                <span>{bookingResult.appointment.serviceId?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Barber</span>
                <span>{bookingResult.appointment.barberId?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Date</span>
                <span>{dayjs(bookingResult.appointment.date).format('ddd, MMM D, YYYY')}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Time</span>
                <span>{dayjs(`2024-01-01 ${bookingResult.appointment.startTime}`).format('h:mm A')}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Location</span>
                <span>{bookingResult.appointment.locationId?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Price</span>
                <span>{formatPrice(bookingResult.appointment.serviceId?.price, false)}</span>
              </div>
            </div>

            <div className={`sms-status ${bookingResult.sms?.success ? 'sent' : 'failed'}`}>
              {bookingResult.sms?.success
                ? `Confirmation SMS ${bookingResult.sms.mock ? '(mock)' : ''} sent to your phone`
                : 'SMS could not be sent — your appointment is still confirmed'}
            </div>

            <button className="btn btn-gold btn-lg" onClick={() => {
              // Reset form
              setStep(0); setPhone(''); setFirstName(''); setLastName('');
              setEmail(''); setExistingClient(null); setSelectedCategory('');
              setSelectedService(null); setSelectedStyle(''); setSelectedTime('');
              setSelectedBarber(null); setBookingResult(null); setReferencePhoto(null);
              setReferencePhotoUrl('');
            }}>Book Another Appointment</button>
          </div>
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="booking-nav">
            {step > 0 && (
              <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}>
                ← Back
              </button>
            )}
            <div className="nav-spacer" />
            {step < 4 ? (
              <button className="btn btn-primary btn-lg" disabled={!canProceed()} onClick={() => setStep(s => s + 1)}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-gold btn-lg" disabled={!canProceed() || loading} onClick={handleSubmit}>
                {loading ? 'Booking...' : '✓ Confirm Booking'}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="booking-footer">
        <p>© {new Date().getFullYear()} Elegance Hair Salon & Barbershop · Chicago & Evanston</p>
        <p className="footer-links">
          <a href="https://www.instagram.com/elegancehairsalons/" target="_blank" rel="noreferrer">Instagram</a>
          <span>·</span>
          <a href="tel:+13128828218">(312) 882-8218</a>
        </p>
      </footer>
    </div>
  );
}
