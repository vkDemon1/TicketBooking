import crypto from 'crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

export class QrService {
  /**
   * Generate HMAC-SHA256 signature for a booking reference using dedicated QR_SECRET
   */
  static generateSignature(bookingReference: string): string {
    return crypto
      .createHmac('sha256', env.QR_SECRET)
      .update(bookingReference)
      .digest('hex');
  }

  /**
   * Secure timing-safe verification of HMAC signature
   */
  static verifySignature(bookingReference: string, submittedSignature: string): boolean {
    if (!bookingReference || !submittedSignature) return false;
    try {
      const expectedSignature = this.generateSignature(bookingReference);
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const submittedBuffer = Buffer.from(submittedSignature, 'utf8');

      if (expectedBuffer.length !== submittedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, submittedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Generate QR Code as high-res PNG Data URL (does NOT expose raw PII)
   */
  static async generateDataUrl(payload: { bookingReference: string; signature: string }): Promise<string> {
    return QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  }

  /**
   * Generate QR Code as SVG string
   */
  static async generateSvg(payload: { bookingReference: string; signature: string }): Promise<string> {
    return QRCode.toString(JSON.stringify(payload), {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  }
}
