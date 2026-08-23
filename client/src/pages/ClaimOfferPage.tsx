import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { WaitlistOfferDetails, Booking } from '../types';
import { Sparkles, Clock, MapPin, Calendar, CheckCircle2, AlertCircle, ArrowLeft, Ticket, CreditCard } from 'lucide-react';
import { AuthModal } from '../components/common/AuthModal';

interface ClaimOfferPageProps {
  eventId: string;
  token: string;
  onBack: () => void;
  onViewBooking: (bookingId: string) => void;
}

export const ClaimOfferPage: React.FC<ClaimOfferPageProps> = ({
  eventId,
  token,
  onBack,
  onViewBooking,
}) => {
  const { user } = useAuth();
  const [offerDetails, setOfferDetails] = useState<WaitlistOfferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  const fetchOffer = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/waitlist/offer/${token}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Offer has expired or is invalid.');
      }

      setOfferDetails(data.offer);
      setSecondsRemaining(data.offer.remainingSeconds || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load waitlist offer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchOffer();
    }
  }, [token]);

  // Countdown Interval
  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setError('This waitlist offer has expired and has been cascaded to the next fan in line.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const handleClaim = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      const authToken = localStorage.getItem('cc_token');
      const res = await fetch('/api/waitlist/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim waitlist offer.');
      }

      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      setConfirmedBooking(data.booking);
    } catch (err: any) {
      setError(err.message || 'Failed to claim waitlist offer.');
    } finally {
      setClaiming(false);
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '60px auto', padding: 30, textAlign: 'center', color: '#94a3b8' }}>
        <div className="animate-spin-fast" style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #06b6d4', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: 16 }} />
        <p>Validating exclusive waitlist offer token...</p>
      </div>
    );
  }

  if (error || !offerDetails) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: 32 }}>
        <div className="glass-panel" style={{ padding: 36, textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
          <AlertCircle size={48} color="#ef4444" style={{ marginBottom: 14 }} />
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff', marginBottom: 8 }}>Offer Unavailable</h2>
          <p style={{ color: '#f87171', fontSize: '0.92rem', marginBottom: 24 }}>
            {error || 'This waitlist offer is no longer valid or has already expired.'}
          </p>
          <button onClick={onBack} className="btn btn-secondary btn-sm">
            <ArrowLeft size={15} />
            Return to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
      <button
        onClick={onBack}
        className="btn btn-secondary btn-sm"
        style={{ marginBottom: 20 }}
      >
        <ArrowLeft size={16} />
        Back to Events
      </button>

      {confirmedBooking ? (
        <div className="glass-panel" style={{
          padding: 36,
          borderRadius: 24,
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
          border: '1.5px solid #10b981',
        }}>
          <CheckCircle2 size={54} color="#10b981" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: 8 }}>
            🎉 Waitlist Claim Successful!
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: 24 }}>
            Your booking for <strong>{offerDetails.eventTitle}</strong> is now confirmed. An official QR ticket has been delivered to your email.
          </p>

          <div style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 16,
            display: 'inline-block',
            marginBottom: 20,
          }}>
            <img
              src={confirmedBooking.qrCode}
              alt="Ticket QR"
              style={{ width: 180, height: 180, display: 'block' }}
            />
            <p style={{ color: '#0f172a', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', marginTop: 8 }}>
              {confirmedBooking.bookingReference}
            </p>
          </div>

          <div>
            <button onClick={onBack} className="btn btn-primary">
              Done / Return Home
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{
          padding: 36,
          borderRadius: 24,
          background: '#0d1322',
          border: '1px solid rgba(6, 182, 212, 0.4)',
        }}>
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
            borderRadius: 16,
            padding: 24,
            color: '#ffffff',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <div className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', marginBottom: 8 }}>
                <Sparkles size={13} /> Exclusive Waitlist Offer
              </div>
              <h1 style={{ fontSize: '1.6rem', margin: 0 }}>Seats Allocated for You!</h1>
              <p style={{ opacity: 0.9, fontSize: '0.86rem', marginTop: 4 }}>
                Reserved for <strong>{offerDetails.userName}</strong>
              </p>
            </div>

            {/* Countdown Badge */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
              padding: '10px 18px',
              borderRadius: 12,
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}>
              <div style={{ fontSize: '0.72rem', color: '#e0f2fe', textTransform: 'uppercase', fontWeight: 700 }}>
                Time Remaining
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '1px' }}>
                {formattedCountdown}
              </div>
            </div>
          </div>

          {/* Event & Seat Details */}
          <div style={{ background: '#131b2e', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: '1.3rem', color: '#ffffff', marginBottom: 8 }}>
              {offerDetails.eventTitle}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: 16 }}>
              📅 {new Date(offerDetails.dateTime).toLocaleString()} | 📍 {offerDetails.venue.name} ({offerDetails.venue.address}, {offerDetails.venue.city})
            </p>

            <div style={{ fontSize: '0.82rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
              Allocated Seats ({offerDetails.seats.length})
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {offerDetails.seats.map((s) => (
                <div
                  key={s.id}
                  style={{
                    background: 'rgba(6, 182, 212, 0.15)',
                    border: '1px solid #06b6d4',
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: '#38bdf8' }}>Seat {s.label}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: 8 }}>({s.category} — ${s.price})</span>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: 16,
            }}>
              <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Total Amount to Pay</span>
              <strong style={{ color: '#10b981', fontSize: '1.5rem' }}>${offerDetails.totalAmount.toFixed(2)}</strong>
            </div>
          </div>

          {/* Claim Action */}
          <button
            onClick={handleClaim}
            disabled={claiming || secondsRemaining <= 0}
            className="btn btn-primary btn-lg"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)',
            }}
          >
            <CreditCard size={20} />
            {claiming ? 'Confirming Tickets...' : 'Confirm & Claim Tickets Now'}
          </button>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};
