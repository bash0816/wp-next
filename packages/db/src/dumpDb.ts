// SPDX-License-Identifier: GPL-3.0-only
// テスト用: fixtures/ref/db/dump.sql(wp_ 接頭辞)を、本パッケージの schema.sql(接頭辞なし・最小列)へ流し込む。
// 列は両方に存在するものだけを移す。公開状態の列名は動的に扱い、このファイルには書かない(lint の直接参照禁止規則)。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const DUMP_PATH = join(here, '../../../fixtures/ref/db/dump.sql');

const TABLES = [
  'posts',
  'postmeta',
  'terms',
  'term_taxonomy',
  'term_relationships',
  'termmeta',
  'users',
  'usermeta',
  'comments',
  'commentmeta',
  'options',
] as const;

type Row = Record<string, string | number | null>;

const columnsOf = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

/** 基準 dump の内容を持つ in-memory DB を返す(S0 状態)。 */
export function openDumpDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const src = new DatabaseSync(':memory:');
  src.exec(readFileSync(DUMP_PATH, 'utf8'));
  for (const table of TABLES) {
    const srcCols = new Set(columnsOf(src, `wp_${table}`));
    const cols = columnsOf(db, table).filter((c) => srcCols.has(c));
    if (cols.length === 0) continue;
    const list = cols.map((c) => `"${c}"`).join(', ');
    const rows = src.prepare(`SELECT ${list} FROM wp_${table}`).all() as Row[];
    const ins = db.prepare(`INSERT INTO ${table} (${list}) VALUES (${cols.map(() => '?').join(', ')})`);
    for (const r of rows) ins.run(...cols.map((c) => r[c] ?? null));
  }
  return db;
}

/** 任意の行を挿入する(列名は呼び出し側が決める)。挿入した行の rowid を返す。 */
export function insertRow(db: DatabaseSync, table: string, row: Row): number {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return Number(db.prepare(sql).run(...cols.map((c) => row[c] ?? null)).lastInsertRowid);
}

/** 行を更新する(キー列で特定)。 */
export function updateRow(db: DatabaseSync, table: string, keyCol: string, keyVal: string | number, set: Row): void {
  const cols = Object.keys(set);
  const sql = `UPDATE ${table} SET ${cols.map((c) => `"${c}" = ?`).join(', ')} WHERE "${keyCol}" = ?`;
  db.prepare(sql).run(...cols.map((c) => set[c] ?? null), keyVal);
}
