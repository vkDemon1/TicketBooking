import { DatabaseSync, StatementSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database instance
const rawDb = new DatabaseSync(env.DB_PATH);

// Enable WAL mode, Foreign Keys, and Normal Synchronous
rawDb.exec('PRAGMA foreign_keys = ON;');
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA synchronous = NORMAL;');

export interface TransactionFunction<T, Args extends any[]> {
  (...args: Args): T;
  immediate: (...args: Args) => T;
}

export interface StatementWrapper {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface DatabaseWrapper {
  exec(sql: string): void;
  prepare(sql: string): StatementWrapper;
  pragma(pragmaSql: string): any;
  transaction<T, Args extends any[]>(fn: (...args: Args) => T): TransactionFunction<T, Args>;
}

export const db: DatabaseWrapper = {
  exec(sql: string): void {
    rawDb.exec(sql);
  },
  prepare(sql: string): StatementWrapper {
    const stmt = rawDb.prepare(sql);
    return {
      get(...params: any[]): any {
        return stmt.get(...params);
      },
      all(...params: any[]): any[] {
        return stmt.all(...params);
      },
      run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
        return stmt.run(...params);
      },
    };
  },
  pragma(pragmaSql: string): any {
    return rawDb.exec(`PRAGMA ${pragmaSql};`);
  },
  transaction<T, Args extends any[]>(fn: (...args: Args) => T): TransactionFunction<T, Args> {
    const immediateRunner = (...args: Args): T => {
      rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT;');
        return result;
      } catch (error) {
        try {
          rawDb.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error if already rolled back
        }
        throw error;
      }
    };

    const defaultRunner = (...args: Args): T => {
      rawDb.exec('BEGIN;');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT;');
        return result;
      } catch (error) {
        try {
          rawDb.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error
        }
        throw error;
      }
    };

    const callable: any = defaultRunner;
    callable.immediate = immediateRunner;
    return callable as TransactionFunction<T, Args>;
  },
};

/**
 * Initialize database schema and indexes from schema.sql
 */
export function initDatabase(): void {
  const schemaPath = path.resolve(__dirname, '../db/schema.sql');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Database schema not found at: ${schemaPath}`);
  }

  // Safe progressive schema migrations in case table was created previously without new columns
  try {
    db.exec('ALTER TABLE bookings ADD COLUMN is_redeemed INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Table may not exist yet or column already exists
  }
  try {
    db.exec('ALTER TABLE bookings ADD COLUMN redeemed_at DATETIME;');
  } catch {
    // Table may not exist yet or column already exists
  }
  try {
    db.exec('ALTER TABLE bookings ADD COLUMN redeemed_by TEXT;');
  } catch {
    // Table may not exist yet or column already exists
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

/**
 * Explicit helper to run synchronous operations inside BEGIN IMMEDIATE transaction
 */
export function runImmediateTransaction<T, Args extends any[]>(
  fn: (...args: Args) => T
): (...args: Args) => T {
  const txn = db.transaction(fn);
  return (...args: Args) => txn.immediate(...args);
}
