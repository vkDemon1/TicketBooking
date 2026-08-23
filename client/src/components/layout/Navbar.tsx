import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from '../common/AuthModal';
import { EmailSandboxModal } from '../sandbox/EmailSandboxModal';
import { QRScannerModal } from '../sandbox/QRScannerModal';
import {
  Film,
  Music,
  Ticket,
  Shield,
  Sparkles,
  Mail,
  QrCode,
  LogOut,
  User as UserIcon,
  Compass,
  Menu,
  X,
} from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const { user, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: 'rgba(7, 9, 14, 0.90)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 24px',
      }}>
        <div style={{
          maxWidth: 1300,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          {/* Logo */}
          <div
            onClick={() => handleNavClick('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.45)',
            }}>
              <Ticket size={20} color="#ffffff" />
            </div>
            <div>
              <span style={{ fontSize: '1.28rem', fontWeight: 800, letterSpacing: '-0.5px' }} className="gradient-text">
                CineConcert
              </span>
              <span style={{ fontSize: '0.64rem', display: 'block', color: '#94a3b8', marginTop: -3, fontWeight: 700, letterSpacing: '0.5px' }}>
                MOVIES & CONCERTS
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => handleNavClick('/')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: currentPath === '/' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: currentPath === '/' ? '#818cf8' : '#94a3b8',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.88rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Compass size={16} />
              Explore Events
            </button>

            {user && (
              <button
                onClick={() => handleNavClick('/my-bookings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: currentPath === '/my-bookings' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  color: currentPath === '/my-bookings' ? '#818cf8' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Ticket size={16} />
                My Bookings & Waitlist
              </button>
            )}

            {user && (user.role === 'ORGANIZER' || user.role === 'ADMIN') && (
              <button
                onClick={() => handleNavClick('/organizer')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: currentPath === '/organizer' ? 'rgba(236, 72, 153, 0.15)' : 'transparent',
                  color: currentPath === '/organizer' ? '#f472b6' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Sparkles size={16} />
                Organizer Dashboard
              </button>
            )}

            {user && user.role === 'ADMIN' && (
              <button
                onClick={() => handleNavClick('/admin')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: currentPath === '/admin' ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                  color: currentPath === '/admin' ? '#fbbf24' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Shield size={16} />
                Admin Venues
              </button>
            )}
          </div>

          {/* Action Tools & User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Email Sandbox Button */}
            <button
              type="button"
              onClick={() => setIsEmailOpen(true)}
              className="btn btn-secondary btn-sm"
              title="Open In-App Email Sandbox to inspect sent tickets & magic claim links"
              style={{ padding: '6px 12px' }}
            >
              <Mail size={15} color="#38bdf8" />
              <span className="hide-on-mobile">Mail Sandbox</span>
            </button>

            {/* QR Scanner Button */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="btn btn-secondary btn-sm"
              title="Open QR Ticket Scanner to verify admission"
              style={{ padding: '6px 12px' }}
            >
              <QrCode size={15} color="#10b981" />
              <span className="hide-on-mobile">QR Scanner</span>
            </button>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#161f33',
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: '1px solid var(--border-subtle)',
                }}>
                  <UserIcon size={14} color="#818cf8" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff' }}>
                    {user.name}
                  </span>
                  <span className={`badge ${
                    user.role === 'ADMIN' ? 'badge-vip' : user.role === 'ORGANIZER' ? 'badge-concert' : 'badge-standard'
                  }`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                    {user.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="btn btn-secondary btn-sm"
                  title="Log out"
                  style={{ padding: '6px 10px' }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="btn btn-primary btn-sm"
              >
                Sign In
              </button>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="btn btn-secondary btn-sm mobile-menu-toggle"
              style={{ padding: '6px 10px', display: 'none' }}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {isMobileMenuOpen && (
          <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <button
              type="button"
              onClick={() => handleNavClick('/')}
              className={`btn ${currentPath === '/' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              style={{ justifyContent: 'flex-start' }}
            >
              <Compass size={16} />
              Explore Events
            </button>

            {user && (
              <button
                type="button"
                onClick={() => handleNavClick('/my-bookings')}
                className={`btn ${currentPath === '/my-bookings' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ justifyContent: 'flex-start' }}
              >
                <Ticket size={16} />
                My Bookings & Waitlist
              </button>
            )}

            {user && (user.role === 'ORGANIZER' || user.role === 'ADMIN') && (
              <button
                type="button"
                onClick={() => handleNavClick('/organizer')}
                className={`btn ${currentPath === '/organizer' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ justifyContent: 'flex-start' }}
              >
                <Sparkles size={16} />
                Organizer Dashboard
              </button>
            )}

            {user && user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => handleNavClick('/admin')}
                className={`btn ${currentPath === '/admin' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                style={{ justifyContent: 'flex-start' }}
              >
                <Shield size={16} />
                Admin Venues
              </button>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <button
                type="button"
                onClick={() => {
                  setIsEmailOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Mail size={15} color="#38bdf8" />
                Mail Sandbox
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsScannerOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <QrCode size={15} color="#10b981" />
                QR Scanner
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Interactive Modals */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <EmailSandboxModal isOpen={isEmailOpen} onClose={() => setIsEmailOpen(false)} />
      <QRScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} />
    </>
  );
};
