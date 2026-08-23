import { db, initDatabase } from '../config/db.js';
import { seed } from './seed.js';
import { logger } from '../utils/logger.js';

/**
 * Checks whether the database contains required demo data (users and events).
 * If the database is empty, it runs the initial demo seed once.
 * If data already exists, it preserves existing data without deletion or modification.
 */
export async function ensureDemoData(): Promise<boolean> {
  // Ensure schema exists first
  initDatabase();

  try {
    const userRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number | bigint } | undefined;
    const eventRow = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number | bigint } | undefined;

    const userCount = Number(userRow?.count || 0);
    const eventCount = Number(eventRow?.count || 0);

    if (userCount === 0 || eventCount === 0) {
      logger.info('🌱 Database is empty. Seeding demo data...');
      await seed();
      return true;
    }

    logger.info('✓ Database already contains data. Skipping demo seed.');
    return false;
  } catch (error) {
    logger.warn('Error checking database status; running initial seed:', error);
    await seed();
    return true;
  }
}
