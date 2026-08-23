import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Event, Venue, SeatCategory } from '../types';
import { Sparkles, DollarSign, Ticket, Users, BarChart3, Plus, X, Calendar, MapPin, Film, Music } from 'lucide-react';

export const OrganizerDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [summary, setSummary] = useState<any>({
    totalRevenue: 0,
    totalTicketsSold: 0,
    totalCapacity: 0,
    overallOccupancy: 0,
    eventsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Create Event Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'MOVIE' | 'CONCERT'>('MOVIE');
  const [venueId, setVenueId] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [durationMins, setDurationMins] = useState(120);

  const [pricingTiers, setPricingTiers] = useState<Array<{ seat_category: SeatCategory; price: number }>>([
    { seat_category: 'VIP', price: 40 },
    { seat_category: 'PREMIUM', price: 28 },
    { seat_category: 'STANDARD', price: 18 },
  ]);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchOrganizerData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('cc_token');
      const [eventsRes, venuesRes] = await Promise.all([
        fetch('/api/events/organizer/my-events', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/venues'),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
        setSummary(data.summary || {});
      }

      if (venuesRes.ok) {
        const vData = await venuesRes.json();
        setVenues(vData.venues || []);
        if (vData.venues && vData.venues.length > 0 && !venueId) {
          setVenueId(vData.venues[0].id);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrganizerData();
    }
  }, [user]);

  const handlePriceChange = (cat: SeatCategory, val: string) => {
    const p = parseFloat(val) || 0;
    setPricingTiers((prev) =>
      prev.map((tier) => (tier.seat_category === cat ? { ...tier, price: p } : tier))
    );
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          venue_id: venueId,
          title,
          description,
          category,
          banner_url: bannerUrl,
          date_time: dateTime,
          duration_mins: durationMins,
          pricing: pricingTiers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create event.');
      }

      setFeedback({ type: 'success', text: `Event "${title}" created and seats initialized!` });
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setBannerUrl('');
      await fetchOrganizerData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to publish event.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 10, borderRadius: 12, background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
            <Sparkles size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', color: '#ffffff' }}>Organizer Analytics & Event Manager</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
              Track confirmed box office revenue, occupancy statistics, and publish new movie & concert listings.
            </p>
          </div>
        </div>

        <button
          onClick={() => { setIsModalOpen(true); setFeedback(null); }}
          className="btn btn-primary btn-sm"
          style={{ background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)' }}
        >
          <Plus size={15} />
          Publish New Event
        </button>
      </div>

      {feedback && (
        <div style={{
          background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${feedback.type === 'success' ? '#10b981' : '#ef4444'}`,
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 24,
          color: feedback.type === 'success' ? '#34d399' : '#f87171',
          fontSize: '0.88rem',
        }}>
          {feedback.text}
        </div>
      )}

      {/* Analytics Summary KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 18,
        marginBottom: 36,
      }}>
        <div className="glass-panel" style={{ padding: 22, borderRadius: 18, background: '#0d1322' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Total Confirmed Revenue</span>
            <DollarSign size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>
            ${summary.totalRevenue?.toFixed(2) || '0.00'}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Excludes cancelled bookings</span>
        </div>

        <div className="glass-panel" style={{ padding: 22, borderRadius: 18, background: '#0d1322' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Tickets Sold</span>
            <Ticket size={18} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>
            {summary.totalTicketsSold || 0}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Across all published shows</span>
        </div>

        <div className="glass-panel" style={{ padding: 22, borderRadius: 18, background: '#0d1322' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Overall Occupancy</span>
            <BarChart3 size={18} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#c084fc' }}>
            {summary.overallOccupancy || 0}%
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Capacity: {summary.totalCapacity || 0} total seats</span>
        </div>

        <div className="glass-panel" style={{ padding: 22, borderRadius: 18, background: '#0d1322' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>Events Managed</span>
            <Users size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
            {summary.eventsCount || 0}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Movies & Concert Tours</span>
        </div>
      </div>

      {/* Events List Table / Cards */}
      <h2 style={{ fontSize: '1.35rem', color: '#ffffff', marginBottom: 16 }}>
        Your Events & Performance Breakdown
      </h2>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <p>Loading analytics...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <p>No events published yet. Click "Publish New Event" to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {events.map((ev) => {
            const occupancy = ev.total_seats && ev.total_seats > 0
              ? Math.round(((ev.confirmed_tickets_sold || 0) / ev.total_seats) * 100)
              : 0;

            return (
              <div
                key={ev.id}
                className="glass-panel"
                style={{
                  padding: 24,
                  borderRadius: 18,
                  background: '#0d1322',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 20,
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span className={`badge ${ev.category === 'MOVIE' ? 'badge-movie' : 'badge-concert'}`}>
                      {ev.category}
                    </span>
                    <span className="badge badge-standard">{ev.venue_name}</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: 4 }}>
                    {ev.title}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                    📅 {new Date(ev.date_time).toLocaleString()} | 📍 {ev.venue_city}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Tickets Sold</span>
                    <strong style={{ fontSize: '1.15rem', color: '#38bdf8' }}>
                      {ev.confirmed_tickets_sold || 0} / {ev.total_seats || 0}
                    </strong>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Occupancy</span>
                    <strong style={{ fontSize: '1.15rem', color: '#c084fc' }}>
                      {occupancy}%
                    </strong>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Confirmed Revenue</span>
                    <strong style={{ fontSize: '1.25rem', color: '#10b981' }}>
                      ${(ev.total_revenue || 0).toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Publish Event Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div className="glass-panel" style={{
            maxWidth: 600,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 30,
            background: '#0d1322',
            border: '1px solid rgba(236, 72, 153, 0.4)',
            position: 'relative',
          }}>
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <h2 style={{ fontSize: '1.4rem', color: '#ffffff', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Plus size={22} color="#ec4899" />
              Publish New Movie or Concert Event
            </h2>

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Avatar: The Way of Water (IMAX 3D)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161f33',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    <option value="MOVIE">Movie</option>
                    <option value="CONCERT">Concert</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                    Venue
                  </label>
                  <select
                    value={venueId}
                    onChange={(e) => setVenueId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161f33',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                    Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161f33',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                    Duration (mins)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={400}
                    value={durationMins}
                    onChange={(e) => setDurationMins(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161f33',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      color: '#ffffff',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Banner Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Synopsis / Event Description
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the experience..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#161f33',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Tier Pricing Configuration */}
              <div style={{ background: '#161f33', padding: 14, borderRadius: 10, marginTop: 4 }}>
                <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 700, marginBottom: 8 }}>
                  Category Pricing Configuration ($ USD)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {pricingTiers.map((tier) => (
                    <div key={tier.seat_category}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>
                        {tier.seat_category} Tier ($)
                      </label>
                      <input
                        type="number"
                        min={5}
                        step={1}
                        value={tier.price}
                        onChange={(e) => handlePriceChange(tier.seat_category, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          background: '#0d1322',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 6,
                          color: '#ffffff',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)' }}
                >
                  {saving ? 'Publishing...' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
