import React from 'react';
import { Lock, Check, X, Users } from 'lucide-react';
import { EventSeatPricing } from '../../types';

interface SeatLegendProps {
  pricing?: EventSeatPricing[];
}

export const SeatLegend: React.FC<SeatLegendProps> = ({ pricing = [] }) => {
  const pricingMap = new Map(pricing.map(p => [p.seat_category, p.price]));

  const categoryTiers = [
    { cat: 'VIP', label: 'VIP Tier', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)', border: '#fbbf24' },
    { cat: 'PREMIUM', label: 'Premium Tier', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.2)', border: '#a855f7' },
    { cat: 'STANDARD', label: 'Standard Tier', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)', border: '#38bdf8' },
    { cat: 'BALCONY', label: 'Balcony Tier', color: '#34d399', bg: 'rgba(52, 211, 153, 0.2)', border: '#34d399' },
  ];

  const statusStates = [
    { status: 'AVAILABLE', label: 'Available (Click to Pick)', icon: null, color: '#10b981', border: '#10b981' },
    { status: 'SELECTED', label: 'Selected by You', icon: <Check size={12} color="#ffffff" />, color: '#6366f1', border: '#818cf8', bg: '#6366f1' },
    { status: 'HELD', label: 'Held (Checkout in Progress)', icon: <Lock size={10} color="#fbbf24" />, color: '#f59e0b', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
    { status: 'BOOKED', label: 'Booked / Sold Out', icon: <X size={10} color="#f87171" />, color: '#ef4444', border: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
    { status: 'WAITLIST_HELD', label: 'Waitlist Reserved', icon: <Users size={10} color="#38bdf8" />, color: '#06b6d4', border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' },
  ];

  return (
    <div style={{
      background: '#0a0e19',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14,
      padding: '16px 20px',
      margin: '20px 0',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
      }}>
        {/* Tier Pricing Legend */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
            Pricing Tiers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {categoryTiers.map((tier) => {
              const price = pricingMap.get(tier.cat as any);
              return (
                <div key={tier.cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: tier.bg,
                    border: `1.5px solid ${tier.border}`,
                  }} />
                  <span style={{ color: '#e2e8f0' }}>{tier.label}</span>
                  {price !== undefined && (
                    <strong style={{ color: tier.color }}>(${price})</strong>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Seat Status Legend */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
            Seat Statuses
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {statusStates.map((st) => (
              <div key={st.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: st.bg || 'rgba(255, 255, 255, 0.05)',
                  border: `1.5px solid ${st.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {st.icon}
                </div>
                <span style={{ color: '#cbd5e1' }}>{st.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
