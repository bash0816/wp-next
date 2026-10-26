// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { canView, type Actor, type Post } from '@wpn/core/canView';
import { selectVisiblePostBySlug, selectVisiblePosts } from './visiblePosts.js';

const here = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  id: number;
  author: number;
  status: string;
  password: string | null;
  authVersion: number;
  title: string;
}

// 各投稿は他と被らないマーカー mk-<id>-zz を title / excerpt / content / slug に含む。
const marker = (id: number): string => `mk-${id}-zz`;

const fixtures: Fixture[] = [
  { id: 1, author: 1, status: 'publish', password: null, authVersion: 1, title: 'pub' },
  { id: 2, author: 1, status: 'publish', password: 'secret', authVersion: 1, title: 'pub-pw' },
  { id: 3, author: 1, status: 'private', password: null, authVersion: 1, title: 'priv' },
  { id: 4, author: 1, status: 'draft', password: null, authVersion: 1, title: 'draft' },
  { id: 5, author: 2, status: 'pending', password: null, authVersion: 1, title: 'pending' },
  { id: 6, author: 2, status: 'future', password: null, authVersion: 1, title: 'future' },
  { id: 7, author: 2, status: 'trash', password: null, authVersion: 1, title: 'trash' },
  { id: 8, author: 1, status: 'inherit', password: null, authVersion: 1, title: 'inherit' },
  { id: 9, author: 2, status: 'publish', password: 'secret', authVersion: 2, title: 'pub-pw-v2' },
  { id: 10, author: 6, status: 'publish', password: '', authVersion: 1, title: 'pub-empty-pw' },
  { id: 11, author: 1, status: 'publish', password: null, authVersion: 1, title: 'a_b' },
  { id: 12, author: 1, status: 'publish', password: null, authVersion: 1, title: 'axb' },
];

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const insert = db.prepare(`
    INSERT INTO posts (ID, post_author, post_date_gmt, post_title, post_excerpt, post_content,
      post_status, post_password, post_name, post_type, post_modified_gmt, auth_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'post', ?, ?)`);
  for (const f of fixtures) {
    const m = marker(f.id);
    insert.run(
      f.id,
      f.author,
      `2026-01-${String(f.id).padStart(2, '0')} 00:00:00`,
      `${f.title} ${m}`,
      `excerpt ${m}`,
      `content ${m}`,
      f.status,
      f.password,
      `slug-${m}`,
      `2026-02-${String(f.id).padStart(2, '0')} 00:00:00`,
      f.authVersion,
    );
  }
  return db;
}

const actors = {
  anon: { userId: null, caps: new Set<string>() },
  other: { userId: 9, caps: new Set<string>() },
  author: { userId: 1, caps: new Set<string>() },
  readPrivate: { userId: 3, caps: new Set(['read_private_posts']) },
  editOthers: { userId: 4, caps: new Set(['edit_others_posts']) },
  unlockedMatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[2, 1]]) },
  unlockedMismatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[2, 0]]) },
} satisfies Record<string, Actor>;

const postModels: Post[] = fixtures.map((f) => ({
  id: f.id,
  authorId: f.author,
  status: f.status,
  password: f.password,
  authVersion: f.authVersion,
}));

function expectedVisibleIds(actor: Actor): number[] {
  return postModels
    .filter((p) => canView(actor, p))
    .map((p) => p.id)
    .sort((a, b) => b - a);
}

describe('selectVisiblePosts: 可視性', () => {
  for (const [name, actor] of Object.entries(actors)) {
    it(`${name}: 結果の id 集合が canView と一致し、不可視マーカーがどのフィールドにも現れない`, () => {
      const db = openDb();
      const rows = selectVisiblePosts(db, actor, { limit: 100 });
      const ids = rows.map((r) => r.id);

      expect(ids.slice().sort((a, b) => b - a)).toEqual(expectedVisibleIds(actor));

      const serialized = JSON.stringify(rows);
      for (const p of postModels) {
        if (!canView(actor, p)) {
          expect(serialized).not.toContain(marker(p.id));
        }
      }
      db.close();
    });
  }

  it('可視行は全フィールドを返す(title/excerpt/content/slug/type/modifiedGmt)', () => {
    const db = openDb();
    const rows = selectVisiblePosts(db, actors.anon, { limit: 100 });
    const row = rows.find((r) => r.id === 1);
    expect(row).toEqual({
      id: 1,
      slug: `slug-${marker(1)}`,
      title: `pub ${marker(1)}`,
      excerpt: `excerpt ${marker(1)}`,
      content: `content ${marker(1)}`,
      type: 'post',
      modifiedGmt: '2026-02-01 00:00:00',
    });
    db.close();
  });

  it('ORDER BY post_date_gmt DESC, ID DESC で並ぶ', () => {
    const db = openDb();
    const ids = selectVisiblePosts(db, actors.anon, { limit: 100 }).map((r) => r.id);
    // id 10 は publish + password='' のため未認証にも可視(canView 規則)
    expect(ids).toEqual([12, 11, 10, 1]);
    db.close();
  });
});

describe('selectVisiblePosts: search', () => {
  it('不可視投稿のマーカーで検索すると未認証・他人では0件', () => {
    const db = openDb();
    for (const actor of [actors.anon, actors.other]) {
      expect(selectVisiblePosts(db, actor, { search: marker(3), limit: 100 })).toEqual([]);
      expect(selectVisiblePosts(db, actor, { search: marker(4), limit: 100 })).toEqual([]);
      expect(selectVisiblePosts(db, actor, { search: marker(2), limit: 100 })).toEqual([]);
    }
    db.close();
  });

  it('可視投稿のマーカーで検索すると1件返る', () => {
    const db = openDb();
    const rows = selectVisiblePosts(db, actors.anon, { search: marker(1), limit: 100 });
    expect(rows.map((r) => r.id)).toEqual([1]);
    db.close();
  });

  it('excerpt と content も検索対象になる', () => {
    const db = openDb();
    const rows = selectVisiblePosts(db, actors.anon, { search: `content ${marker(12)}`, limit: 100 });
    expect(rows.map((r) => r.id)).toEqual([12]);
    db.close();
  });

  it("'a_b' は通常文字として扱われ 'axb' にマッチしない", () => {
    const db = openDb();
    const rows = selectVisiblePosts(db, actors.anon, { search: 'a_b', limit: 100 });
    expect(rows.map((r) => r.id)).toEqual([11]);
    db.close();
  });

  it("'%' は通常文字として扱われ、全件マッチしない", () => {
    const db = openDb();
    expect(selectVisiblePosts(db, actors.anon, { search: '%', limit: 100 })).toEqual([]);
    db.close();
  });
});

describe('selectVisiblePosts: slug / type', () => {
  it('不可視投稿の slug 指定は null / 空配列', () => {
    const db = openDb();
    expect(selectVisiblePostBySlug(db, actors.anon, `slug-${marker(3)}`)).toBeNull();
    expect(selectVisiblePostBySlug(db, actors.other, `slug-${marker(4)}`)).toBeNull();
    expect(selectVisiblePosts(db, actors.anon, { slug: `slug-${marker(2)}`, limit: 100 })).toEqual([]);
    db.close();
  });

  it('可視投稿の slug 指定は返る', () => {
    const db = openDb();
    expect(selectVisiblePostBySlug(db, actors.anon, `slug-${marker(1)}`)?.id).toBe(1);
    expect(selectVisiblePostBySlug(db, actors.author, `slug-${marker(4)}`)?.id).toBe(4);
    db.close();
  });

  it('slug は完全一致(部分一致しない)', () => {
    const db = openDb();
    expect(selectVisiblePosts(db, actors.anon, { slug: `slug-${marker(1).slice(0, 4)}`, limit: 100 })).toEqual([]);
    db.close();
  });

  it('type は完全一致で絞り込まれる', () => {
    const db = openDb();
    expect(selectVisiblePosts(db, actors.anon, { type: 'post', limit: 100 }).map((r) => r.id)).toEqual([12, 11, 10, 1]);
    expect(selectVisiblePosts(db, actors.anon, { type: 'po', limit: 100 })).toEqual([]);
    db.close();
  });
});

describe('selectVisiblePosts: limit / offset', () => {
  it.each([
    ['0', 0],
    ['101', 101],
    ['1.5', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-1', -1],
    ['未指定', undefined],
  ])('limit=%s は RangeError', (_label, limit) => {
    const db = openDb();
    expect(() => selectVisiblePosts(db, actors.anon, { limit: limit as number })).toThrow(RangeError);
    db.close();
  });

  it('limit=1 は1件のみ', () => {
    const db = openDb();
    expect(selectVisiblePosts(db, actors.anon, { limit: 1 }).map((r) => r.id)).toEqual([12]);
    db.close();
  });

  it('limit=100 は上限ちょうどで受け付ける', () => {
    const db = openDb();
    expect(() => selectVisiblePosts(db, actors.anon, { limit: 100 })).not.toThrow();
    db.close();
  });

  it('offset が効く', () => {
    const db = openDb();
    expect(selectVisiblePosts(db, actors.anon, { limit: 1, offset: 1 }).map((r) => r.id)).toEqual([11]);
    expect(selectVisiblePosts(db, actors.anon, { limit: 10, offset: 2 }).map((r) => r.id)).toEqual([10, 1]);
    expect(selectVisiblePosts(db, actors.anon, { limit: 10, offset: 4 })).toEqual([]);
    db.close();
  });
});

describe('selectVisiblePosts: SQLインジェクション', () => {
  const payloads = [`'; DROP TABLE posts; --`, `' OR '1'='1`];

  it.each(payloads)('payload %s を search/slug/type に渡しても例外なし・不可視行なし・テーブル残存', (payload) => {
    const db = openDb();
    const invisibleMarkers = postModels.filter((p) => !canView(actors.anon, p)).map((p) => marker(p.id));

    const bySearch = selectVisiblePosts(db, actors.anon, { search: payload, limit: 100 });
    const bySlug = selectVisiblePosts(db, actors.anon, { slug: payload, limit: 100 });
    const byType = selectVisiblePosts(db, actors.anon, { type: payload, limit: 100 });
    const bySlugOne = selectVisiblePostBySlug(db, actors.anon, payload);

    expect(bySearch).toEqual([]);
    expect(bySlug).toEqual([]);
    expect(byType).toEqual([]);
    expect(bySlugOne).toBeNull();

    const all = JSON.stringify(selectVisiblePosts(db, actors.anon, { limit: 100 }));
    for (const m of invisibleMarkers) expect(all).not.toContain(m);

    const count = db.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number };
    expect(count.n).toBe(fixtures.length);
    db.close();
  });
});
