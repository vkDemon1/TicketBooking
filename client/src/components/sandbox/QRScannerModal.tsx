import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ShieldCheck,
  Search,
  Volume2,
  VolumeX,
  UserCheck,
  History,
  Clock,
  MapPin,
  Ticket,
  User,
  Zap,
} from 'lucide-react';
import { GateScanResult } from '../../types';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBookingReference?: string;
  initialSignature?: string;
}

interface ScanHistoryItem {
  id: string;
  timestamp: string;
  bookingReference: string;
  attendee?: string;
  eventTitle?: string;
  seats?: string[];
  status: 'CHECKED_IN' | 'VALID' | 'ALREADY_REDEEMED' | 'CANCELLED' | 'INVALID';
  message: string;
  redeemedAt?: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  initialBookingReference,
  initialSignature,
}) => {
  const [payloadInput, setPayloadInput] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [signature, setSignature] = useState('');
  const [gateStaffName, setGateStaffName] = useState('Gate 1 — Main Turnstile');
  const [scanMode, setScanMode] = useState<'CHECK_IN' | 'VERIFY_ONLY'>('CHECK_IN');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [scanResult, setScanResult] = useState<GateScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play synthesized audio chimes using Web Audio API
  const playAudioFeedback = (type: 'SUCCESS' | 'WARNING' | 'ERROR') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      if (type === 'SUCCESS') {
        // High 2-tone melodic harmonic chime (587Hz D5 -> 880Hz A5)
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc2.frequency.setValueAtTime(880.0, now + 0.1); // A5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.1);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.45);
      } else if (type === 'WARNING') {
        // 2-tone alert buzz (300Hz -> 200Hz sawtooth)
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(220, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Flat error buzzer
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  };

  // Sync initial props when opened or auto-load recent demo ticket
  useEffect(() => {
    if (isOpen) {
      if (initialBookingReference && initialSignature) {
        setBookingRef(initialBookingReference);
        setSignature(initialSignature);
        setPayloadInput(JSON.stringify({ bookingReference: initialBookingReference, signature: initialSignature }, null, 2));
        setError(null);
        setScanResult(null);
      } else if (!bookingRef) {
        loadDemoAliceTicket();
      }
    }
  }, [isOpen, initialBookingReference, initialSignature]);

  const handleJsonPayloadParse = () => {
    try {
      const parsed = JSON.parse(payloadInput.trim());
      if (parsed.bookingReference) setBookingRef(parsed.bookingReference);
      if (parsed.signature) setSignature(parsed.signature);
      setError(null);
    } catch {
      setError('Invalid JSON payload format. Please input JSON containing bookingReference and signature.');
    }
  };

  // Execute Gate Action: Check-In (atomic redemption) or Verify (read-only)
  const executeScan = async (ref = bookingRef, sig = signature, forceCheckIn = false) => {
    if (!ref) {
      setError('Booking Reference is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setScanResult(null);

    const isCheckInAction = forceCheckIn || scanMode === 'CHECK_IN';

    try {
      if (isCheckInAction) {
        // Call POST /api/bookings/check-in
        const res = await fetch('/api/bookings/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReference: ref.trim(),
            signature: sig.trim() || undefined,
            gateStaffName,
          }),
        });

        const data = await res.json();

        if (res.status === 200) {
          playAudioFeedback('SUCCESS');
          setScanResult(data);
          addToHistory({
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            bookingReference: data.bookingReference,
            attendee: data.attendee,
            eventTitle: data.event?.title,
            seats: data.seats,
            status: 'CHECKED_IN',
            message: data.message,
            redeemedAt: data.redeemedAt,
          });
        } else if (res.status === 409) {
          playAudioFeedback('WARNING');
          setScanResult({
            status: 'ALREADY_REDEEMED',
            bookingReference: ref,
            message: data.message || 'Ticket already redeemed!',
            redeemedAt: data.redeemedAt,
            redeemedBy: data.redeemedBy,
            attendee: data.attendee,
            event: data.eventTitle ? { title: data.eventTitle, dateTime: '', venue: '' } : undefined,
          });
          addToHistory({
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            bookingReference: ref,
            attendee: data.attendee,
            eventTitle: data.eventTitle,
            status: 'ALREADY_REDEEMED',
            message: data.message,
            redeemedAt: data.redeemedAt,
          });
        } else {
          playAudioFeedback('ERROR');
          setScanResult({
            status: data.status === 'CANCELLED' ? 'CANCELLED' : 'INVALID',
            bookingReference: ref,
            message: data.message || 'Admission denied.',
          });
          addToHistory({
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            bookingReference: ref,
            status: data.status === 'CANCELLED' ? 'CANCELLED' : 'INVALID',
            message: data.message || 'Denied',
          });
        }
      } else {
        // Read-only Verification: GET /api/bookings/verify/:ref
        const res = await fetch(`/api/bookings/verify/${encodeURIComponent(ref.trim())}?signature=${encodeURIComponent(sig.trim())}`);
        const data = await res.json();
        setScanResult(data);

        if (data.status === 'VALID') {
          playAudioFeedback('SUCCESS');
        } else if (data.status === 'REDEEMED') {
          playAudioFeedback('WARNING');
        } else {
          playAudioFeedback('ERROR');
        }

        addToHistory({
          id: String(Date.now()),
          timestamp: new Date().toLocaleTimeString(),
          bookingReference: data.bookingReference || ref,
          attendee: data.attendee,
          eventTitle: data.event?.title,
          seats: data.seats,
          status: data.status === 'REDEEMED' ? 'ALREADY_REDEEMED' : data.status,
          message: data.message,
          redeemedAt: data.redeemedAt,
        });
      }
    } catch (err: any) {
      playAudioFeedback('ERROR');
      setError(err.message || 'Gate terminal connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const addToHistory = (item: ScanHistoryItem) => {
    setHistory(prev => [item, ...prev.slice(0, 19)]);
  };

  const loadDemoAliceTicket = async () => {
    try {
      const res = await fetch('/api/sandbox/emails');
      const data = await res.json();
      const ticketEmail = data.emails?.find((e: any) => e.template === 'TICKET_CONFIRMATION' && e.data?.bookingReference);
      if (ticketEmail?.data?.bookingReference) {
        const ref = ticketEmail.data.bookingReference;
        let sig = ticketEmail.data.signature;
        if (!sig) {
          const lookup = await fetch(`/api/bookings/verify/${encodeURIComponent(ref)}`);
          const lookupData = await lookup.json();
          sig = lookupData.signature;
        }
        if (sig) {
          setBookingRef(ref);
          setSignature(sig);
          setPayloadInput(JSON.stringify({ bookingReference: ref, signature: sig }, null, 2));
          setError(null);
          return;
        }
      }

      // Check user's bookings if logged in
      const authToken = localStorage.getItem('cc_token');
      if (authToken) {
        const bookingsRes = await fetch('/api/bookings/my-bookings', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (bookingsRes.ok) {
          const bData = await bookingsRes.json();
          if (bData.bookings && bData.bookings.length > 0) {
            const b = bData.bookings[0];
            setBookingRef(b.bookingReference);
            setSignature(b.signature);
            setPayloadInput(JSON.stringify({ bookingReference: b.bookingReference, signature: b.signature }, null, 2));
            setError(null);
            return;
          }
        }
      }
    } catch {
      // Ignored
    }
  };

  // Handle Escape key press to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
        cursor: 'pointer',
      }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 780,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#0d1322',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.15)',
          padding: 28,
          position: 'relative',
          cursor: 'default',
          borderRadius: 20,
        }}
      >
        {/* Header Actions */}
        <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              color: soundEnabled ? '#10b981' : '#64748b',
              cursor: 'pointer',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.8rem',
              transition: 'all 0.15s ease',
            }}
            title={soundEnabled ? 'Mute Chime' : 'Unmute Chime'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            aria-label="Close QR Scanner modal"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            padding: 12,
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.15) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
          }}>
            <ShieldCheck size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: '1.4rem', color: '#ffffff', margin: 0 }}>
                Venue Gate Terminal & Anti-Fraud Scanner
              </h2>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.72rem' }}>
                LIVE GATE v2.0
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.84rem', marginTop: 4 }}>
              HMAC-SHA256 signature verification with atomic gate check-in & anti-duplicate entry protection
            </p>
          </div>
        </div>

        {/* Gate Terminal Settings & Mode Switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          background: 'rgba(15, 23, 42, 0.65)',
          padding: 14,
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: 20,
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
              SCANNER OPERATING MODE
            </label>
            <div style={{ display: 'flex', gap: 6, background: '#161f33', padding: 4, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                onClick={() => setScanMode('CHECK_IN')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: scanMode === 'CHECK_IN' ? '#10b981' : 'transparent',
                  color: scanMode === 'CHECK_IN' ? '#042f2e' : '#cbd5e1',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Zap size={14} /> Scan & Check-In
              </button>
              <button
                type="button"
                onClick={() => setScanMode('VERIFY_ONLY')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: scanMode === 'VERIFY_ONLY' ? '#38bdf8' : 'transparent',
                  color: scanMode === 'VERIFY_ONLY' ? '#082f49' : '#cbd5e1',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Search size={14} /> Verify Only
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
              GATE STATION IDENTIFIER
            </label>
            <input
              type="text"
              value={gateStaffName}
              onChange={(e) => setGateStaffName(e.target.value)}
              placeholder="e.g. Turnstile A, Gate Staff #3"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#161f33',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: '0.84rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Quick Demo Pre-fill */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
            Demo Test Shortcuts:
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={loadDemoAliceTicket}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem', padding: '5px 10px' }}
            >
              Load Alice's Ticket
            </button>
            <button
              onClick={() => {
                setBookingRef('BK-INVALID-FAKE');
                setSignature('deadbeef00000000000000000000000000000000000000000000000000000000');
                setPayloadInput(JSON.stringify({ bookingReference: 'BK-INVALID-FAKE', signature: 'deadbeef...' }, null, 2));
              }}
              className="btn btn-danger btn-sm"
              style={{ fontSize: '0.78rem', padding: '5px 10px' }}
            >
              Simulate Fake QR
            </button>
          </div>
        </div>

        {/* Input Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
              Scanned QR Code Raw Payload (JSON)
            </label>
            <textarea
              rows={2}
              placeholder='{"bookingReference": "BK-...", "signature": "..."}'
              value={payloadInput}
              onChange={(e) => setPayloadInput(e.target.value)}
              onBlur={handleJsonPayloadParse}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#161f33',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                Booking Reference
              </label>
              <input
                type="text"
                placeholder="BK-XYZ..."
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                HMAC-SHA256 Signature
              </label>
              <input
                type="text"
                placeholder="64-character hex signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: '#161f33',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
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
              onClick={() => executeScan(bookingRef, signature, false)}
              disabled={loading || !bookingRef}
              className={`btn ${scanMode === 'CHECK_IN' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                padding: '12px 18px',
                fontSize: '0.95rem',
                fontWeight: 600,
                background: scanMode === 'CHECK_IN' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
                color: scanMode === 'CHECK_IN' ? '#022c22' : undefined,
                boxShadow: scanMode === 'CHECK_IN' ? '0 4px 15px rgba(16, 185, 129, 0.35)' : undefined,
              }}
            >
              {loading ? (
                'Processing Gate Scan...'
              ) : scanMode === 'CHECK_IN' ? (
                <>
                  <UserCheck size={18} /> ADMIT ATTENDEE & CHECK-IN
                </>
              ) : (
                <>
                  <Search size={18} /> VERIFY TICKET STATUS
                </>
              )}
            </button>
          </div>
        </div>

        {/* Admission Result Card */}
        {scanResult && (
          <div style={{
            marginTop: 10,
            borderRadius: 16,
            padding: 22,
            border:
              scanResult.status === 'CHECKED_IN' || scanResult.status === 'VALID'
                ? '2px solid #10b981'
                : scanResult.status === 'ALREADY_REDEEMED'
                ? '2px solid #f59e0b'
                : '2px solid #ef4444',
            background:
              scanResult.status === 'CHECKED_IN' || scanResult.status === 'VALID'
                ? 'rgba(16, 185, 129, 0.1)'
                : scanResult.status === 'ALREADY_REDEEMED'
                ? 'rgba(245, 158, 11, 0.12)'
                : 'rgba(239, 68, 68, 0.1)',
            boxShadow:
              scanResult.status === 'CHECKED_IN' || scanResult.status === 'VALID'
                ? '0 0 25px rgba(16, 185, 129, 0.2)'
                : scanResult.status === 'ALREADY_REDEEMED'
                ? '0 0 25px rgba(245, 158, 11, 0.2)'
                : '0 0 25px rgba(239, 68, 68, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              {scanResult.status === 'CHECKED_IN' || scanResult.status === 'VALID' ? (
                <div style={{ padding: 10, background: '#10b981', borderRadius: '50%', color: '#022c22' }}>
                  <CheckCircle2 size={32} />
                </div>
              ) : scanResult.status === 'ALREADY_REDEEMED' ? (
                <div style={{ padding: 10, background: '#f59e0b', borderRadius: '50%', color: '#451a03' }}>
                  <AlertTriangle size={32} />
                </div>
              ) : (
                <div style={{ padding: 10, background: '#ef4444', borderRadius: '50%', color: '#450a0a' }}>
                  <XCircle size={32} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    margin: 0,
                    color:
                      scanResult.status === 'CHECKED_IN' || scanResult.status === 'VALID'
                        ? '#34d399'
                        : scanResult.status === 'ALREADY_REDEEMED'
                        ? '#fbbf24'
                        : '#f87171',
                  }}>
                    {scanResult.status === 'CHECKED_IN' && '✓ ACCESS GRANTED — TICKET REDEEMED'}
                    {scanResult.status === 'VALID' && '✓ VALID TICKET — ADMISSION READY'}
                    {scanResult.status === 'ALREADY_REDEEMED' && '⚠ DOUBLE ENTRY ALERT — ALREADY REDEEMED'}
                    {scanResult.status === 'CANCELLED' && '✕ ENTRY DENIED — TICKET CANCELLED'}
                    {scanResult.status === 'INVALID' && '✕ ENTRY DENIED — INVALID / FORGED SIGNATURE'}
                  </h3>
                  {scanResult.redeemedAt && (
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', background: 'rgba(0, 0, 0, 0.4)', padding: '4px 8px', borderRadius: 6 }}>
                      Checked in: {new Date(scanResult.redeemedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: 6, lineHeight: 1.5 }}>
                  {scanResult.message}
                </p>
              </div>
            </div>

            {/* Attendee Details Card */}
            {(scanResult.attendee || scanResult.event || scanResult.seats) && (
              <div style={{ background: '#111827', borderRadius: 12, padding: 16, fontSize: '0.88rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {scanResult.attendee && (
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>ATTENDEE</span>
                      <strong style={{ color: '#ffffff', fontSize: '0.98rem' }}>{scanResult.attendee}</strong>
                    </div>
                  )}
                  {scanResult.bookingReference && (
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>BOOKING REF</span>
                      <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{scanResult.bookingReference}</strong>
                    </div>
                  )}
                  {scanResult.event?.title && (
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>EVENT</span>
                      <strong style={{ color: '#ffffff' }}>{scanResult.event.title}</strong>
                    </div>
                  )}
                  {scanResult.seats && scanResult.seats.length > 0 && (
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>RESERVED SEATS ({scanResult.seats.length})</span>
                      <strong style={{ color: '#fbbf24' }}>{scanResult.seats.join(', ')}</strong>
                    </div>
                  )}
                  {scanResult.redeemedBy && (
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>PROCESSED BY</span>
                      <span style={{ color: '#cbd5e1' }}>{scanResult.redeemedBy}</span>
                    </div>
                  )}
                </div>

                {/* Quick Check-In Action Button if in Verify Only Mode */}
                {scanResult.status === 'VALID' && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => executeScan(bookingRef, signature, true)}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#10b981', color: '#042f2e', fontWeight: 600 }}
                    >
                      <UserCheck size={16} /> Check In & Admit Now
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Gate Session Scan History */}
        {history.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.84rem', fontWeight: 600 }}>
                <History size={16} /> RECENT GATE SCANS ({history.length})
              </div>
              <button
                onClick={() => setHistory([])}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.76rem', cursor: 'pointer' }}
              >
                Clear Log
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#111827',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        h.status === 'CHECKED_IN' || h.status === 'VALID'
                          ? '#10b981'
                          : h.status === 'ALREADY_REDEEMED'
                          ? '#f59e0b'
                          : '#ef4444',
                    }} />
                    <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{h.bookingReference}</span>
                    {h.attendee && <span style={{ color: '#ffffff' }}>— {h.attendee}</span>}
                    {h.seats && <span style={{ color: '#94a3b8' }}>({h.seats.length} seats)</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background:
                        h.status === 'CHECKED_IN'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : h.status === 'ALREADY_REDEEMED'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        h.status === 'CHECKED_IN'
                          ? '#10b981'
                          : h.status === 'ALREADY_REDEEMED'
                          ? '#f59e0b'
                          : '#ef4444',
                      fontWeight: 600,
                    }}>
                      {h.status}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{h.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

