// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetGuard } from './budget.js';
import { initTestDb, openTestDb } from './testDb.js';
import { SqliteBudgetStore } from './sqliteBudgetStore.js';

const KEY = 'r2.classA:2026-10';
const spec = { limit: 100, warnRatio: 0.8, stopRatio: 0.95 };

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wpn-budget-'));
  tmpDirs.push(dir);
  return join(dir, 'budget.db');
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('SqliteBudgetStore 並行性 (実スキーマ・同期接続)', () => {
  it('Promise.all で200件予約しても成功は有効上限95件、used は95で止まる', async () => {
    const db = openTestDb();
    const guard = new BudgetGuard(new SqliteBudgetStore(db), { 'r2.classA': spec });
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        guard.reserve(KEY, 1).then(
          () => 'ok' as const,
          (e: unknown) => (e instanceof BudgetExceededError ? ('rejected' as const) : ('other' as const)),
        ),
      ),
    );
    expect(results.filter((r) => r === 'ok')).toHaveLength(95);
    expect(results.filter((r) => r === 'rejected')).toHaveLength(105);
    expect(results.filter((r) => r === 'other')).toHaveLength(0);
    expect(await new SqliteBudgetStore(db).used(KEY)).toBe(95);
    db.close();
  });
});

describe('SqliteBudgetStore 原子性 (単一条件付き文)', () => {
  it('used=94 で amount=2 は false、部分加算も上限クランプもされない', async () => {
    const db = openTestDb();
    const store = new SqliteBudgetStore(db);
    expect(await store.reserve(KEY, 94, 95)).toBe(true);
    expect(await store.reserve(KEY, 2, 95)).toBe(false);
    expect(await store.used(KEY)).toBe(94);
    expect(await store.reserve(KEY, 1, 95)).toBe(true);
    expect(await store.used(KEY)).toBe(95);
    db.close();
  });

  it('2接続(同一ファイル)で各50を予約: 2件目は DB 状態に対して拒否される', async () => {
    const path = tmpDbPath();
    const db1 = new DatabaseSync(path);
    initTestDb(db1);
    const db2 = new DatabaseSync(path);
    const s1 = new SqliteBudgetStore(db1);
    const s2 = new SqliteBudgetStore(db2);
    expect(await s1.reserve(KEY, 50, 95)).toBe(true);
    expect(await s2.reserve(KEY, 50, 95)).toBe(false);
    expect(await s2.reserve(KEY, 45, 95)).toBe(true);
    expect(await s1.used(KEY)).toBe(95);
    db1.close();
    db2.close();
  });

  it('未登録キーは INSERT OR IGNORE で行が作られ、used は 0 から始まる', async () => {
    const db = openTestDb();
    const store = new SqliteBudgetStore(db);
    expect(await store.used('r2.classB:2026-10')).toBe(0);
    expect(await store.reserve('r2.classB:2026-10', 3, 10)).toBe(true);
    expect(await store.used('r2.classB:2026-10')).toBe(3);
    db.close();
  });

  it('コロンのないキーは period を導出できず拒否される', async () => {
    const db = openTestDb();
    const store = new SqliteBudgetStore(db);
    await expect(store.reserve('nocolon', 1, 10)).rejects.toThrow();
    db.close();
  });

  it('amount が 0 / 負 / 非整数 / NaN は拒否される', async () => {
    const db = openTestDb();
    const store = new SqliteBudgetStore(db);
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      await expect(store.reserve(KEY, amount, 10)).rejects.toThrow();
    }
    expect(await store.used(KEY)).toBe(0);
    db.close();
  });
});

describe('SqliteBudgetStore 再起動 (ファイルDB)', () => {
  it('閉じて開き直しても used が残り、上限超過は依然として拒否される', async () => {
    const path = tmpDbPath();
    const db1 = new DatabaseSync(path);
    initTestDb(db1);
    const s1 = new SqliteBudgetStore(db1);
    expect(await s1.reserve(KEY, 90, 95)).toBe(true);
    db1.close();

    const db2 = new DatabaseSync(path); // スキーマは再適用しない
    const s2 = new SqliteBudgetStore(db2);
    expect(await s2.used(KEY)).toBe(90);
    expect(await s2.reserve(KEY, 6, 95)).toBe(false);
    expect(await s2.reserve(KEY, 5, 95)).toBe(true);
    expect(await s2.used(KEY)).toBe(95);
    db2.close();
  });
});
