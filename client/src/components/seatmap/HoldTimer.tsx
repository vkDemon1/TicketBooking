import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, XCircle } from 'lucide-react';

interface HoldTimerProps {
  expiresAt: string;
  totalDurationSeconds?: number;
  onExpired: () => void;
  onRelease: () => void;
  isReleasing?: boolean;
}

export const HoldTimer: React.FC<HoldTimerProps> = ({
  expiresAt,
  totalDurationSeconds = 600,
  onExpired,
  onRelease,
  isReleasing = false,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    const updateCountdown = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        setSecondsRemaining(0);
        onExpired();
      } else {
        setSecondsRemaining(diff);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent = Math.min(100, Math.max(0, (secondsRemaining / totalDurationSeconds) * 100));
  const isUrgent = secondsRemaining < 60;

  return (
    <div
      className={isUrgent ? 'animate-urgent-pulse' : ''}
      style={{
        background: isUrgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.12)',
        border: `1.5px solid ${isUrgent ? '#ef4444' : '#f59e0b'}`,
        borderRadius: 14,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        boxShadow: isUrgent ? '0 0 20px rgba(239, 68, 68, 0.3)' : '0 0 15px rgba(245, 158, 11, 0.2)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: isUrgent ? '#ef4444' : '#f59e0b',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
        }}>
          {isUrgent ? <AlertCircle size={24} /> : <Clock size={22} />}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isUrgent ? '#fca5a5' : '#fef3c7' }}>
              Seats Locked Temporarily
            </span>
            <span className="badge" style={{
              background: isUrgent ? '#ef4444' : '#f59e0b',
              color: '#ffffff',
              fontSize: '0.68rem',
            }}>
              TTL Active
            </span>
          </div>
          <p style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: 2 }}>
            Complete your checkout before the timer expires, or seats will auto-release to other fans.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Digital Clock */}
        <div style={{
          fontFamily: 'monospace',
          fontSize: '1.45rem',
          fontWeight: 800,
          color: isUrgent ? '#f87171' : '#fbbf24',
          background: '#090d16',
          padding: '6px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          letterSpacing: '1px',
        }}>
          {formattedTime}
        </div>

        {/* Release Button */}
        <button
          onClick={onRelease}
          disabled={isReleasing}
          className="btn btn-secondary btn-sm"
          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
          title="Abandon checkout and immediately release seats"
        >
          <XCircle size={14} />
          {isReleasing ? 'Releasing...' : 'Release Hold'}
        </button>
      </div>
    </div>
  );
};
