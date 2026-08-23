import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Booking, WaitlistEntry } from '../types';
import { TicketCard } from '../components/tickets/TicketCard';
import { QRScannerModal } from '../components/sandbox/QRScannerModal';
import { Ticket, Users, Clock, AlertCircle, Sparkles, ExternalLink } from 'lucide-react';

interface MyBookingsPageProps {
  onNavigateClaim: (eventId: string, token: string) => void;
  onNavigateHome: () => void;
}

export const MyBookingsPage: React.FC<MyBookingsPageProps> = ({
  onNavigateClaim,
  onNavigateHome,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'bookings' | 'waitlist'>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVerifyBooking, setSelectedVerifyBooking] = useState<Booking | null>(null);

  const fetchBookings = async () => {
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/bookings/my-bookings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings || []);
      }
    } catch {
      // Ignored
    }
  };

  const fetchWaitlist = async () => {
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/waitlist/my-entries', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWaitlistEntries(data.entries || []);
      }
    } catch {
      // Ignored
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchBookings(), fetchWaitlist()]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleCancelBooking = async (bookingId: string) => {
    const token = localStorage.getItem('cc_token');
    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      await loadData();
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: 700, margin: '60px auto', padding: 30, textAlign: 'center' }}>
        <Ticket size={48} color="#818cf8" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: '1.5rem', color: '#ffffff', marginBottom: 8 }}>Authentication Required</h2>
        <p style={{ color: '#94a3b8', marginBottom: 20 }}>
          Please sign in or switch demo persona to view your confirmed tickets and waitlist status.
        </p>
        <button onClick={onNavigateHome} className="btn btn-primary">
          Explore Events
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '2rem', color: '#ffffff', marginBottom: 6 }}>
          My Bookings & Waitlist Status
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.92rem' }}>
          Manage your confirmed show tickets, scan QR codes, and track your active waitlist queue positions.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`btn ${activeTab === 'bookings' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          style={{ borderRadius: 20, padding: '8px 20px' }}
        >
          <Ticket size={16} />
          Confirmed Bookings ({bookings.length})
        </button>

        <button
          onClick={() => setActiveTab('waitlist')}
          className={`btn ${activeTab === 'waitlist' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          style={{ borderRadius: 20, padding: '8px 20px' }}
        >
          <Users size={16} />
          Waitlist Entries ({waitlistEntries.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div className="animate-spin-fast" style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: 16 }} />
          <p>Loading your tickets and queue status...</p>
        </div>
      ) : activeTab === 'bookings' ? (
        <div>
          {bookings.length === 0 ? (
            <div className="glass-panel" style={{ padding: 50, textAlign: 'center', color: '#64748b' }}>
              <Ticket size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
              <h3 style={{ color: '#cbd5e1', fontSize: '1.2rem', marginBottom: 6 }}>No bookings found</h3>
              <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>
                You haven't booked any movies or concerts yet.
              </p>
              <button onClick={onNavigateHome} className="btn btn-primary btn-sm">
                Browse Live Events
              </button>
            </div>
          ) : (
            <div>
              {bookings.map((b) => (
                <TicketCard
                  key={b.id}
                  booking={b}
                  onCancel={handleCancelBooking}
                  onVerify={(bk) => setSelectedVerifyBooking(bk)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Waitlist Tab */
        <div>
          {waitlistEntries.length === 0 ? (
            <div className="glass-panel" style={{ padding: 50, textAlign: 'center', color: '#64748b' }}>
              <Users size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
              <h3 style={{ color: '#cbd5e1', fontSize: '1.2rem', marginBottom: 6 }}>No active waitlist entries</h3>
              <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>
                When popular shows sell out, you can join category waitlists to receive automated seat allocations on cancellation.
              </p>
              <button onClick={onNavigateHome} className="btn btn-primary btn-sm">
                Explore Events
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {waitlistEntries.map((entry) => {
                const isOffered = entry.status === 'OFFERED' && entry.offer;
                const formattedDate = new Date(entry.dateTime).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={entry.id}
                    className="glass-panel"
                    style={{
                      padding: 24,
                      borderRadius: 16,
                      border: isOffered ? '1.5px solid #06b6d4' : '1px solid var(--border-subtle)',
                      background: isOffered ? 'rgba(6, 182, 212, 0.08)' : '#0d1322',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span className={`badge ${
                            entry.status === 'WAITING' ? 'badge-standard' : entry.status === 'OFFERED' ? 'badge-vip' : entry.status === 'CONVERTED' ? 'badge-confirmed' : 'badge-cancelled'
                          }`}>
                            {entry.status === 'OFFERED' ? '⚡ SEATS ALLOCATED!' : entry.status}
                          </span>
                          <span className="badge badge-premium">
                            {entry.category} Tier ({entry.seatCount} Seat{entry.seatCount > 1 ? 's' : ''})
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>
                          {entry.eventTitle}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.84rem', marginTop: 2 }}>
                          📅 {formattedDate} | 📍 {entry.venueName}, {entry.venueCity}
                        </p>
                      </div>

                      {entry.status === 'WAITING' && (
                        <div style={{
                          background: '#161f33',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 12,
                          padding: '10px 18px',
                          textAlign: 'center',
                        }}>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
                            Queue Position
                          </span>
                          <strong style={{ fontSize: '1.4rem', color: '#38bdf8' }}>
                            #{entry.queuePosition}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Active Offer Callout */}
                    {isOffered && entry.offer && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%)',
                        border: '1px solid #06b6d4',
                        borderRadius: 12,
                        padding: 16,
                        marginTop: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.95rem' }}>
                            ✨ Seats Have Been Temporarily Reserved For You!
                          </div>
                          <div style={{ fontSize: '0.84rem', color: '#e2e8f0', marginTop: 2 }}>
                            Allocated Seats: <strong>{entry.offer.seats.join(', ')}</strong> | Time limit: 5 minutes
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigateClaim(entry.eventId, entry.offer!.claimToken)}
                          className="btn btn-primary btn-sm"
                          style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' }}
                        >
                          <ExternalLink size={14} />
                          Claim Allocated Tickets Now →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* QR Scanner Modal */}
      {selectedVerifyBooking && (
        <QRScannerModal
          isOpen={Boolean(selectedVerifyBooking)}
          onClose={() => setSelectedVerifyBooking(null)}
        />
      )}
    </div>
  );
};
