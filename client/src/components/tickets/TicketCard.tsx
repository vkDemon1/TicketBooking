import React, { useState } from 'react';
import { Booking } from '../../types';
import { QrCode, Calendar, MapPin, Ticket, AlertTriangle, Printer, XCircle, Copy, Check } from 'lucide-react';

interface TicketCardProps {
  booking: Booking;
  onCancel?: (bookingId: string) => Promise<void>;
  onVerify?: (booking: Booking) => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ booking, onCancel, onVerify }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  const formattedDate = new Date(booking.event.dateTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel(booking.id);
      setShowConfirmCancel(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCopyRef = () => {
    navigator.clipboard.writeText(booking.bookingReference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const isConfirmed = booking.status === 'CONFIRMED';

  return (
    <div className="glass-panel" style={{
      display: 'flex',
      flexDirection: 'row',
      borderRadius: 18,
      overflow: 'hidden',
      border: isConfirmed ? '1px solid rgba(99, 102, 241, 0.28)' : '1px solid rgba(239, 68, 68, 0.3)',
      background: isConfirmed ? '#0d1322' : 'rgba(20, 15, 20, 0.85)',
      opacity: isConfirmed ? 1 : 0.82,
      marginBottom: 20,
      flexWrap: 'wrap',
      boxShadow: isConfirmed ? '0 12px 32px rgba(0, 0, 0, 0.5)' : 'none',
      transition: 'all 0.2s ease',
    }}>
      {/* Main Ticket Info Section */}
      <div style={{
        flex: '1 1 380px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className={`badge ${isConfirmed ? 'badge-confirmed' : 'badge-cancelled'}`}>
              {booking.status}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 600 }}>
                {booking.bookingReference}
              </span>
              <button
                onClick={handleCopyRef}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? '#10b981' : '#64748b',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Copy booking reference"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: '1.35rem', color: isConfirmed ? '#ffffff' : '#e2e8f0', marginBottom: 10, lineHeight: 1.3 }}>
            {booking.event.title}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.86rem', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={15} color="#818cf8" />
              <span>{formattedDate}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={15} color="#ec4899" />
              <span>{booking.event.venue.name}, {booking.event.venue.city}</span>
            </div>
          </div>

          {/* Seat Chips */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
              Reserved Seats
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {booking.seats.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    background: isConfirmed ? '#161f33' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: '0.82rem',
                    color: '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: '#38bdf8' }}>{s.label}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', marginLeft: 6 }}>({s.category})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          marginTop: 22,
          paddingTop: 16,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Total Paid</span>
            <strong style={{ fontSize: '1.25rem', color: isConfirmed ? '#10b981' : '#94a3b8' }}>
              ${booking.totalAmount.toFixed(2)}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePrint}
              className="btn btn-secondary btn-sm"
              title="Print ticket"
            >
              <Printer size={14} />
              Print
            </button>

            {isConfirmed && onCancel && (
              <button
                onClick={() => setShowConfirmCancel(true)}
                className="btn btn-danger btn-sm"
              >
                <XCircle size={14} />
                Cancel Booking
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Perforated Divider Bar */}
      <div style={{
        width: 1,
        background: 'repeating-linear-gradient(to bottom, transparent, transparent 6px, rgba(255,255,255,0.15) 6px, rgba(255,255,255,0.15) 12px)',
        position: 'relative',
      }} />

      {/* QR Ticket Stub Section */}
      <div style={{
        flex: '0 0 240px',
        padding: '24px 20px',
        background: '#090d18',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}>
        {isConfirmed ? (
          <>
            <div style={{
              background: '#ffffff',
              padding: 10,
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              marginBottom: 10,
            }}>
              <img
                src={booking.qrCode}
                alt="Ticket QR Code"
                style={{ width: 140, height: 140, display: 'block' }}
              />
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#cbd5e1',
              letterSpacing: '0.5px',
            }}>
              {booking.bookingReference}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
              Scan at gate for entry
            </span>

            {onVerify && (
              <button
                onClick={() => onVerify(booking)}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12, width: '100%', fontSize: '0.75rem', padding: '5px 8px' }}
              >
                <QrCode size={13} color="#10b981" />
                Test QR Scanner
              </button>
            )}
          </>
        ) : (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <XCircle size={44} color="#ef4444" style={{ marginBottom: 10 }} />
            <h4 style={{ color: '#ef4444', fontSize: '0.98rem' }}>Ticket Cancelled</h4>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>
              Seats were returned to inventory / waitlist.
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Booking Cancellation */}
      {showConfirmCancel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20,
        }}>
          <div className="glass-panel" style={{
            maxWidth: 440,
            width: '100%',
            padding: 28,
            background: '#0d1322',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 10, borderRadius: 10, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: '#ffffff' }}>Cancel Booking?</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Reference: {booking.bookingReference}</p>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to cancel your tickets for <strong>{booking.event.title}</strong>?
              Your released seats will be automatically offered to the next fan waiting in the category waitlist queue.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirmCancel(false)}
                className="btn btn-secondary btn-sm"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="btn btn-danger btn-sm"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
