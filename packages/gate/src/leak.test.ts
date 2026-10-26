// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@wpn/core/canView';
import { handle, type GateDeps } from './handler.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '../../db/src/schema.sql'), 'utf8');
const SITE = 'https://example.test';

interface Seed {
  id: number;
  author: number;
  status: string;
  password: string | null;
}

// 各投稿は一意マーカー mk-<id>-zz を title/excerpt/content/slug に持つ。
const seeds: Seed[] = [
  { id: 1, author: 1, status: 'publish', password: null },
  { id: 2, author: 1, status: 'publish', password: 'secret' },
  { id: 3, author: 1, status: 'private', password: null },
  { id: 4, author: 1, status: 'draft', password: null },
  { id: 5, author: 2, status: 'publish', password: null },
  { id: 6, author: 2, status: 'trash', password: null },
];

const marker = (id: number): string => `mk-${id}-zz`;

function openDb(extra: readonly Seed[] = []): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const ins = db.prepare(
    `INSERT INTO posts (ID, post_author, post_status, post_password, post_type, post_name,
       post_title, post_excerpt, post_content, post_date_gmt, post_modified_gmt, auth_version)
     VALUES (?, ?, ?, ?, 'post', ?, ?, ?, ?, ?, ?, 1)`,
  );
  for (const s of [...seeds, ...extra]) {
    const m = marker(s.id);
    const day = `2026-01-${String(s.id).padStart(2, '0')}T00:00:00Z`;
    ins.run(s.id, s.author, s.status, s.password, m, `T ${m}`, `E ${m}`, `C ${m}`, day, day);
  }
  return db;
}

const actors = {
  anon: { userId: null, caps: new Set<string>() },
  other: { userId: 9, caps: new Set<string>() },
  author: { userId: 1, caps: new Set<string>() },
  readPrivate: { userId: 3, caps: new Set(['read_private_posts']) },
  editOthers: { userId: 4, caps: new Set(['edit_others_posts']) },
} satisfies Record<string, Actor>;

type ActorName = keyof typeof actors;

// 期待値は手書き。canView の規則(publish:パスワード無し/特権/作者、private:作者/read_private、
// draft系:作者/edit_others、trash:作者/edit_others)から導出した固定表。
const visible: Record<ActorName, readonly number[]> = {
  anon: [1, 5],
  other: [1, 5],
  author: [1, 2, 3, 4, 5],
  readPrivate: [1, 3, 5],
  editOthers: [1, 2, 4, 5, 6],
};

const deps = (db: DatabaseSync, actor: Actor): GateDeps => ({
  db,
  resolveActor: async () => actor,
  staticAllowlist: new Map(),
  siteUrl: SITE,
});

const url = (path: string): Request => new Request(`${SITE}${path}`);

async function fullText(res: Response): Promise<string> {
  return (await res.text()) + JSON.stringify([...res.headers.entries()]);
}

type Kind = 'p' | 'feed' | 'sitemap' | 'search' | 'rest';
const kindPath: Record<Kind, (id: number) => string> = {
  p: (id) => `/p/${marker(id)}`,
  feed: () => '/feed',
  sitemap: () => '/sitemap.xml',
  search: (id) => `/search?q=${marker(id)}`,
  rest: () => '/wp-json/wp/v2/posts?per_page=100',
};
const kinds: readonly Kind[] = ['p', 'feed', 'sitemap', 'search', 'rest'];

// 行 = (actor, route, post)。期待は「マーカーを含むか」と、/p/ のみ 200/404 の区別。
const rows: Array<[ActorName, Kind, number]> = [];
for (const name of Object.keys(actors) as ActorName[]) {
  for (const kind of kinds) {
    for (const s of seeds) rows.push([name, kind, s.id]);
  }
}

describe('leak: route x actor x post (table-driven)', () => {
  it.each(rows)('actor=%s route=%s post=%i', async (name, kind, id) => {
    const db = openDb();
    const res = await handle(url(kindPath[kind](id)), deps(db, actors[name]));
    const isVisible = visible[name].includes(id);
    const text = await fullText(res);
    if (kind === 'p') {
      expect(res.status).toBe(isVisible ? 200 : 404);
    } else {
      expect(res.status).toBe(200);
    }
    if (isVisible) {
      expect(text).toContain(marker(id));
    } else {
      expect(text).not.toContain(marker(id));
    }
    db.close();
  });
});

describe('leak: private-after-publish on the same DB', () => {
  it('a post published then set private disappears from every route for anon', async () => {
    const db = openDb([{ id: 7, author: 1, status: 'publish', password: null }]);
    const anon = deps(db, actors.anon);
    for (const kind of kinds) {
      const res = await handle(url(kindPath[kind](7)), anon);
      expect(await fullText(res)).toContain(marker(7));
    }
    db.prepare("UPDATE posts SET post_status = 'private' WHERE ID = ?").run(7);
    for (const kind of kinds) {
      const res = await handle(url(kindPath[kind](7)), anon);
      expect(await fullText(res), kind).not.toContain(marker(7));
    }
    db.close();
  });
});

describe('404 identity: nonexistent slug vs invisible slug', () => {
  it('status, body and headers are identical for anon', async () => {
    const db = openDb();
    const anon = deps(db, actors.anon);
    const missing = await handle(url('/p/does-not-exist'), anon);
    const hidden = await handle(url(`/p/${marker(3)}`), anon);
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.text()).toBe(await missing.text());
    expect([...hidden.headers.entries()]).toEqual([...missing.headers.entries()]);
    db.close();
  });
});
