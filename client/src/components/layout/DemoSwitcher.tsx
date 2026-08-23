import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, Sparkles, User as UserIcon, Clock } from 'lucide-react';

export const DemoSwitcher: React.FC = () => {
  const { user, demoLogin } = useAuth();

  const personas = [
    {
      role: 'ADMIN' as const,
      email: 'admin@cineconcert.io',
      label: 'Admin',
      sub: 'Venues & Layouts',
      icon: Shield,
      color: '#f59e0b',
    },
    {
      role: 'ORGANIZER' as const,
      email: 'organizer@cineconcert.io',
      label: 'Organizer',
      sub: 'Shows & Revenue',
      icon: Sparkles,
      color: '#ec4899',
    },
    {
      role: 'CUSTOMER' as const,
      email: 'alice@cineconcert.io',
      label: 'Alice',
      sub: 'Has Booked VIP',
      icon: UserIcon,
      color: '#10b981',
    },
    {
      role: 'CUSTOMER' as const,
      email: 'bob@cineconcert.io',
      label: 'Bob',
      sub: 'Waitlist #1 (2 seats)',
      icon: Clock,
      color: '#38bdf8',
    },
    {
      role: 'CUSTOMER' as const,
      email: 'charlie@cineconcert.io',
      label: 'Charlie',
      sub: 'Waitlist #2 (1 seat)',
      icon: Clock,
      color: '#a855f7',
    },
  ];

  return (
    <div style={{
      background: 'linear-gradient(90deg, #0b0f19 0%, #172033 50%, #0b0f19 100%)',
      borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
      padding: '8px 16px',
      fontSize: '0.82rem',
    }}>
      <div style={{
        maxWidth: 1300,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
          }} />
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Evaluator Demo Switcher:</span>
          <span style={{ color: '#64748b' }}>Switch personas instantly to test RBAC, holds & waitlist cascade:</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {personas.map((p) => {
            const isActive = user?.email === p.email;
            const Icon = p.icon;
            return (
              <button
                key={p.email}
                onClick={() => demoLogin(p.role, p.email)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: isActive ? `1.5px solid ${p.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isActive ? `${p.color}22` : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.78rem',
                  transition: 'all 0.15s ease',
                }}
                title={`Switch to ${p.label} (${p.sub})`}
              >
                <Icon size={13} color={p.color} />
                <span>{p.label}</span>
                <span style={{ color: '#64748b', fontSize: '0.72rem' }}>({p.sub})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
