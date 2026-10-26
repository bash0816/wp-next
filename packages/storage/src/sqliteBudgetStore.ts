// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { BudgetStore } from './budget.js';

/**
 * usage_counter 行への原子的予約。テーブルは作成しない (スキーマは packages/db/src/schema.sql が正本)。
 * 予約は「行の作成 (INSERT OR IGNORE)」と「条件付き加算 (単一 UPDATE)」の2文で行い、
 * read-modify-write は行わない。成功判定は UPDATE の changes のみ。
 */
export class SqliteBudgetStore implements BudgetStore {
  private readonly insertStmt;
  private readonly updateStmt;
  private readonly selectStmt;

  constructor(db: DatabaseSync) {
    this.insertStmt = db.prepare(
      'INSERT OR IGNORE INTO usage_counter (key, period, used, limit_value) VALUES (?, ?, 0, ?)',
    );
    this.updateStmt = db.prepare(
      'UPDATE usage_counter SET used = used + ? WHERE key = ? AND used + ? <= ?',
    );
    this.selectStmt = db.prepare('SELECT used FROM usage_counter WHERE key = ?');
  }

  async reserve(key: string, amount: number, limit: number): Promise<boolean> {
    assertPositiveInteger(amount, 'amount');
    assertPositiveInteger(limit, 'limit');
    const period = periodOf(key);
    this.insertStmt.run(key, period, limit);
    const result = this.updateStmt.run(amount, key, amount, limit);
    return Number(result.changes) > 0;
  }

  async used(key: string): Promise<number> {
    const row = this.selectStmt.get(key) as { used: number } | undefined;
    return row === undefined ? 0 : Number(row.used);
  }
}

/** キーの末尾 `:` 以降を period として導出する。`:` が無い / 末尾が空ならエラー。 */
function periodOf(key: string): string {
  const i = key.lastIndexOf(':');
  if (i <= 0 || i === key.length - 1) {
    throw new Error(`budget key must end with ':<period>': ${key}`);
  }
  return key.slice(i + 1);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer: ${String(value)}`);
  }
}
