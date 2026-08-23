import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../config/db.js';

const router = Router();

/**
 * In-App Email Sandbox: Returns generated emails for evaluator inspection
 */
router.get('/emails', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const logs = db.prepare(`
      SELECT * FROM email_logs
      ORDER BY sent_at DESC
      LIMIT 50
    `).all() as any[];

    const parsedLogs = logs.map(log => {
      let data = {};
      try {
        data = JSON.parse(log.data_json);
      } catch {
        // Ignored
      }
      return {
        id: log.id,
        toEmail: log.to_email,
        subject: log.subject,
        template: log.template,
        status: log.status,
        errorMessage: log.error_message,
        sentAt: log.sent_at,
        data,
      };
    });

    res.json({ emails: parsedLogs });
  } catch (err) {
    next(err);
  }
});

export default router;
