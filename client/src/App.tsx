import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { DemoSwitcher } from './components/layout/DemoSwitcher';

import { HomePage } from './pages/HomePage';
import { EventDetailsPage } from './pages/EventDetailsPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ClaimOfferPage } from './pages/ClaimOfferPage';
import { AdminVenuesPage } from './pages/AdminVenuesPage';
import { OrganizerDashboardPage } from './pages/OrganizerDashboardPage';

const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);

  // Sync with browser navigation & URL params
  const parseCurrentUrl = () => {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (path.startsWith('/events/') && path.includes('/claim') && token) {
      const parts = path.split('/');
      const evtId = parts[2];
      setSelectedEventId(evtId);
      setClaimToken(token);
      setCurrentPath('/claim');
    } else if (path.startsWith('/events/') && !path.includes('/claim')) {
      const parts = path.split('/');
      setSelectedEventId(parts[2]);
      setCurrentPath('/event-details');
    } else if (path === '/my-bookings' || path === '/organizer' || path === '/admin') {
      setCurrentPath(path);
    } else {
      // Normalizes /qr-scanner, /scanner, /sandbox, /404, etc. to home view
      setCurrentPath('/');
    }
  };

  useEffect(() => {
    parseCurrentUrl();

    const handlePopState = () => parseCurrentUrl();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string, eventId?: string, token?: string) => {
    if (path === '/') {
      window.history.pushState({}, '', '/');
      setSelectedEventId(null);
      setClaimToken(null);
      setCurrentPath('/');
    } else if (path === '/event-details' && eventId) {
      window.history.pushState({}, '', `/events/${eventId}`);
      setSelectedEventId(eventId);
      setCurrentPath('/event-details');
    } else if (path === '/claim' && eventId && token) {
      window.history.pushState({}, '', `/events/${eventId}/claim?token=${token}`);
      setSelectedEventId(eventId);
      setClaimToken(token);
      setCurrentPath('/claim');
    } else {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
    window.scrollTo(0, 0);
  };

  const isKnownRoute =
    (currentPath === '/event-details' && selectedEventId) ||
    (currentPath === '/claim' && selectedEventId && claimToken) ||
    currentPath === '/my-bookings' ||
    currentPath === '/organizer' ||
    currentPath === '/admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Demo Persona Switcher Banner */}
      <DemoSwitcher />

      {/* Main Navbar */}
      <Navbar currentPath={currentPath} onNavigate={(p) => navigateTo(p)} />

      {/* Main Page View */}
      <main style={{ flex: 1 }}>
        {currentPath === '/event-details' && selectedEventId && (
          <EventDetailsPage
            eventId={selectedEventId}
            onBack={() => navigateTo('/')}
            onViewBooking={() => navigateTo('/my-bookings')}
          />
        )}

        {currentPath === '/claim' && selectedEventId && claimToken && (
          <ClaimOfferPage
            eventId={selectedEventId}
            token={claimToken}
            onBack={() => navigateTo('/')}
            onViewBooking={() => navigateTo('/my-bookings')}
          />
        )}

        {currentPath === '/my-bookings' && (
          <MyBookingsPage
            onNavigateClaim={(evtId, tok) => navigateTo('/claim', evtId, tok)}
            onNavigateHome={() => navigateTo('/')}
          />
        )}

        {currentPath === '/organizer' && (
          <OrganizerDashboardPage />
        )}

        {currentPath === '/admin' && (
          <AdminVenuesPage />
        )}

        {!isKnownRoute && (
          <HomePage onSelectEvent={(id) => navigateTo('/event-details', id)} />
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
