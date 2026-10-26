// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetGuard, type BudgetStore } from './budget.js';
import { R2_CLASS_A_PER_MONTH } from './limits.js';

class MemStore implements BudgetStore {
  readonly counters = new Map<string, number>();
  readonly reserveCalls: Array<{ key: string; amount: number; limit: number }> = [];
  async reserve(key: string, amount: number, limit: number): Promise<boolean> {
    this.reserveCalls.push({ key, amount, limit });
    const cur = this.counters.get(key) ?? 0;
    if (cur + amount > limit) return false;
    this.counters.set(key, cur + amount);
    return true;
  }
  async used(key: string): Promise<number> {
    return this.counters.get(key) ?? 0;
  }
}

const spec = { limit: 100, warnRatio: 0.8, stopRatio: 0.95 };
const KEY = 'r2.classA:2026-10';

function setup(budgets: Record<string, typeof spec> = { 'r2.classA': spec }) {
  const store = new MemStore();
  const guard = new BudgetGuard(store, budgets);
  return { store, guard };
}

describe('BudgetGuard threshold (limit=100, stopRatio=0.95 → 有効上限95)', () => {
  it('95 ちょうどは成功し、その後の1件は BudgetExceededError', async () => {
    const { guard, store } = setup();
    await expect(guard.reserve(KEY, 95)).resolves.toBeUndefined();
    expect(store.counters.get(KEY)).toBe(95);
    await expect(guard.reserve(KEY, 1)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(store.counters.get(KEY)).toBe(95);
  });

  it('1回で96を予約すると拒否される (境界の外側)', async () => {
    const { guard, store } = setup();
    await expect(guard.reserve(KEY, 96)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(store.counters.get(KEY) ?? 0).toBe(0);
  });

  it('store には有効上限(95)を渡す', async () => {
    const { guard, store } = setup();
    await guard.reserve(KEY, 1);
    expect(store.reserveCalls[0]?.limit).toBe(95);
  });

  it('実定数 R2 Class A (1,000,000) の有効上限は 950,000', async () => {
    const { guard, store } = setup({
      'r2.classA': { limit: R2_CLASS_A_PER_MONTH, warnRatio: 0.8, stopRatio: 0.95 },
    });
    await guard.reserve(KEY, 950_000);
    await expect(guard.reserve(KEY, 1)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(store.counters.get(KEY)).toBe(950_000);
  });
});

describe('BudgetGuard.status 境界 (limit=100: warn=80, stop=95)', () => {
  const cases: Array<[number, 'ok' | 'warn' | 'stop']> = [
    [79, 'ok'],
    [80, 'warn'],
    [94, 'warn'],
    [95, 'stop'],
  ];
  for (const [used, expected] of cases) {
    it(`used=${used} → ${expected}`, async () => {
      const { guard, store } = setup();
      store.counters.set(KEY, used);
      await expect(guard.status(KEY)).resolves.toBe(expected);
    });
  }
});

describe('BudgetGuard fail-closed', () => {
  it('store.reserve が例外を投げたら BudgetExceededError (cause 付き)', async () => {
    const boom = new Error('disk I/O');
    const failing: BudgetStore = {
      reserve: async () => {
        throw boom;
      },
      used: async () => 0,
    };
    const guard = new BudgetGuard(failing, { 'r2.classA': spec });
    const err = await guard.reserve(KEY, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect((err as BudgetExceededError).cause).toBe(boom);
  });

  it('予算定義のないキーは store を呼ばずに拒否', async () => {
    const { guard, store } = setup();
    await expect(guard.reserve('r2.unknown:2026-10', 1)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(store.reserveCalls).toHaveLength(0);
  });
});

describe('BudgetGuard 引数検証 (amount は正の整数のみ)', () => {
  for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`amount=${String(amount)} は拒否され store を呼ばない`, async () => {
      const { guard, store } = setup();
      await expect(guard.reserve(KEY, amount)).rejects.toThrow();
      expect(store.reserveCalls).toHaveLength(0);
    });
  }
});
