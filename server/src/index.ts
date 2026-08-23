import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { initDatabase } from './config/db.js';
import { socketService } from './services/socket.service.js';
import { holdSweeperService } from './services/hold-sweeper.service.js';
import { waitlistService } from './services/waitlist.service.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { logger } from './utils/logger.js';

import authRoutes from './routes/auth.routes.js';
import venueRoutes from './routes/venue.routes.js';
import eventRoutes from './routes/event.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import waitlistRoutes from './routes/waitlist.routes.js';
import sandboxRoutes from './routes/sandbox.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON body parsing
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize Database Schema and SQLite Settings
initDatabase();
logger.info('Database schema and SQLite WAL mode initialized.');

// Initialize Socket.io Real-time server
socketService.init(server);
logger.info('Socket.io server initialized.');

// Start background sweepers (every 3 seconds)
holdSweeperService.start(3000);
waitlistService.start(3000);

// API Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Ticket Booking API',
    time: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// Register API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/sandbox', sandboxRoutes);

// Static Client File Serving in Production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  logger.info(`Static frontend served from ${clientDistPath}`);
}

// Centralized Error Handling Middleware
app.use(errorHandler);

// Start HTTP & WebSocket Server
if (process.env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    logger.info(`🚀 CineConcert API server listening on http://localhost:${env.PORT}`);
    logger.info(`⚙️  Hold TTL: ${env.HOLD_TTL_SECONDS}s | Waitlist Offer TTL: ${env.WAITLIST_OFFER_TTL_SECONDS}s`);
  });
}

export { app, server };
