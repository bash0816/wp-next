// SPDX-License-Identifier: GPL-3.0-only
import type { BudgetGuard, BudgetSpec } from './budget.js';
import { R2_CLASS_A_PER_MONTH, R2_CLASS_B_PER_MONTH, R2_STORAGE_BYTES_PER_MONTH } from './limits.js';

/** R2 へのアクセスを表す最小インターフェース。実バインディングへの接続は含まない。 */
export interface ObjectStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
  list(prefix: string): Promise<string[]>;
}

/** 予算名 (BudgetGuard に渡す budgets のキー)。 */
export const R2_CLASS_A_BUDGET = 'r2.classA';
export const R2_CLASS_B_BUDGET = 'r2.classB';
export const R2_STORAGE_BUDGET = 'r2.storage';

/** R2 用の予算定義。出典値は limits.ts。警告 80% / 停止 95%。 */
export const R2_BUDGET_SPECS: Record<string, BudgetSpec> = {
  [R2_CLASS_A_BUDGET]: { limit: R2_CLASS_A_PER_MONTH, warnRatio: 0.8, stopRatio: 0.95 },
  [R2_CLASS_B_BUDGET]: { limit: R2_CLASS_B_PER_MONTH, warnRatio: 0.8, stopRatio: 0.95 },
  [R2_STORAGE_BUDGET]: { limit: R2_STORAGE_BYTES_PER_MONTH, warnRatio: 0.8, stopRatio: 0.95 },
};

/** UTC の `YYYY-MM`。課金期間の区切りに使う。 */
export function formatPeriod(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

/**
 * 内側 ObjectStore をラップし、各操作の前に予約する。
 * 予約が拒否 / 記録失敗なら内側は呼ばれず BudgetExceededError が伝播する (fail-closed)。
 * get/head は Class B、put/list は Class A、put は加えてバイト数をストレージ予算へ予約する。
 * ストレージ予算は月次リセットせず期間キー `total` の累積(保存量は月をまたいで残るため)。
 * 注意: put のバイト予約は累積加算 (上書きの二重計上・削除による解放なし) で近似。
 */
export class GuardedObjectStore implements ObjectStore {
  private readonly inner: ObjectStore;
  private readonly guard: BudgetGuard;
  private readonly periodOf: () => string;

  constructor(
    inner: ObjectStore,
    guard: BudgetGuard,
    periodOf: () => string = () => formatPeriod(new Date()),
  ) {
    this.inner = inner;
    this.guard = guard;
    this.periodOf = periodOf;
  }

  async get(key: string): Promise<Uint8Array | null> {
    await this.guard.reserve(`${R2_CLASS_B_BUDGET}:${this.periodOf()}`, 1);
    return this.inner.get(key);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const period = this.periodOf();
    await this.guard.reserve(`${R2_CLASS_A_BUDGET}:${period}`, 1);
    if (data.byteLength > 0) {
      await this.guard.reserve(`${R2_STORAGE_BUDGET}:total`, data.byteLength);
    }
    await this.inner.put(key, data);
  }

  async head(key: string): Promise<{ size: number } | null> {
    await this.guard.reserve(`${R2_CLASS_B_BUDGET}:${this.periodOf()}`, 1);
    return this.inner.head(key);
  }

  async list(prefix: string): Promise<string[]> {
    await this.guard.reserve(`${R2_CLASS_A_BUDGET}:${this.periodOf()}`, 1);
    return this.inner.list(prefix);
  }
}
