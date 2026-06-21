import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';

const GOLD    = '#D4AF37';
const BLACK   = '#111111';
const GREEN   = '#22c55e';
const AMBER   = '#f59e0b';
const PURPLE  = '#8b5cf6';
const BLUE    = '#3b82f6';
const TEAL    = '#14b8a6';
const RED     = '#ef4444';

const PIE_COLORS = [GOLD, BLACK, GREEN, PURPLE, BLUE, TEAL, AMBER, RED];

const fmt$ = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAxis$ = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;

const ChartEmpty = ({ message = 'No data available yet.' }) => (
  <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.9rem', background: '#fafafa', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>
    {message}
  </div>
);

const CustomTooltip = ({ active, payload, label, labelFormatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '0.82rem' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#111' }}>{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color || '#555' }}>
          <span style={{ fontWeight: 600 }}>{p.name}:</span> {p.unit === '$' ? fmt$(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

/* ── Revenue Trends ── */
function RevenueTrendsChart({ data }) {
  if (!data?.length) return <ChartEmpty message="No revenue data in the selected period." />;

  const formatted = data.map(d => ({
    ...d,
    label: dayjs(d.date).format('MMM D'),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={formatted} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={GOLD} stopOpacity={0.25} />
            <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tickFormatter={fmtAxis$} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip labelFormatter={l => l} />} />
        <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '12px' }} />
        <Area yAxisId="left" type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" unit="$" dot={false} activeDot={{ r: 5, fill: GOLD }} />
        <Bar yAxisId="right" dataKey="bookings" fill={BLACK} name="Bookings" radius={[3, 3, 0, 0]} opacity={0.75} maxBarSize={18} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ── Service Popularity ── */
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

function ServicePopularityCharts({ data }) {
  if (!data?.length) return <ChartEmpty message="No service booking data available." />;

  const sorted = [...data].sort((a, b) => b.bookingsCount - a.bookingsCount).slice(0, 10);
  const pieData = sorted.filter(s => s.revenue > 0).map(s => ({ name: s.name, value: s.revenue }));

  return (
    <div className="reports-charts-grid">
      {/* Horizontal bar: bookings per service */}
      <div className="reports-chart-card">
        <h4 className="chart-title">Bookings by Service</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#374151' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="bookingsCount" name="Bookings" fill={GOLD} radius={[0, 4, 4, 0]} maxBarSize={20}>
              {sorted.map((_, i) => <Cell key={i} fill={i === 0 ? GOLD : `${GOLD}99`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie: revenue share */}
      <div className="reports-chart-card">
        <h4 className="chart-title">Revenue Share by Service</h4>
        {pieData.length === 0 ? (
          <ChartEmpty message="No revenue recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={2} dataKey="value" labelLine={false} label={renderCustomLabel}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt$(v)} />
              <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: '0.78rem' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ── Staff Performance ── */
function StaffPerformanceCharts({ data, IMAGE_BASE }) {
  if (!data?.length) return <ChartEmpty message="No staff performance data available." />;

  const barData = data.map(p => ({
    name: p.barber.name.split(' ')[0],
    Revenue: Number((p.totalRevenue || 0).toFixed(2)),
    Bookings: p.totalBookings || 0,
    'Return %': p.returnRate || 0,
  }));

  const radarData = [
    { metric: 'Return Rate', ...Object.fromEntries(data.map(p => [p.barber.name.split(' ')[0], p.returnRate || 0])) },
    { metric: 'No-Show %', ...Object.fromEntries(data.map(p => [p.barber.name.split(' ')[0], Math.max(0, 100 - (p.noShowRate || 0))]))  },
    { metric: 'Completion %', ...Object.fromEntries(data.map(p => [p.barber.name.split(' ')[0], p.totalBookings ? Math.round(p.completedBookings / p.totalBookings * 100) : 0])) },
    { metric: 'Client Base', ...Object.fromEntries(data.map(p => [p.barber.name.split(' ')[0], Math.min(100, (p.uniqueClientsCount || 0) * 5)])) },
    { metric: 'Retention', ...Object.fromEntries(data.map(p => [p.barber.name.split(' ')[0], p.repeatClientsCount ? Math.round(p.repeatClientsCount / Math.max(p.uniqueClientsCount, 1) * 100) : 0])) },
  ];

  return (
    <>
      {/* Stat cards per barber */}
      <div className="barber-perf-cards">
        {data.map((p, i) => (
          <div key={p.barber._id} className="barber-perf-card">
            <div className="barber-perf-card-header">
              <img 
                src={p.barber.photo ? (p.barber.photo.startsWith('http') ? p.barber.photo : `${IMAGE_BASE}${p.barber.photo}`) : '/favicon.avif'} 
                alt={p.barber.name} 
                className="barber-perf-avatar" 
              />
              <div>
                <div className="barber-perf-name">{p.barber.name}</div>
                <div className="barber-perf-title">{p.barber.title || 'Barber'}</div>
              </div>
              <span className={`status-badge ${p.barber.isActive ? 'active' : 'dormant'}`} style={{ marginLeft: 'auto' }}>
                {p.barber.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="barber-perf-stats">
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value" style={{ color: GOLD }}>{fmt$(p.totalRevenue)}</span>
                <span className="barber-perf-stat-label">Revenue</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value">{p.totalBookings}</span>
                <span className="barber-perf-stat-label">Bookings</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value" style={{ color: p.returnRate >= 50 ? GREEN : AMBER }}>{p.returnRate}%</span>
                <span className="barber-perf-stat-label">Return Rate</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value" style={{ color: p.noShowRate > 10 ? RED : GREEN }}>{p.noShowRate}%</span>
                <span className="barber-perf-stat-label">No-Show</span>
              </div>
            </div>
            {/* Mini progress bar for return rate */}
            <div className="barber-perf-bar-track">
              <div className="barber-perf-bar-fill" style={{ width: `${Math.min(100, p.returnRate)}%`, background: p.returnRate >= 50 ? GREEN : AMBER }} />
            </div>
          </div>
        ))}
      </div>

      {/* Revenue + Bookings grouped bar chart */}
      <div className="reports-charts-grid">
        <div className="reports-chart-card">
          <h4 className="chart-title">Revenue by Barber</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtAxis$} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => fmt$(v)} />
              <Bar dataKey="Revenue" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={40}>
                {barData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar chart — performance health */}
        <div className="reports-chart-card">
          <h4 className="chart-title">Performance Radar</h4>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              {data.map((p, i) => (
                <Radar key={p.barber._id} name={p.barber.name.split(' ')[0]} dataKey={p.barber.name.split(' ')[0]}
                  stroke={PIE_COLORS[i % PIE_COLORS.length]} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.12} strokeWidth={2} />
              ))}
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: '0.78rem' }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ── Location Comparison ── */
function LocationComparisonCharts({ data }) {
  if (!data?.length) return <ChartEmpty message="No location data available." />;

  const barData = data.map(l => ({
    name: l.location.name,
    Revenue: Number((l.totalRevenue || 0).toFixed(2)),
    Bookings: l.totalBookings || 0,
    'Return %': l.returnRate || 0,
  }));

  return (
    <>
      {/* Location metric cards */}
      <div className="location-perf-cards">
        {data.map((loc, i) => (
          <div key={loc.location._id} className="location-perf-card">
            <div className="location-perf-header">
              <div className="location-color-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <div>
                <div className="location-perf-name">{loc.location.name}</div>
                <div className="location-perf-city">{loc.location.city}, {loc.location.state}</div>
              </div>
            </div>
            <div className="barber-perf-stats">
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value" style={{ color: GOLD }}>{fmt$(loc.totalRevenue)}</span>
                <span className="barber-perf-stat-label">Revenue</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value">{loc.totalBookings}</span>
                <span className="barber-perf-stat-label">Bookings</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value" style={{ color: loc.returnRate >= 50 ? GREEN : AMBER }}>{loc.returnRate}%</span>
                <span className="barber-perf-stat-label">Return</span>
              </div>
              <div className="barber-perf-stat">
                <span className="barber-perf-stat-value">{loc.uniqueClientsCount}</span>
                <span className="barber-perf-stat-label">Clients</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="reports-charts-grid">
        {/* Revenue comparison */}
        <div className="reports-chart-card">
          <h4 className="chart-title">Revenue by Location</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtAxis$} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Revenue" radius={[4, 4, 0, 0]} maxBarSize={50}>
                {barData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bookings + Return rate */}
        <div className="reports-chart-card">
          <h4 className="chart-title">Bookings & Return Rate</h4>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
              <Bar yAxisId="left" dataKey="Bookings" fill={BLACK} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="right" dataKey="Return %" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={40} opacity={0.8} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ── Main ReportsTab ── */
export default function ReportsTab({ reportsData, reportsLoading, activeReportTab, setActiveReportTab, downloadCSV, IMAGE_BASE }) {
  if (reportsLoading) {
    return <div className="retention-loading">Loading reports...</div>;
  }

  const summary = reportsData.summary || {};

  const csvConfigs = {
    staff: {
      data: reportsData.barberPerformance,
      headers: [
        { label: 'Barber', key: p => p.barber.name },
        { label: 'Total Bookings', key: 'totalBookings' },
        { label: 'Unique Clients', key: 'uniqueClientsCount' },
        { label: 'Return Rate (%)', key: 'returnRate' },
        { label: 'No-Show Rate (%)', key: 'noShowRate' },
        { label: 'Total Revenue ($)', key: 'totalRevenue' },
      ],
      filename: 'staff_performance.csv',
    },
    trends: {
      data: reportsData.revenueTrends,
      headers: [
        { label: 'Date', key: 'date' },
        { label: 'Bookings', key: 'bookings' },
        { label: 'Revenue ($)', key: 'revenue' },
      ],
      filename: 'revenue_trends.csv',
    },
    services: {
      data: reportsData.servicePopularity,
      headers: [
        { label: 'Service', key: 'name' },
        { label: 'Bookings', key: 'bookingsCount' },
        { label: 'Revenue ($)', key: 'revenue' },
      ],
      filename: 'service_popularity.csv',
    },
    locations: {
      data: reportsData.locationComparison,
      headers: [
        { label: 'Location', key: l => l.location.name },
        { label: 'Total Bookings', key: 'totalBookings' },
        { label: 'Return Rate (%)', key: 'returnRate' },
        { label: 'Revenue ($)', key: 'totalRevenue' },
      ],
      filename: 'location_comparison.csv',
    },
  };

  const { data: csvData, headers: csvHeaders, filename: csvFile } = csvConfigs[activeReportTab] || csvConfigs.staff;

  return (
    <>
      {/* KPI Summary Bar */}
      <div className="kpi-bar">
        <div className="kpi-item">
          <span className="kpi-label">Total Revenue</span>
          <span className="kpi-value gold">{fmt$(summary.totalRevenue)}</span>
        </div>
        <div className="kpi-divider" />
        <div className="kpi-item">
          <span className="kpi-label">Confirmed Bookings</span>
          <span className="kpi-value">{summary.totalBookings || 0}</span>
        </div>
        <div className="kpi-divider" />
        <div className="kpi-item">
          <span className="kpi-label">Return Rate</span>
          <span className="kpi-value" style={{ color: (summary.returnRate || 0) >= 50 ? GREEN : AMBER }}>
            {summary.returnRate || 0}%
          </span>
        </div>
        <div className="kpi-divider" />
        <div className="kpi-item">
          <span className="kpi-label">Unique Clients</span>
          <span className="kpi-value">{summary.uniqueClientsCount || 0}</span>
        </div>
        <div className="kpi-divider" />
        <div className="kpi-item">
          <span className="kpi-label">No-Shows</span>
          <span className="kpi-value" style={{ color: (summary.totalNoShows || 0) > 0 ? AMBER : GREEN }}>
            {summary.totalNoShows || 0}
          </span>
        </div>
        <div className="kpi-divider" />
        <div className="kpi-item">
          <span className="kpi-label">Cancellations</span>
          <span className="kpi-value" style={{ color: '#6b7280' }}>{summary.totalCancelled || 0}</span>
        </div>
      </div>

      {/* Sub-tab nav + CSV export */}
      <div className="reports-tab-bar">
        <div className="reports-subtabs-nav">
          {[
            { key: 'staff',     label: 'Staff Performance' },
            { key: 'trends',    label: 'Revenue Trends' },
            { key: 'services',  label: 'Service Popularity' },
            { key: 'locations', label: 'Locations' },
          ].map(t => (
            <button key={t.key} type="button"
              className={`reports-subtab-btn ${activeReportTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveReportTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadCSV(csvData, csvHeaders, csvFile)}>
          Export CSV
        </button>
      </div>

      {/* Chart Panels */}
      <div className="reports-chart-panel animate-fade-in">
        {activeReportTab === 'trends' && (
          <>
            <div className="chart-panel-header">
              <h3 className="chart-panel-title">Revenue & Bookings Over Time</h3>
              <p className="chart-panel-sub">Daily revenue (area) and booking count (bars) across the salon's history.</p>
            </div>
            <RevenueTrendsChart data={reportsData.revenueTrends} />
          </>
        )}

        {activeReportTab === 'services' && (
          <>
            <div className="chart-panel-header">
              <h3 className="chart-panel-title">Service Popularity & Revenue Share</h3>
              <p className="chart-panel-sub">Booking volume per service and proportional revenue contribution.</p>
            </div>
            <ServicePopularityCharts data={reportsData.servicePopularity} />
          </>
        )}

        {activeReportTab === 'staff' && (
          <>
            <div className="chart-panel-header">
              <h3 className="chart-panel-title">Staff Performance Dashboard</h3>
              <p className="chart-panel-sub">Revenue, booking volume, return rates, and health metrics per barber.</p>
            </div>
            <StaffPerformanceCharts data={reportsData.barberPerformance} IMAGE_BASE={IMAGE_BASE} />
          </>
        )}

        {activeReportTab === 'locations' && (
          <>
            <div className="chart-panel-header">
              <h3 className="chart-panel-title">Location Performance Comparison</h3>
              <p className="chart-panel-sub">Revenue, bookings, and client retention across all salon locations.</p>
            </div>
            <LocationComparisonCharts data={reportsData.locationComparison} />
          </>
        )}
      </div>
    </>
  );
}
