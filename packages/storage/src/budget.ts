// SPDX-License-Identifier: GPL-3.0-only

/** 原子的な予約を提供する永続ストア。reserve は「上限を超えない場合のみ加算して true」を返す。 */
export interface BudgetStore {
  reserve(key: string, amount: number, limit: number): Promise<boolean>;
  used(key: string): Promise<number>;
}

export interface BudgetSpec {
  /** 無料枠の上限値 (出典は limits.ts) */
  limit: number;
  /** 警告しきい値の比率 (例 0.8) */
  warnRatio: number;
  /** 停止しきい値の比率 (例 0.95)。予約はこの有効上限を超えられない */
  stopRatio: number;
}

export type BudgetStatus = 'ok' | 'warn' | 'stop';

export class BudgetExceededError extends Error {
  readonly key: string;

  constructor(key: string, options?: { cause?: unknown }) {
    super(`budget exceeded: ${key}`, options);
    this.name = 'BudgetExceededError';
    this.key = key;
  }
}

/**
 * 浮動小数の誤差を丸めてから切り捨て、整数のしきい値を得る。
 * reserve と status の双方がこの関数だけを使うことで境界を一致させる。
 */
function threshold(limit: number, ratio: number): number {
  return Math.floor(Math.round(limit * ratio * 1e9) / 1e9);
}

/**
 * key は `<budgetName>:<period>` 形式。budgetName の部分で予算定義を引く。
 * 例: `r2.classA:2026-10` → 予算 `r2.classA`。
 */
function budgetNameOf(key: string): string {
  const i = key.lastIndexOf(':');
  return i <= 0 ? key : key.slice(0, i);
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class BudgetGuard {
  private readonly store: BudgetStore;
  private readonly budgets: Record<string, BudgetSpec>;

  constructor(store: BudgetStore, budgets: Record<string, BudgetSpec>) {
    this.store = store;
    this.budgets = budgets;
  }

  /**
   * 操作の前に呼ぶ。有効上限 floor(limit*stopRatio) を超える予約は BudgetExceededError。
   * 記録自体が失敗した場合も fail-closed として BudgetExceededError (cause 付き) を投げる。
   */
  async reserve(key: string, amount: number): Promise<void> {
    if (!isPositiveInteger(amount)) {
      throw new RangeError(`amount must be a positive safe integer: ${String(amount)}`);
    }
    const spec = this.specFor(key);
    if (spec === undefined) {
      throw new BudgetExceededError(key);
    }
    const effectiveLimit = threshold(spec.limit, spec.stopRatio);
    let ok: boolean;
    try {
      ok = await this.store.reserve(key, amount, effectiveLimit);
    } catch (cause) {
      throw new BudgetExceededError(key, { cause });
    }
    if (!ok) {
      throw new BudgetExceededError(key);
    }
  }

  async status(key: string): Promise<BudgetStatus> {
    const spec = this.specFor(key);
    if (spec === undefined) {
      throw new Error(`no budget defined for key: ${key}`);
    }
    const used = await this.store.used(key);
    if (used >= threshold(spec.limit, spec.stopRatio)) return 'stop';
    if (used >= threshold(spec.limit, spec.warnRatio)) return 'warn';
    return 'ok';
  }

  private specFor(key: string): BudgetSpec | undefined {
    const name = budgetNameOf(key);
    return Object.hasOwn(this.budgets, name) ? this.budgets[name] : undefined;
  }
}
