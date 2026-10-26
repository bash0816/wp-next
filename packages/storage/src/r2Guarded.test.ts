// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetGuard, type BudgetStore } from './budget.js';
import { GuardedObjectStore, R2_BUDGET_SPECS, formatPeriod, type ObjectStore } from './r2Guarded.js';
import { SqliteBudgetStore } from './sqliteBudgetStore.js';
import { R2_CLASS_A_PER_MONTH, R2_CLASS_B_PER_MONTH, R2_STORAGE_BYTES_PER_MONTH } from './limits.js';
import { openTestDb } from './testDb.js';

const PERIOD = '2026-10';
const A = `r2.classA:${PERIOD}`;
const B = `r2.classB:${PERIOD}`;
// ストレージは月次リセットしない累積キー(保存量は月をまたぐ)
const S = 'r2.storage:total';

type Counters = Record<string, number>;

/**
 * 内側ストアのスパイ。各呼び出し時点で、予約カウンタの状態(snapshot)を記録する。
 * 予約が操作より前に行われていることを、呼び出し時点の計数で検証するため。
 */
class SpyInner implements ObjectStore {
  readonly calls: Array<{ name: string; counters: Counters }> = [];
  constructor(private readonly snapshot: () => Promise<Counters>) {}
  private async mark(name: string): Promise<void> {
    this.calls.push({ name, counters: await this.snapshot() });
  }
  async get(_key: string): Promise<Uint8Array | null> {
    await this.mark('get');
    return new Uint8Array([1]);
  }
  async put(_key: string, _data: Uint8Array): Promise<void> {
    await this.mark('put');
  }
  async head(_key: string): Promise<{ size: number } | null> {
    await this.mark('head');
    return { size: 1 };
  }
  async list(_prefix: string): Promise<string[]> {
    await this.mark('list');
    return [];
  }
  names(): string[] {
    return this.calls.map((c) => c.name);
  }
}

const spec = (limit: number) => ({ limit, warnRatio: 0.8, stopRatio: 0.95 });

function setup(store: BudgetStore = new SqliteBudgetStore(openTestDb())) {
  const guard = new BudgetGuard(store, {
    'r2.classA': spec(R2_CLASS_A_PER_MONTH),
    'r2.classB': spec(R2_CLASS_B_PER_MONTH),
    'r2.storage': spec(R2_STORAGE_BYTES_PER_MONTH),
  });
  const snapshot = async (): Promise<Counters> => ({
    [A]: await store.used(A),
    [B]: await store.used(B),
    [S]: await store.used(S),
  });
  const inner = new SpyInner(snapshot);
  const guarded = new GuardedObjectStore(inner, guard, () => PERIOD);
  return { store, inner, guarded };
}

describe('GuardedObjectStore 予約は操作の前に行われる', () => {
  it('get は内側 get より前に Class B を 1 増やしている', async () => {
    const { guarded, inner, store } = setup();
    await guarded.get('k');
    expect(inner.names()).toEqual(['get']);
    expect(inner.calls[0]?.counters[B]).toBe(1);
    expect(inner.calls[0]?.counters[A]).toBe(0);
    expect(await store.used(B)).toBe(1);
  });

  it('put は内側 put より前に Class A 1件とバイト数を予約している', async () => {
    const { guarded, inner, store } = setup();
    await guarded.put('k', new Uint8Array(7));
    expect(inner.names()).toEqual(['put']);
    expect(inner.calls[0]?.counters[A]).toBe(1);
    expect(inner.calls[0]?.counters[S]).toBe(7);
    expect(await store.used(A)).toBe(1);
    expect(await store.used(S)).toBe(7);
  });

  it('head は Class B、list は Class A を予約する', async () => {
    const { guarded, store } = setup();
    await guarded.head('k');
    await guarded.list('p/');
    expect(await store.used(B)).toBe(1);
    expect(await store.used(A)).toBe(1);
  });
});

describe('GuardedObjectStore 拒否時は内側を呼ばない', () => {
  it('Class A が有効上限 950,000 に達していると put は拒否され、内側 put は 0 回', async () => {
    const { guarded, inner, store } = setup();
    await store.reserve(A, 950_000, 950_000);
    await expect(guarded.put('k', new Uint8Array(1))).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(0);
    expect(await store.used(S)).toBe(0); // Class A で止まったのでバイトは加算されない
  });

  it('Class A が上限に達していると list も拒否され内側は 0 回', async () => {
    const { guarded, inner, store } = setup();
    await store.reserve(A, 950_000, 950_000);
    await expect(guarded.list('p/')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(0);
  });

  it('Class B が有効上限 9,500,000 に達していると get/head は拒否され内側は 0 回', async () => {
    const { guarded, inner, store } = setup();
    await store.reserve(B, 9_500_000, 9_500_000);
    await expect(guarded.get('k')).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(guarded.head('k')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(0);
  });

  it('ストレージ有効上限 floor(10GB*0.95) を超える put は拒否される (Class A は先に消費済み)', async () => {
    const { guarded, inner, store } = setup();
    const effective = Math.floor(R2_STORAGE_BYTES_PER_MONTH * 0.95);
    await store.reserve(S, effective, effective);
    await expect(guarded.put('k', new Uint8Array(1))).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(0);
    expect(await store.used(A)).toBe(1); // 部分失敗: fail-closed の既知の挙動として報告対象
  });
});

describe('GuardedObjectStore fail-closed (記録失敗)', () => {
  it('reserve が例外を投げると get/put とも BudgetExceededError、内側は 0 回', async () => {
    const failing: BudgetStore = {
      reserve: async () => {
        throw new Error('record failed');
      },
      used: async () => 0,
    };
    const { guarded, inner } = setup(failing);
    await expect(guarded.get('k')).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(guarded.put('k', new Uint8Array(1))).rejects.toBeInstanceOf(BudgetExceededError);
    expect(inner.calls).toHaveLength(0);
  });
});

describe('GuardedObjectStore 期間キー・サイズ0', () => {
  it('period は注入関数の値でキーが組まれる', async () => {
    const store = new SqliteBudgetStore(openTestDb());
    const guard = new BudgetGuard(store, { 'r2.classB': spec(R2_CLASS_B_PER_MONTH) });
    const guarded = new GuardedObjectStore(
      new SpyInner(async () => ({})),
      guard,
      () => '2026-11',
    );
    await guarded.get('k');
    expect(await store.used('r2.classB:2026-11')).toBe(1);
    expect(await store.used('r2.classB:2026-10')).toBe(0);
  });

  it('0バイトの put は Class A のみ予約し、storage は予約せず内側 put は呼ばれる', async () => {
    const { guarded, inner, store } = setup();
    await guarded.put('k', new Uint8Array(0));
    expect(inner.names()).toEqual(['put']);
    expect(await store.used(A)).toBe(1);
    expect(await store.used(S)).toBe(0);
  });
});

describe('formatPeriod (UTC の YYYY-MM)', () => {
  it('UTC で月を区切る (月末最終秒と翌月初)', () => {
    expect(formatPeriod(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10');
    expect(formatPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
    expect(formatPeriod(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });
});

describe('ストレージ予算は月をまたいで累積する', () => {
  it('翌月になっても前月に put した容量は引き継がれる', async () => {
    const used = new Map<string, number>();
    const store = {
      async reserve(key: string, amount: number, limit: number) {
        const cur = used.get(key) ?? 0;
        if (cur + amount > limit) return false;
        used.set(key, cur + amount);
        return true;
      },
      async used(key: string) {
        return used.get(key) ?? 0;
      },
    };
    let period = '2026-10';
    const inner = {
      async get() { return null; },
      async put() {},
      async head() { return null; },
      async list() { return []; },
    };
    const guarded = new GuardedObjectStore(inner, new BudgetGuard(store, R2_BUDGET_SPECS), () => period);
    await guarded.put('a', new Uint8Array(1000));
    period = '2026-11';
    await guarded.put('b', new Uint8Array(500));
    expect(used.get('r2.storage:total')).toBe(1500);
  });
});
