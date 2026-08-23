import React, { useState, useEffect } from 'react';
import { Event, EventCategory } from '../types';
import { Search, Film, Music, MapPin, Calendar, Ticket, Sparkles, Filter, ChevronRight, X } from 'lucide-react';

interface HomePageProps {
  onSelectEvent: (eventId: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectEvent }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      let url = '/api/events?';
      if (selectedCategory !== 'ALL') url += `category=${selectedCategory}&`;
      if (selectedCity !== 'ALL') url += `city=${encodeURIComponent(selectedCity)}&`;
      if (selectedDate) url += `date=${encodeURIComponent(selectedDate)}&`;
      if (searchQuery.trim()) url += `search=${encodeURIComponent(searchQuery.trim())}&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedCategory, selectedCity, selectedDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents();
  };

  const handleClearFilters = () => {
    setSelectedCategory('ALL');
    setSelectedCity('ALL');
    setSelectedDate('');
    setSearchQuery('');
  };

  const cities = ['ALL', 'New York', 'Los Angeles', 'Chicago'];

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '32px 24px' }}>
      {/* Hero Banner */}
      <div style={{
        position: 'relative',
        borderRadius: 24,
        overflow: 'hidden',
        padding: '48px 40px',
        marginBottom: 40,
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(236, 72, 153, 0.18) 100%), #0d1322',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
      }}>
        <div style={{ maxWidth: 680 }}>
          <div className="badge badge-movie" style={{ marginBottom: 16, fontSize: '0.8rem' }}>
            <Sparkles size={14} /> LIVE SEATING & REAL-TIME BOOKING
          </div>
          <h1 style={{ fontSize: '2.8rem', lineHeight: 1.15, marginBottom: 16, color: '#ffffff' }}>
            Experience Cinematic & Concert <span className="gradient-text">Masterpieces</span>
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '1.02rem', lineHeight: 1.6, marginBottom: 28 }}>
            Select your seats in real time with visual seating grids, instant lock reservation, automated waitlist allocation, and verifiable QR tickets.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} style={{
            display: 'flex',
            gap: 10,
            background: 'rgba(15, 23, 42, 0.90)',
            backdropFilter: 'blur(16px)',
            padding: 8,
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: '1 1 240px', padding: '0 12px', gap: 10 }}>
              <Search size={18} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search movies, concerts, artists, or venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  outline: 'none',
                  fontSize: '0.95rem',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-primary">
              Search Events
            </button>
          </form>
        </div>
      </div>

      {/* Filter Tabs & Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 30,
      }}>
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'All Events', icon: Ticket },
            { key: 'MOVIE', label: 'Movies', icon: Film },
            { key: 'CONCERT', label: 'Concerts', icon: Music },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedCategory === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedCategory(tab.key)}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ borderRadius: 20, padding: '8px 18px' }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* City & Date Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* City Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={15} color="#94a3b8" />
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{
                background: '#131b2e',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '6px 12px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city === 'ALL' ? 'All Cities' : city}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={15} color="#94a3b8" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: '#131b2e',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '5px 10px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          {(selectedCategory !== 'ALL' || selectedCity !== 'ALL' || selectedDate || searchQuery) && (
            <button
              onClick={handleClearFilters}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 10px', fontSize: '0.78rem', color: '#f87171' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div className="animate-spin-fast" style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: 16 }} />
          <p>Loading live events catalog...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
          <Ticket size={48} style={{ opacity: 0.4, marginBottom: 14 }} />
          <h3 style={{ color: '#cbd5e1', fontSize: '1.2rem', marginBottom: 6 }}>No events found</h3>
          <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>Try broadening your search or resetting your filters.</p>
          <button onClick={handleClearFilters} className="btn btn-secondary btn-sm">
            Show All Events
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 28,
        }}>
          {events.map((event) => {
            const isMovie = event.category === 'MOVIE';
            const total = event.total_seats || 1;
            const available = event.available_seats || 0;
            const occupancyPct = Math.min(100, Math.round(((total - available) / total) * 100));
            const isSoldOut = available === 0;

            const formattedDate = new Date(event.date_time).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={event.id}
                className="glass-panel glass-panel-hover"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 20,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
                onClick={() => onSelectEvent(event.id)}
              >
                {/* Event Banner Image */}
                <div style={{ position: 'relative', height: 210, overflow: 'hidden', background: '#161f33' }}>
                  {event.banner_url ? (
                    <img
                      src={event.banner_url}
                      alt={event.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isMovie ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' : 'linear-gradient(135deg, #4a044e 0%, #701a75 100%)',
                    }}>
                      {isMovie ? <Film size={48} color="#818cf8" /> : <Music size={48} color="#f472b6" />}
                    </div>
                  )}

                  <div style={{
                    position: 'absolute',
                    top: 14,
                    left: 14,
                    display: 'flex',
                    gap: 6,
                  }}>
                    <span className={`badge ${isMovie ? 'badge-movie' : 'badge-concert'}`}>
                      {isMovie ? 'Movie' : 'Concert'}
                    </span>
                    {isSoldOut && (
                      <span className="badge badge-cancelled">
                        Sold Out — Waitlist Open
                      </span>
                    )}
                  </div>

                  <div style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 14,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    color: '#e2e8f0',
                    fontWeight: 600,
                  }}>
                    {event.duration_mins} mins
                  </div>
                </div>

                {/* Event Details */}
                <div style={{ padding: 22, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: 10, lineHeight: 1.3 }}>
                      {event.title}
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={15} color="#818cf8" />
                        <span>{formattedDate}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MapPin size={15} color="#ec4899" />
                        <span>{event.venue_name}, {event.venue_city}</span>
                      </div>
                    </div>

                    <p style={{
                      fontSize: '0.84rem',
                      color: '#94a3b8',
                      lineHeight: 1.5,
                      marginBottom: 18,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {event.description}
                    </p>
                  </div>

                  {/* Pricing & Seat Availability Footer */}
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        {isSoldOut ? 'Occupancy: 100%' : `${available} of ${total} seats available`}
                      </span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#10b981' }}>
                        ${event.min_price?.toFixed(0)} - ${event.max_price?.toFixed(0)}
                      </span>
                    </div>

                    {/* Occupancy progress bar */}
                    <div style={{
                      width: '100%',
                      height: 6,
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 3,
                      overflow: 'hidden',
                      marginBottom: 16,
                    }}>
                      <div style={{
                        width: `${occupancyPct}%`,
                        height: '100%',
                        background: isSoldOut ? '#ef4444' : occupancyPct > 80 ? '#f59e0b' : '#10b981',
                        borderRadius: 3,
                      }} />
                    </div>

                    <button
                      className={`btn ${isSoldOut ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '100%', padding: '10px' }}
                    >
                      {isSoldOut ? 'Join Category Waitlist →' : 'Select Seats & Book →'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
