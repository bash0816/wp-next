// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { canView, type Actor, type Post } from '@wpn/core/canView';
import { selectVisiblePostIds } from './visiblePosts.js';

const here = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  id: number;
  author: number;
  status: string;
  password: string | null;
  authVersion: number;
}

// 固定フィクスチャ。status × password × auth_version を網羅する。
const fixtures: Fixture[] = [
  { id: 1, author: 1, status: 'publish', password: null, authVersion: 1 },
  { id: 2, author: 1, status: 'publish', password: 'secret', authVersion: 1 },
  { id: 3, author: 1, status: 'private', password: null, authVersion: 1 },
  { id: 4, author: 1, status: 'draft', password: null, authVersion: 1 },
  { id: 5, author: 2, status: 'pending', password: null, authVersion: 1 },
  { id: 6, author: 2, status: 'future', password: null, authVersion: 1 },
  { id: 7, author: 2, status: 'auto-draft', password: null, authVersion: 1 },
  { id: 8, author: 2, status: 'trash', password: null, authVersion: 1 },
  { id: 9, author: 1, status: 'inherit', password: null, authVersion: 1 },
  { id: 10, author: 1, status: 'bogus-status', password: null, authVersion: 1 },
  { id: 11, author: 2, status: 'publish', password: 'secret', authVersion: 2 },
  { id: 12, author: 6, status: 'publish', password: 'secret', authVersion: 1 },
];

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const insert = db.prepare(
    'INSERT INTO posts (ID, post_author, post_status, post_password, post_type, auth_version) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const f of fixtures) {
    insert.run(f.id, f.author, f.status, f.password, 'post', f.authVersion);
  }
  return db;
}

const actors = {
  anon: { userId: null, caps: new Set<string>() },
  other: { userId: 9, caps: new Set<string>() },
  author: { userId: 1, caps: new Set<string>() },
  readPrivate: { userId: 3, caps: new Set(['read_private_posts']) },
  editOthers: { userId: 4, caps: new Set(['edit_others_posts']) },
  unlockedMatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[2, 1], [11, 1]]) },
  unlockedMismatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[2, 0]]) },
} satisfies Record<string, Actor>;

// 期待値は手書き。フィクスチャと方針から導出した固定表。
const expectedVisible: Record<keyof typeof actors, readonly number[]> = {
  anon: [1],
  other: [1],
  author: [1, 2, 3, 4],
  readPrivate: [1, 3],
  editOthers: [1, 2, 4, 5, 6, 7, 8, 11, 12],
  unlockedMatch: [1, 2],
  unlockedMismatch: [1],
};

describe('schema.sql', () => {
  it('全テーブルを作成し、TABLE_NAMES と一致する', async () => {
    const { TABLE_NAMES } = await import('./schema.js');
    const db = openDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toEqual([...TABLE_NAMES].sort());
    db.close();
  });
});

describe('selectVisiblePostIds 期待値表', () => {
  for (const name of Object.keys(actors) as Array<keyof typeof actors>) {
    it(`actor=${name}`, () => {
      const db = openDb();
      expect(selectVisiblePostIds(db, actors[name])).toEqual([...expectedVisible[name]]);
      db.close();
    });
  }
});

describe('SQL と canView の一貫性', () => {
  for (const name of Object.keys(actors) as Array<keyof typeof actors>) {
    it(`actor=${name}: SQL 結果は canView を全行に適用した結果と一致する`, () => {
      const db = openDb();
      const rows = db
        .prepare('SELECT ID, post_author, post_status, post_password, auth_version FROM posts ORDER BY ID')
        .all() as Array<{ ID: number; post_author: number; post_status: string; post_password: string | null; auth_version: number }>;
      const viaCanView = rows
        .filter((r) =>
          canView(actors[name], {
            id: r.ID,
            authorId: r.post_author,
            status: r.post_status,
            password: r.post_password,
            authVersion: r.auth_version,
          } satisfies Post),
        )
        .map((r) => r.ID);
      expect(selectVisiblePostIds(db, actors[name])).toEqual(viaCanView);
      db.close();
    });
  }
});

describe('auth_version 失効(SQL 側)', () => {
  it('解錠時の版と現行 auth_version が食い違うと、解錠済みでも返らない', () => {
    const db = openDb();
    expect(selectVisiblePostIds(db, actors.unlockedMatch)).toContain(2);
    db.prepare('UPDATE posts SET auth_version = 2 WHERE ID = 2').run();
    expect(selectVisiblePostIds(db, actors.unlockedMatch)).not.toContain(2);
    db.close();
  });
});

describe('空文字パスワード(WPでは未設定扱い)', () => {
  it('publish + password="" は未認証にも可視で、canView と SQL が一致する', () => {
    const db = openDb();
    db.prepare("INSERT INTO posts (ID, post_author, post_status, post_password, post_type, auth_version) VALUES (900, 1, 'publish', '', 'post', 1)").run();
    const anon: Actor = { userId: null, caps: new Set() };
    const post: Post = { id: 900, authorId: 1, status: 'publish', password: '', authVersion: 1 };
    expect(canView(anon, post)).toBe(true);
    expect(selectVisiblePostIds(db, anon)).toContain(900);
    db.close();
  });
});
