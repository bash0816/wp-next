// SPDX-License-Identifier: GPL-3.0-only
import type { BudgetStore } from './budget.js';

/**
 * Cloudflare D1Database のサブセット。D1 の型パッケージには依存しない。
 * prepare → bind → run / first の経路のみを使う。
 */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta: { changes: number } }>;
      first<T>(): Promise<T | null>;
    };
  };
}

/**
 * D1 版の原子的予約ストア。usage_counter 行への予約は SqliteBudgetStore と同じ2文:
 * 「行の作成 (INSERT OR IGNORE)」と「条件付き加算 (単一 UPDATE)」。read-modify-write は行わない。
 * 成功判定は UPDATE の meta.changes のみ。
 * amount/limit の検証と periodOf の規則は sqliteBudgetStore.ts と同じ (意図的な重複。共通化は既存ファイル変更を避けるため見送り)。
 */
export class D1BudgetStore implements BudgetStore {
  constructor(private readonly db: D1Like) {}

  async reserve(key: string, amount: number, limit: number): Promise<boolean> {
    assertPositiveInteger(amount, 'amount');
    assertPositiveInteger(limit, 'limit');
    const period = periodOf(key);
    await this.db
      .prepare('INSERT OR IGNORE INTO usage_counter (key, period, used, limit_value) VALUES (?, ?, 0, ?)')
      .bind(key, period, limit)
      .run();
    const result = await this.db
      .prepare('UPDATE usage_counter SET used = used + ? WHERE key = ? AND used + ? <= ?')
      .bind(amount, key, amount, limit)
      .run();
    return Number(result.meta.changes) > 0;
  }

  async used(key: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT used FROM usage_counter WHERE key = ?')
      .bind(key)
      .first<{ used: number }>();
    return row === null ? 0 : Number(row.used);
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
