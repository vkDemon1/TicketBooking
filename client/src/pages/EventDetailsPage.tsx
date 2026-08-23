import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Event, EventSeatState, EventSeatPricing, Booking } from '../types';
import { SeatMap } from '../components/seatmap/SeatMap';
import { SeatLegend } from '../components/seatmap/SeatLegend';
import { HoldTimer } from '../components/seatmap/HoldTimer';
import { TicketCard } from '../components/tickets/TicketCard';
import { WaitlistModal } from '../components/waitlist/WaitlistModal';
import { AuthModal } from '../components/common/AuthModal';
import {
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Users,
  ShieldCheck,
  ArrowLeft,
  Lock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface EventDetailsPageProps {
  eventId: string;
  onBack: () => void;
  onViewBooking: (bookingId: string) => void;
}

export const EventDetailsPage: React.FC<EventDetailsPageProps> = ({
  eventId,
  onBack,
  onViewBooking,
}) => {
  const { user } = useAuth();
  const { socket, joinEvent, leaveEvent } = useSocket();

  const [event, setEvent] = useState<Event | null>(null);
  const [pricing, setPricing] = useState<EventSeatPricing[]>([]);
  const [seats, setSeats] = useState<EventSeatState[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Hold State
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  // Modals & Feedback
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  // Fetch Event Details & Seat Map
  const loadEventData = useCallback(async () => {
    try {
      const token = localStorage.getItem('cc_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [eventRes, seatsRes] = await Promise.all([
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/seats`, { headers }),
      ]);

      if (eventRes.ok) {
        const evData = await eventRes.json();
        setEvent(evData.event);
        setPricing(evData.pricing || []);
      }

      if (seatsRes.ok) {
        const sData = await seatsRes.json();
        setSeats(sData.seats || []);

        // Restore active hold if user already has one on this event
        const myHeldSeats = (sData.seats || []).filter((s: EventSeatState) => s.isMyHold);
        if (myHeldSeats.length > 0 && myHeldSeats[0].holdExpiresAt) {
          setHoldExpiresAt(myHeldSeats[0].holdExpiresAt);
          setSelectedSeatIds(myHeldSeats.map((s: EventSeatState) => s.seatId));
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEventData();
    joinEvent(eventId);

    return () => {
      leaveEvent(eventId);
    };
  }, [eventId, joinEvent, leaveEvent, loadEventData]);

  // Real-Time Socket.io Event Listeners
  useEffect(() => {
    if (!socket) return;

    const handleSeatsHeld = (data: any) => {
      if (data.eventId === eventId) {
        setSeats((prev) =>
          prev.map((s) => {
            if (data.seatIds?.includes(s.seatId)) {
              return { ...s, status: 'HELD' };
            }
            return s;
          })
        );
      }
    };

    const handleSeatsReleased = (data: any) => {
      if (data.eventId === eventId) {
        setSeats((prev) =>
          prev.map((s) => {
            if (data.seatIds?.includes(s.seatId)) {
              return { ...s, status: 'AVAILABLE', isMyHold: false };
            }
            return s;
          })
        );
        // Refresh full seat state to stay 100% in sync
        loadEventData();
      }
    };

    const handleSeatsBooked = (data: any) => {
      if (data.eventId === eventId) {
        setSeats((prev) =>
          prev.map((s) => {
            if (data.seatIds?.includes(s.seatId)) {
              return { ...s, status: 'BOOKED', isMyHold: false };
            }
            return s;
          })
        );
      }
    };

    socket.on('SEATS_HELD', handleSeatsHeld);
    socket.on('SEATS_RELEASED', handleSeatsReleased);
    socket.on('SEATS_BOOKED', handleSeatsBooked);
    socket.on('WAITLIST_OFFER_CREATED', () => loadEventData());
    socket.on('WAITLIST_OFFER_EXPIRED', () => loadEventData());

    return () => {
      socket.off('SEATS_HELD', handleSeatsHeld);
      socket.off('SEATS_RELEASED', handleSeatsReleased);
      socket.off('SEATS_BOOKED', handleSeatsBooked);
    };
  }, [socket, eventId, loadEventData]);

  // Seat Click Handler
  const handleToggleSeat = (seat: EventSeatState) => {
    if (activeHoldId) {
      setAlertMessage({
        type: 'info',
        text: 'You currently have an active hold session. Please checkout or release your hold before modifying seats.',
      });
      return;
    }

    if (selectedSeatIds.includes(seat.seatId)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.seatId));
    } else {
      if (selectedSeatIds.length >= 8) {
        setAlertMessage({ type: 'error', text: 'You can hold a maximum of 8 seats per booking.' });
        return;
      }
      setSelectedSeatIds([...selectedSeatIds, seat.seatId]);
    }
  };

  // Selected Seats Calculation
  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s.seatId));
  const totalPrice = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  // 1. Hold Seats Handler (Atomic POST /api/bookings/hold)
  const handleHoldSeats = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    if (selectedSeatIds.length === 0) return;

    setIsHolding(true);
    setAlertMessage(null);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/bookings/hold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventId,
          seatIds: selectedSeatIds,
          ttlSeconds: 600, // 10 minutes
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place seat hold.');
      }

      setActiveHoldId(data.holdId);
      setHoldExpiresAt(data.expiresAt);
      setAlertMessage({
        type: 'success',
        text: `Seats locked for 10 minutes! Please complete your checkout below.`,
      });

      await loadEventData();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Seat conflict occurred.' });
      await loadEventData();
    } finally {
      setIsHolding(false);
    }
  };

  // 2. Manual Release Hold Handler
  const handleReleaseHold = async () => {
    if (!activeHoldId) return;
    setIsReleasing(true);

    try {
      const token = localStorage.getItem('cc_token');
      await fetch('/api/bookings/release-hold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ holdId: activeHoldId }),
      });

      setActiveHoldId(null);
      setHoldExpiresAt(null);
      setSelectedSeatIds([]);
      setAlertMessage({ type: 'info', text: 'Seat hold was released.' });
      await loadEventData();
    } catch {
      // Ignored
    } finally {
      setIsReleasing(false);
    }
  };

  // 3. Checkout Handler (Atomic POST /api/bookings/checkout)
  const handleCheckout = async () => {
    if (!activeHoldId) return;

    setIsCheckingOut(true);
    setAlertMessage(null);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/bookings/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ holdId: activeHoldId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Booking conversion failed.');
      }

      // Celebrate with Confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      setConfirmedBooking(data.booking);
      setActiveHoldId(null);
      setHoldExpiresAt(null);
      setSelectedSeatIds([]);
      await loadEventData();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Checkout failed.' });
      await loadEventData();
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (loading || !event) {
    return (
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
        <div className="animate-spin-fast" style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: 16 }} />
        <p>Loading event and visual seat layout...</p>
      </div>
    );
  }

  const isSoldOut = event.available_seats === 0;
  const formattedDate = new Date(event.date_time).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 24px 60px 24px' }}>
      {/* Back Button */}
      <button
        onClick={onBack}
        className="btn btn-secondary btn-sm"
        style={{ marginBottom: 20 }}
      >
        <ArrowLeft size={16} />
        Back to Events
      </button>

      {/* Confirmed Booking Success Banner */}
      {confirmedBooking && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)',
          border: '1.5px solid #10b981',
          borderRadius: 18,
          padding: 28,
          marginBottom: 30,
          boxShadow: '0 10px 30px rgba(16, 185, 129, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <CheckCircle2 size={32} color="#10b981" />
            <div>
              <h2 style={{ fontSize: '1.5rem', color: '#ffffff' }}>Booking Confirmed!</h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.88rem' }}>
                Your tickets have been issued and delivered to your email with an official QR admission ticket.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>
              Booking Reference: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{confirmedBooking.bookingReference}</strong>
            </div>
            <button
              onClick={() => onBack()}
              className="btn btn-success btn-sm"
            >
              Done / Return Home
            </button>
          </div>
        </div>
      )}

      {/* Event Header Banner */}
      <div className="glass-panel" style={{
        padding: 32,
        borderRadius: 24,
        marginBottom: 30,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 30,
        alignItems: 'center',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.8) 100%)',
      }}>
        {event.banner_url && (
          <img
            src={event.banner_url}
            alt={event.title}
            style={{ width: 160, height: 220, borderRadius: 14, objectFit: 'cover', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
          />
        )}

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span className={`badge ${event.category === 'MOVIE' ? 'badge-movie' : 'badge-concert'}`}>
              {event.category}
            </span>
            <span className="badge badge-standard">
              {event.venue_name}
            </span>
          </div>

          <h1 style={{ fontSize: '2.2rem', color: '#ffffff', marginBottom: 12, lineHeight: 1.2 }}>
            {event.title}
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: '0.9rem', color: '#cbd5e1', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={16} color="#818cf8" />
              <span>{formattedDate}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={16} color="#38bdf8" />
              <span>{event.duration_mins} Minutes</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="#ec4899" />
              <span>{event.venue_address}, {event.venue_city}</span>
            </div>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 800 }}>
            {event.description}
          </p>
        </div>
      </div>

      {/* Alert Notification */}
      {alertMessage && (
        <div style={{
          background: alertMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : alertMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
          border: `1px solid ${alertMessage.type === 'error' ? '#ef4444' : alertMessage.type === 'success' ? '#10b981' : '#38bdf8'}`,
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 20,
          color: alertMessage.type === 'error' ? '#f87171' : alertMessage.type === 'success' ? '#34d399' : '#38bdf8',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {alertMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{alertMessage.text}</span>
        </div>
      )}

      {/* Active Hold Countdown Timer */}
      {holdExpiresAt && (
        <HoldTimer
          expiresAt={holdExpiresAt}
          onExpired={() => {
            setActiveHoldId(null);
            setHoldExpiresAt(null);
            setSelectedSeatIds([]);
            setAlertMessage({ type: 'error', text: 'Your seat hold has expired and seats were auto-released.' });
            loadEventData();
          }}
          onRelease={handleReleaseHold}
          isReleasing={isReleasing}
        />
      )}

      {/* Main Grid: Left Seat Map + Right Checkout Sidebar */}
      <div className="event-details-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: 28,
        alignItems: 'start',
      }}>
        {/* Left: Seat Map Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '1.35rem', color: '#ffffff' }}>Interactive Seat Selection</h2>
            <button
              onClick={loadEventData}
              className="btn btn-secondary btn-sm"
              title="Refresh live seat state"
            >
              <RefreshCw size={13} />
              Sync Grid
            </button>
          </div>

          <SeatLegend pricing={pricing} />

          <SeatMap
            seats={seats}
            selectedSeatIds={selectedSeatIds}
            onToggleSeat={handleToggleSeat}
            category={event.category}
            disabled={isSoldOut}
          />
        </div>

        {/* Right: Checkout & Waitlist Sidebar */}
        <div className="event-details-sidebar" style={{ position: 'sticky', top: 90 }}>
          <div className="glass-panel" style={{ padding: 24, borderRadius: 20 }}>
            <h3 style={{ fontSize: '1.2rem', color: '#ffffff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ticket size={18} color="#818cf8" />
              Booking Summary
            </h3>

            {/* Selected Seats List */}
            {selectedSeats.length === 0 ? (
              <div style={{
                background: '#131b2e',
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
                color: '#64748b',
                marginBottom: 20,
              }}>
                <Ticket size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                <p style={{ fontSize: '0.88rem' }}>No seats selected.</p>
                <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Click on available seats on the map to add them.</p>
              </div>
            ) : (
              <div style={{
                background: '#131b2e',
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                  Selected ({selectedSeats.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {selectedSeats.map((s) => (
                    <div
                      key={s.seatId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.86rem',
                        paddingBottom: 6,
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#ffffff' }}>Seat {s.row}{s.number}</strong>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: 8 }}>({s.category})</span>
                      </div>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>${s.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total Price */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 0',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              marginBottom: 20,
            }}>
              <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Total Amount</span>
              <strong style={{ color: '#10b981', fontSize: '1.5rem' }}>${totalPrice.toFixed(2)}</strong>
            </div>

            {/* Action Buttons: Hold / Checkout / Waitlist */}
            {activeHoldId ? (
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)',
                }}
              >
                <CreditCard size={18} />
                {isCheckingOut ? 'Confirming Booking...' : 'Complete & Confirm Booking'}
              </button>
            ) : (
              <button
                onClick={handleHoldSeats}
                disabled={selectedSeatIds.length === 0 || isHolding}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <Lock size={18} />
                {isHolding ? 'Placing Hold...' : 'Lock Seats & Proceed (10m TTL)'}
              </button>
            )}

            {/* Waitlist Button if Sold Out or User prefers waitlisting */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: 10 }}>
                Can't find your desired tier or event is filling up?
              </p>
              <button
                onClick={() => {
                  if (!user) {
                    setIsAuthModalOpen(true);
                  } else {
                    setIsWaitlistModalOpen(true);
                  }
                }}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
              >
                <Users size={14} />
                Join Category Waitlist Queue
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Waitlist Modal */}
      <WaitlistModal
        isOpen={isWaitlistModalOpen}
        onClose={() => setIsWaitlistModalOpen(false)}
        event={event}
        pricingCategories={pricing}
        onSuccess={() => {
          setAlertMessage({ type: 'success', text: 'You have been added to the waitlist queue!' });
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};
