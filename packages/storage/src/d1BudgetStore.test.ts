// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetGuard } from './budget.js';
import { D1BudgetStore, type D1Like } from './d1BudgetStore.js';
import { initTestDb, openTestDb } from './testDb.js';

const KEY = 'r2.classA:2026-10';
const spec = { limit: 100, warnRatio: 0.8, stopRatio: 0.95 };

/** node:sqlite の DatabaseSync を D1Like に包むテスト用アダプタ (D1 と同じく非同期 API)。 */
function d1FromSqlite(db: DatabaseSync): D1Like {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const params = values as SQLInputValue[];
          return {
            async run() {
              const result = stmt.run(...params);
              return { meta: { changes: Number(result.changes) } };
            },
            async first<T>() {
              const row = stmt.get(...params);
              return (row ?? null) as T | null;
            },
          };
        },
      };
    },
  };
}

describe('D1BudgetStore (node:sqlite アダプタ経由)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('上限境界: limit=100 で100回まで成功し、101回目は false かつ used 不変', async () => {
    const store = new D1BudgetStore(d1FromSqlite(openTestDb()));
    for (let i = 0; i < 100; i++) {
      expect(await store.reserve(KEY, 1, 100)).toBe(true);
    }
    expect(await store.reserve(KEY, 1, 100)).toBe(false);
    expect(await store.used(KEY)).toBe(100);
  });

  it('同一 key へ 200 件同時 reserve: 成功はちょうど limit 件、used == limit', async () => {
    const store = new D1BudgetStore(d1FromSqlite(openTestDb()));
    const results = await Promise.all(
      Array.from({ length: 200 }, () => store.reserve(KEY, 1, 100)),
    );
    expect(results.filter((ok) => ok).length).toBe(100);
    expect(await store.used(KEY)).toBe(100);
  });

  it('ファイル DB を閉じて開き直しても used が保持される', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wpn-d1budget-'));
    dirs.push(dir);
    const path = join(dir, 'budget.db');

    const first = new DatabaseSync(path);
    initTestDb(first);
    const storeA = new D1BudgetStore(d1FromSqlite(first));
    expect(await storeA.reserve(KEY, 7, 100)).toBe(true);
    first.close();

    const second = new DatabaseSync(path);
    const storeB = new D1BudgetStore(d1FromSqlite(second));
    expect(await storeB.used(KEY)).toBe(7);
    expect(await storeB.reserve(KEY, 3, 100)).toBe(true);
    expect(await storeB.used(KEY)).toBe(10);
    second.close();
  });

  it('未登録 key の used は 0', async () => {
    const store = new D1BudgetStore(d1FromSqlite(openTestDb()));
    expect(await store.used('unknown:2026-10')).toBe(0);
  });

  it('不正な amount / limit / period 無し key は例外 (拒否)', async () => {
    const store = new D1BudgetStore(d1FromSqlite(openTestDb()));
    await expect(store.reserve(KEY, 0, 100)).rejects.toThrow(RangeError);
    await expect(store.reserve(KEY, -1, 100)).rejects.toThrow(RangeError);
    await expect(store.reserve(KEY, 1.5, 100)).rejects.toThrow(RangeError);
    await expect(store.reserve(KEY, 1, 0)).rejects.toThrow(RangeError);
    await expect(store.reserve('r2.classA', 1, 100)).rejects.toThrow();
    await expect(store.reserve('r2.classA:', 1, 100)).rejects.toThrow();
    await expect(store.reserve(':2026-10', 1, 100)).rejects.toThrow();
  });

  it('BudgetGuard 経由で stopRatio 0.95 (有効上限 95) が効く', async () => {
    const store = new D1BudgetStore(d1FromSqlite(openTestDb()));
    const guard = new BudgetGuard(store, { 'r2.classA': spec });
    await guard.reserve(KEY, 95);
    await expect(guard.reserve(KEY, 1)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(await store.used(KEY)).toBe(95);
    expect(await guard.status(KEY)).toBe('stop');
  });
});
