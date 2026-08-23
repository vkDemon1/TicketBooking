import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Event, SeatCategory } from '../../types';
import { Users, X, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  pricingCategories: Array<{ seat_category: SeatCategory; price: number }>;
  onSuccess?: () => void;
}

export const WaitlistModal: React.FC<WaitlistModalProps> = ({
  isOpen,
  onClose,
  event,
  pricingCategories,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<SeatCategory>(
    pricingCategories[0]?.seat_category || 'VIP'
  );
  const [seatCount, setSeatCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ position: number; category: string } | null>(null);

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventId: event.id,
          seatCategory: selectedCategory,
          seatCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join waitlist.');
      }

      setSuccessData({
        position: data.position,
        category: data.seatCategory,
      });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to join waitlist.');
    } finally {
      setLoading(false);
    }
  };

  return (
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
        maxWidth: 480,
        width: '100%',
        padding: 30,
        background: '#0d1322',
        border: '1px solid rgba(6, 182, 212, 0.4)',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            padding: 10,
            borderRadius: 12,
            background: 'rgba(6, 182, 212, 0.15)',
            color: '#06b6d4',
          }}>
            <Users size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>Join Category Waitlist</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{event.title}</p>
          </div>
        </div>

        {successData ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: 12 }} />
            <h4 style={{ fontSize: '1.2rem', color: '#ffffff', marginBottom: 6 }}>
              You're On The Waitlist!
            </h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.88rem', marginBottom: 16 }}>
              Your current queue position for <strong>{successData.category}</strong> tier is:
            </p>

            <div style={{
              display: 'inline-block',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid #06b6d4',
              borderRadius: 12,
              padding: '12px 28px',
              color: '#38bdf8',
              fontSize: '1.8rem',
              fontWeight: 800,
              marginBottom: 18,
            }}>
              #{successData.position}
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 20 }}>
              When a matching seat is released via cancellation, you will receive an automatic email with an exclusive 5-minute magic claim link.
            </p>

            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#f87171',
                fontSize: '0.85rem',
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
                Select Seat Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as SeatCategory)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  outline: 'none',
                }}
              >
                {pricingCategories.map((p) => (
                  <option key={p.seat_category} value={p.seat_category}>
                    {p.seat_category} Tier (${p.price.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
                Number of Seats Desired
              </label>
              <select
                value={seatCount}
                onChange={(e) => setSeatCount(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  outline: 'none',
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={num}>
                    {num} Seat{num > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Queue Policy Info Box */}
            <div style={{
              background: '#161f33',
              borderRadius: 10,
              padding: 12,
              fontSize: '0.78rem',
              color: '#94a3b8',
              lineHeight: 1.4,
              border: '1px solid var(--border-subtle)',
            }}>
              <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: 4 }}>
                ℹ️ Queue Allocation Policy:
              </strong>
              Category-based ordered queue with oldest-satisfiable allocation. When seats become available, you will receive an email offer valid for 5 minutes.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                marginTop: 6,
              }}
            >
              {loading ? 'Joining Queue...' : 'Join Waitlist Now'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
