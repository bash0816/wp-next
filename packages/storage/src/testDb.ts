// SPDX-License-Identifier: GPL-3.0-only
// テスト用: 実スキーマ (packages/db/src/schema.sql) を流し込んだ SQLite DB を作る。
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_PATH = new URL('../../db/src/schema.sql', import.meta.url);

/** スキーマを適用する。同じファイルに対して1回だけ呼ぶこと(CREATE TABLE は IF NOT EXISTS なし)。 */
export function initTestDb(db: DatabaseSync): void {
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
}

export function openTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  initTestDb(db);
  return db;
}
