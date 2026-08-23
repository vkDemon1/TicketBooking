import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_ticket_platform_2026',
  QR_SECRET: process.env.QR_SECRET || 'super_secret_qr_hmac_key_ticket_platform_2026',
  ENABLE_DEMO_LOGIN: process.env.ENABLE_DEMO_LOGIN !== 'false',
  HOLD_TTL_SECONDS: parseInt(process.env.HOLD_TTL_SECONDS || '600', 10),
  WAITLIST_OFFER_TTL_SECONDS: parseInt(process.env.WAITLIST_OFFER_TTL_SECONDS || '300', 10),
  SMTP: {
    HOST: process.env.SMTP_HOST || 'smtp.ethereal.email',
    PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.SMTP_FROM || 'tickets@cineconcert.io',
  },
  DB_PATH: process.env.DB_PATH || path.resolve(__dirname, '../../data/ticket_booking.db'),
};
