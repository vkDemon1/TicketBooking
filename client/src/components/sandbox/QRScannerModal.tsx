import React, { useState } from 'react';
import { QrCode, CheckCircle2, XCircle, AlertTriangle, X, ShieldCheck, Search } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose }) => {
  const [payloadInput, setPayloadInput] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [signature, setSignature] = useState('');
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleJsonPayloadParse = () => {
    try {
      const parsed = JSON.parse(payloadInput.trim());
      if (parsed.bookingReference) setBookingRef(parsed.bookingReference);
      if (parsed.signature) setSignature(parsed.signature);
      setError(null);
    } catch {
      setError('Invalid JSON payload format. Please input JSON with bookingReference and signature.');
    }
  };

  const handleVerify = async (ref = bookingRef, sig = signature) => {
    if (!ref || !sig) {
      setError('Both Booking Reference and HMAC Signature are required to verify.');
      return;
    }

    setLoading(true);
    setError(null);
    setVerificationResult(null);

    try {
      const res = await fetch(`/api/bookings/verify/${encodeURIComponent(ref.trim())}?signature=${encodeURIComponent(sig.trim())}`);
      const data = await res.json();
      setVerificationResult(data);
    } catch (err: any) {
      setError(err.message || 'Verification request failed.');
    } finally {
      setLoading(false);
    }
  };

  const loadDemoAliceTicket = async () => {
    try {
      const res = await fetch('/api/sandbox/emails');
      const data = await res.json();
      const ticketEmail = data.emails?.find((e: any) => e.template === 'TICKET_CONFIRMATION');
      if (ticketEmail?.data?.bookingReference) {
        setBookingRef(ticketEmail.data.bookingReference);
        // Look up signature from booking
        const lookup = await fetch(`/api/bookings/verify/${ticketEmail.data.bookingReference}`);
        const lookupData = await lookup.json();
        if (lookupData.signature) {
          setSignature(lookupData.signature);
          setPayloadInput(JSON.stringify({ bookingReference: ticketEmail.data.bookingReference, signature: lookupData.signature }, null, 2));
        }
      } else {
        // Fallback default
        setBookingRef('BK-ALICE-DEMO');
        setSignature('dummy_signature_sample');
      }
    } catch {
      // Ignored
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 20,
    }}>
      <div className="glass-panel" style={{
        maxWidth: 680,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#0d1322',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        padding: 28,
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
          <X size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            padding: 10,
            borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
          }}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', color: '#ffffff' }}>
              Venue Gate Ticket Scanner & Verifier
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
              Cryptographically validates HMAC-SHA256 signatures against the SQLite authority
            </p>
          </div>
        </div>

        {/* Quick Demo Pre-fill */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
            Quick test with recently booked ticket:
          </span>
          <button
            onClick={loadDemoAliceTicket}
            className="btn btn-secondary btn-sm"
          >
            Load Recent Ticket
          </button>
        </div>

        {/* Input Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
              Scanned QR Code Payload (JSON)
            </label>
            <textarea
              rows={3}
              placeholder='{"bookingReference": "BK-...", "signature": "..."}'
              value={payloadInput}
              onChange={(e) => setPayloadInput(e.target.value)}
              onBlur={handleJsonPayloadParse}
              style={{
                width: '100%',
                padding: 12,
                background: '#161f33',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                Booking Reference
              </label>
              <input
                type="text"
                placeholder="BK-XYZ..."
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                HMAC-SHA256 Signature
              </label>
              <input
                type="text"
                placeholder="64-character hex signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

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

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={() => handleVerify()}
              disabled={loading || !bookingRef || !signature}
              className="btn btn-primary"
              style={{ flex: 1, padding: 12 }}
            >
              {loading ? 'Verifying Signature...' : '🔍 Validate Ticket & Status'}
            </button>
            <button
              onClick={() => {
                // Test invalid counterfeit signature
                handleVerify(bookingRef, 'forged_fake_signature_1234567890abcdef');
              }}
              disabled={!bookingRef}
              className="btn btn-danger btn-sm"
              title="Test signature tampering"
            >
              Simulate Fake Signature
            </button>
          </div>
        </div>

        {/* Verification Result Display */}
        {verificationResult && (
          <div style={{
            marginTop: 10,
            borderRadius: 14,
            padding: 20,
            border: verificationResult.status === 'VALID'
              ? '1.5px solid #10b981'
              : verificationResult.status === 'CANCELLED'
              ? '1.5px solid #f59e0b'
              : '1.5px solid #ef4444',
            background: verificationResult.status === 'VALID'
              ? 'rgba(16, 185, 129, 0.08)'
              : verificationResult.status === 'CANCELLED'
              ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(239, 68, 68, 0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {verificationResult.status === 'VALID' ? (
                <CheckCircle2 size={32} color="#10b981" />
              ) : verificationResult.status === 'CANCELLED' ? (
                <AlertTriangle size={32} color="#f59e0b" />
              ) : (
                <XCircle size={32} color="#ef4444" />
              )}
              <div>
                <h3 style={{
                  fontSize: '1.25rem',
                  color: verificationResult.status === 'VALID'
                    ? '#10b981'
                    : verificationResult.status === 'CANCELLED'
                    ? '#f59e0b'
                    : '#ef4444',
                }}>
                  {verificationResult.status === 'VALID' && '✓ VALID TICKET — ADMISSION GRANTED'}
                  {verificationResult.status === 'CANCELLED' && '✕ TICKET CANCELLED — ADMISSION DENIED'}
                  {verificationResult.status === 'INVALID' && '✕ INVALID / COUNTERFEIT TICKET'}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  {verificationResult.message}
                </p>
              </div>
            </div>

            {verificationResult.status === 'VALID' && (
              <div style={{ background: '#111827', borderRadius: 10, padding: 14, fontSize: '0.88rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Attendee: </span>
                    <strong style={{ color: '#ffffff' }}>{verificationResult.attendee}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Reference: </span>
                    <strong style={{ color: '#38bdf8' }}>{verificationResult.bookingReference}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Event: </span>
                    <strong style={{ color: '#ffffff' }}>{verificationResult.event?.title}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Seats: </span>
                    <strong style={{ color: '#fbbf24' }}>{verificationResult.seats?.join(', ')}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748b' }}>Venue & Time: </span>
                    <span style={{ color: '#cbd5e1' }}>{verificationResult.event?.venue} — {new Date(verificationResult.event?.dateTime).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
