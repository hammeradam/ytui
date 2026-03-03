import fs from 'node:fs';
import path from 'node:path';

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import * as schema from './schema';

export type Db = ReturnType<typeof openDb>;

let _db: Db | undefined;

export function getDataDir(): string {
  const dir = path.join(process.env.HOME ?? '~', '.ytui');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getMigrationsDir(): string {
  // Resolved relative to this file at runtime.
  return path.join(import.meta.dir, 'migrations');
}

export function openDb(): ReturnType<typeof drizzle<typeof schema>> {
  const dbPath = path.join(getDataDir(), 'ytui.db');
  const sqlite = new Database(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Run migrations manually by reading SQL files in order.
  const migrationsDir = getMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Track applied migrations in a simple meta table.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  for (const file of files) {
    const already = sqlite
      .query<{ id: number }, [string]>(
        'SELECT id FROM __drizzle_migrations WHERE name = ?',
      )
      .get(file);
    if (already) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // drizzle-kit splits statements with "--> statement-breakpoint"
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
    sqlite
      .query('INSERT INTO __drizzle_migrations (name, applied_at) VALUES (?, ?)')
      .run(file, new Date().toISOString());
  }

  return drizzle(sqlite, { schema });
}

export function getDb(): Db {
  if (!_db) _db = openDb();
  return _db;
}

export { schema };
