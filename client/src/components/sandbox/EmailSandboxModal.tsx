import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, X, ExternalLink, QrCode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { EmailLog } from '../../types';

interface EmailSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailSandboxModal: React.FC<EmailSandboxModalProps> = ({ isOpen, onClose }) => {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sandbox/emails');
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        if (data.emails && data.emails.length > 0 && !selectedEmail) {
          setSelectedEmail(data.emails[0]);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEmails();
    }
  }, [isOpen]);

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

  const getResolvedClaimUrl = (rawUrl?: string) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://localhost') || rawUrl.startsWith('http://127.0.0.1')) {
      try {
        const parsed = new URL(rawUrl);
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      } catch {
        return rawUrl;
      }
    }
    return rawUrl;
  };

  const resolvedClaimUrl = selectedEmail?.data?.claimUrl ? getResolvedClaimUrl(selectedEmail.data.claimUrl) : '';

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
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
          maxWidth: 1000,
          width: '100%',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#0c101c',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          cursor: 'default',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.8)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              padding: 8,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#818cf8',
            }}>
              <Mail size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                In-App Email Sandbox
                <span className="badge badge-confirmed" style={{ fontSize: '0.7rem' }}>Live Test Inbox</span>
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                Inspect real-time ticket deliveries, QR tickets, and time-limited waitlist magic links
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={fetchEmails}
              disabled={loading}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin-fast' : ''} />
              Refresh
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
                borderRadius: '8px',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              aria-label="Close Email Sandbox modal"
              title="Close (Esc)"
            >
              <X size={18} />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Content Body: Left List + Right Preview */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Email List */}
          <div style={{
            width: '38%',
            borderRight: '1px solid var(--border-subtle)',
            overflowY: 'auto',
            background: '#090d17',
          }}>
            {emails.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                <Mail size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
                <p>No emails logged yet.</p>
                <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Book a ticket or cancel a booking to generate emails!</p>
              </div>
            ) : (
              emails.map((em) => {
                const isSelected = selectedEmail?.id === em.id;
                const isTicket = em.template === 'TICKET_CONFIRMATION';
                return (
                  <div
                    key={em.id}
                    onClick={() => setSelectedEmail(em)}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      cursor: 'pointer',
                      borderLeft: isSelected ? '3px solid #818cf8' : '3px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className={`badge ${isTicket ? 'badge-confirmed' : 'badge-premium'}`} style={{ fontSize: '0.65rem' }}>
                        {isTicket ? 'Ticket' : 'Waitlist Offer'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {new Date(em.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#f1f5f9', marginBottom: 2 }}>
                      {em.subject}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      To: {em.toEmail}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Email Preview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#0e1424' }}>
            {selectedEmail ? (
              <div>
                <div style={{
                  background: '#161f33',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  border: '1px solid var(--border-subtle)',
                }}>
                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#64748b', width: 80, padding: '4px 0' }}>Subject:</td>
                        <td style={{ color: '#ffffff', fontWeight: 600 }}>{selectedEmail.subject}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#64748b', padding: '4px 0' }}>Recipient:</td>
                        <td style={{ color: '#38bdf8' }}>{selectedEmail.toEmail}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#64748b', padding: '4px 0' }}>Delivered:</td>
                        <td style={{ color: '#94a3b8' }}>{new Date(selectedEmail.sentAt).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* If Waitlist Offer: Show Quick Magic Claim Link Action */}
                {selectedEmail.template === 'WAITLIST_OFFER' && resolvedClaimUrl && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.95rem' }}>
                        ⚡ Magic Waitlist Claim Link
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: 2 }}>
                        Expires at: {selectedEmail.data?.expiresAtFormatted || '5 minutes'}
                      </div>
                    </div>
                    <a
                      href={resolvedClaimUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                      style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' }}
                    >
                      <ExternalLink size={14} />
                      Open Claim Page
                    </a>
                  </div>
                )}

                {/* Rendered Email Visual Preview */}
                <div style={{
                  background: '#0b0f19',
                  borderRadius: 16,
                  padding: 24,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}>
                  {selectedEmail.template === 'TICKET_CONFIRMATION' ? (
                    <div>
                      <div style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        borderRadius: 12,
                        padding: 20,
                        textAlign: 'center',
                        color: '#ffffff',
                        marginBottom: 20,
                      }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>🎟️ CINECONCERT TICKET</h3>
                        <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>
                          Booking Reference: <strong>{selectedEmail.data?.bookingReference}</strong>
                        </p>
                      </div>

                      <div style={{ background: '#131a2b', padding: 18, borderRadius: 10, marginBottom: 20 }}>
                        <h4 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: 6 }}>
                          {selectedEmail.data?.eventTitle}
                        </h4>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 12 }}>
                          📅 {selectedEmail.data?.dateTime} | 📍 {selectedEmail.data?.venueName} ({selectedEmail.data?.venueLocation})
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                          <span style={{ color: '#94a3b8' }}>Seats:</span>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{selectedEmail.data?.seats}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                          <span style={{ color: '#94a3b8' }}>Total Paid:</span>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>${selectedEmail.data?.totalAmount?.toFixed(2)}</span>
                        </div>
                      </div>

                      {selectedEmail.data?.qrCode && (
                        <div style={{ textAlign: 'center', background: '#ffffff', borderRadius: 12, padding: 16 }}>
                          <img
                            src={selectedEmail.data.qrCode}
                            alt="Ticket QR"
                            style={{ width: 180, height: 180, display: 'block', margin: '0 auto' }}
                          />
                          <p style={{ color: '#0f172a', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', marginTop: 8 }}>
                            {selectedEmail.data.bookingReference}
                          </p>
                          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                            Scan with Gate Scanner for admission
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{
                        background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                        borderRadius: 12,
                        padding: 20,
                        textAlign: 'center',
                        color: '#ffffff',
                        marginBottom: 20,
                      }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>✨ WAITLIST SEATS AVAILABLE!</h3>
                        <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>
                          Exclusive 5-Minute Reservation Offer
                        </p>
                      </div>

                      <div style={{ background: '#131a2b', padding: 18, borderRadius: 10, marginBottom: 20 }}>
                        <h4 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: 6 }}>
                          {selectedEmail.data?.eventTitle}
                        </h4>
                        <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '1.05rem', margin: '10px 0' }}>
                          Offered Seats: {selectedEmail.data?.seats}
                        </div>
                        <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
                          ⚠️ Please claim before <strong>{selectedEmail.data?.expiresAtFormatted}</strong> or this offer will automatically cascade to the next person in line.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                Select an email from the left pane to preview details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
