import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { db } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { QrService } from './qr.service.js';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isInitialized = false;

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter && this.isInitialized) {
      return this.transporter;
    }

    try {
      if (env.SMTP.USER && env.SMTP.PASS) {
        this.transporter = nodemailer.createTransport({
          host: env.SMTP.HOST,
          port: env.SMTP.PORT,
          secure: env.SMTP.PORT === 465,
          auth: {
            user: env.SMTP.USER,
            pass: env.SMTP.PASS,
          },
        });
      } else {
        // Create an Ethereal test account automatically for local development/demo
        const testAccount = await nodemailer.createTestAccount();
        logger.info('Created Ethereal SMTP test account:', testAccount.user);
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }
      this.isInitialized = true;
      return this.transporter;
    } catch (err) {
      logger.warn('Failed to initialize SMTP transporter, emails will be logged locally:', err);
      // Fallback dummy transporter
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      this.isInitialized = true;
      return this.transporter;
    }
  }

  /**
   * Log email to database
   */
  private logEmail(toEmail: string, subject: string, template: string, data: any, status: 'SENT' | 'FAILED', error?: string): void {
    try {
      db.prepare(`
        INSERT INTO email_logs (id, to_email, subject, template, data_json, status, error_message, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(uuidv4(), toEmail, subject, template, JSON.stringify(data), status, error || null);
    } catch (err) {
      logger.error('Failed to log email to database:', err);
    }
  }

  /**
   * Send Booking Confirmation Ticket Email
   */
  public async sendBookingConfirmation(bookingId: string): Promise<void> {
    try {
      // Query booking details with event, venue, user, and seats
      const booking = db.prepare(`
        SELECT 
          b.id, b.booking_reference, b.total_amount, b.qr_payload, b.qr_signature, b.created_at,
          u.email as user_email, u.name as user_name,
          e.id as event_id, e.title as event_title, e.category as event_category, e.date_time, e.banner_url,
          v.name as venue_name, v.address as venue_address, v.city as venue_city
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN events e ON b.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE b.id = ?
      `).get(bookingId) as any;

      if (!booking) {
        logger.error(`Cannot send ticket email: booking ${bookingId} not found.`);
        return;
      }

      const seats = db.prepare(`
        SELECT s.row_label, s.seat_number, s.category, bs.price_paid
        FROM booking_seats bs
        JOIN seats s ON bs.seat_id = s.id
        WHERE bs.booking_id = ?
        ORDER BY s.row_label ASC, s.seat_number ASC
      `).all(bookingId) as any[];

      const seatLabels = seats.map(s => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');

      // Generate QR Code Data URL
      const qrDataUrl = await QrService.generateDataUrl({
        bookingReference: booking.booking_reference,
        signature: booking.qr_signature,
      });

      const formattedDate = new Date(booking.date_time).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const emailData = {
        bookingId,
        bookingReference: booking.booking_reference,
        eventTitle: booking.event_title,
        venueName: booking.venue_name,
        venueLocation: `${booking.venue_address}, ${booking.venue_city}`,
        dateTime: formattedDate,
        seats: seatLabels,
        totalAmount: booking.total_amount,
        qrCode: qrDataUrl,
      };

      const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #131b2e; border: 1px solid #2a3756; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 1px;">CINECONCERT TICKET</h1>
              <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 14px;">Booking Confirmed #${booking.booking_reference}</p>
            </div>
            <div style="padding: 30px;">
              <h2 style="margin: 0 0 10px 0; color: #ffffff; font-size: 22px;">${booking.event_title}</h2>
              <p style="margin: 0 0 20px 0; color: #94a3b8; font-size: 14px;">📅 ${formattedDate}</p>
              
              <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Venue:</td>
                    <td style="padding: 8px 0; color: #f8fafc; font-weight: 600; text-align: right;">${booking.venue_name}, ${booking.venue_city}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Seats:</td>
                    <td style="padding: 8px 0; color: #38bdf8; font-weight: 700; text-align: right;">${seatLabels}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Total Paid:</td>
                    <td style="padding: 8px 0; color: #10b981; font-weight: 700; text-align: right; font-size: 16px;">$${booking.total_amount.toFixed(2)}</td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; background: #ffffff; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <img src="${qrDataUrl}" alt="Ticket QR Code" style="width: 200px; height: 200px; display: block; margin: 0 auto;" />
                <p style="margin: 10px 0 0 0; color: #334155; font-size: 12px; font-weight: 600; font-family: monospace;">${booking.booking_reference}</p>
                <p style="margin: 4px 0 0 0; color: #64748b; font-size: 11px;">Present this QR code at the venue gate for instant admission.</p>
              </div>

              <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 25px;">
                Need to cancel? You can manage your bookings anytime in your CineConcert customer dashboard.
              </p>
            </div>
          </div>
        </div>
      `;

      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: `CineConcert Tickets <${env.SMTP.FROM}>`,
        to: booking.user_email,
        subject: `Your Tickets for ${booking.event_title} [${booking.booking_reference}]`,
        html: htmlContent,
      });

      logger.info(`Ticket email sent to ${booking.user_email}:`, info.messageId || 'mocked');
      this.logEmail(booking.user_email, `Your Tickets for ${booking.event_title}`, 'TICKET_CONFIRMATION', emailData, 'SENT');
    } catch (err: any) {
      logger.error('Failed to send booking confirmation email:', err);
      this.logEmail('unknown', 'Ticket Confirmation Failed', 'TICKET_CONFIRMATION', { bookingId }, 'FAILED', err.message);
    }
  }

  /**
   * Send Waitlist Time-Limited Offer Email with Magic Claim Link
   */
  public async sendWaitlistOffer(offerId: string): Promise<void> {
    try {
      const offer = db.prepare(`
        SELECT 
          o.id, o.claim_token, o.expires_at, o.seat_ids_json,
          u.email as user_email, u.name as user_name,
          e.id as event_id, e.title as event_title, e.date_time,
          v.name as venue_name
        FROM waitlist_offers o
        JOIN users u ON o.user_id = u.id
        JOIN events e ON o.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE o.id = ?
      `).get(offerId) as any;

      if (!offer) {
        logger.error(`Cannot send waitlist offer email: offer ${offerId} not found.`);
        return;
      }

      const seatIds: string[] = JSON.parse(offer.seat_ids_json);
      const placeholders = seatIds.map(() => '?').join(',');
      const seats = db.prepare(`
        SELECT row_label, seat_number, category FROM seats WHERE id IN (${placeholders})
      `).all(...seatIds) as any[];

      const seatLabels = seats.map(s => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
      const claimUrl = `${env.CLIENT_URL}/events/${offer.event_id}/claim?token=${offer.claim_token}`;
      const expiresAtFormatted = new Date(offer.expires_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const emailData = {
        offerId,
        claimToken: offer.claim_token,
        claimUrl,
        eventTitle: offer.event_title,
        seats: seatLabels,
        expiresAt: offer.expires_at,
        expiresAtFormatted,
      };

      const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #131b2e; border: 1px solid #3b82f6; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
            <div style="background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 1px;">SEATS ARE NOW AVAILABLE!</h1>
              <p style="margin: 6px 0 0 0; color: #e0f2fe; font-size: 14px;">Exclusive Waitlist Allocation Offer</p>
            </div>
            <div style="padding: 30px;">
              <p style="font-size: 16px; color: #e2e8f0; margin-top: 0;">Hi <strong>${offer.user_name}</strong>,</p>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                Great news! Seats have opened up for <strong>${offer.event_title}</strong> and have been temporarily reserved for you from the waitlist.
              </p>
              
              <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 13px;">Allocated Seats:</p>
                <p style="margin: 0 0 15px 0; color: #38bdf8; font-size: 18px; font-weight: 700;">${seatLabels}</p>
                
                <p style="margin: 0 0 8px 0; color: #ef4444; font-size: 13px; font-weight: 600;">⚠️ Time Limit Notice:</p>
                <p style="margin: 0; color: #fca5a5; font-size: 14px;">
                  This offer expires at <strong>${expiresAtFormatted}</strong> (5-minute window). If not claimed before expiry, these seats will be automatically offered to the next person in line.
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${claimUrl}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 10px 20px rgba(16,185,129,0.3);">
                  Claim & Confirm Tickets Now →
                </a>
              </div>

              <p style="color: #64748b; font-size: 12px; text-align: center;">
                Direct link: <a href="${claimUrl}" style="color: #38bdf8;">${claimUrl}</a>
              </p>
            </div>
          </div>
        </div>
      `;

      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: `CineConcert Waitlist <${env.SMTP.FROM}>`,
        to: offer.user_email,
        subject: `ACTION REQUIRED: Seats Available for ${offer.event_title}!`,
        html: htmlContent,
      });

      logger.info(`Waitlist offer email sent to ${offer.user_email}:`, info.messageId || 'mocked');
      this.logEmail(offer.user_email, `ACTION REQUIRED: Seats Available for ${offer.event_title}`, 'WAITLIST_OFFER', emailData, 'SENT');
    } catch (err: any) {
      logger.error('Failed to send waitlist offer email:', err);
      this.logEmail('unknown', 'Waitlist Offer Failed', 'WAITLIST_OFFER', { offerId }, 'FAILED', err.message);
    }
  }
}

export const emailService = new EmailService();
