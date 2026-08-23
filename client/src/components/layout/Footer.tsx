import React from 'react';
import { useSocket } from '../../context/SocketContext';
import { Database, ShieldCheck, Clock, Radio, Ticket } from 'lucide-react';

export const Footer: React.FC = () => {
  const { isConnected } = useSocket();

  return (
    <footer style={{
      background: '#06080d',
      borderTop: '1px solid var(--border-subtle)',
      padding: '32px 24px',
      marginTop: 'auto',
      color: '#94a3b8',
      fontSize: '0.85rem',
    }}>
      <div style={{
        maxWidth: 1300,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* System Architecture Badges */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>System Health & State:</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
              <Database size={15} />
              <span>SQLite WAL Mode (Single Source of Truth)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
              <ShieldCheck size={15} />
              <span>Strict BEGIN IMMEDIATE Locks</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24' }}>
              <Clock size={15} />
              <span>Dual TTL (3s Sweeper + Lazy Expiry)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isConnected ? '#34d399' : '#f87171' }}>
              <Radio size={15} />
              <span>Socket.io {isConnected ? 'Live Sync' : 'Reconnecting...'}</span>
            </div>
          </div>
        </div>

        {/* Brand & Rights */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ticket size={18} color="#818cf8" />
            <strong style={{ color: '#ffffff' }}>CineConcert</strong> — Next-Gen Movies & Concerts Ticket Booking Platform
          </div>
          <div>
            Built with strict ACID concurrency, category waitlist cascade, and verifiable QR ticketing.
          </div>
        </div>
      </div>
    </footer>
  );
};
