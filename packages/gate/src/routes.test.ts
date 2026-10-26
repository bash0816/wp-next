// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@wpn/core/canView';
import { createHandler, handle, type GateDeps } from './handler.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '../../db/src/schema.sql'), 'utf8');
const SITE = 'https://example.test';
const ANON: Actor = { userId: null, caps: new Set() };

interface Post {
  id: number;
  status?: string;
  password?: string | null;
  title?: string;
  slug?: string | null;
  excerpt?: string;
  content?: string;
  modified?: string;
}

function openDb(posts: readonly Post[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const ins = db.prepare(
    `INSERT INTO posts (ID, post_author, post_status, post_password, post_type, post_name,
       post_title, post_excerpt, post_content, post_date_gmt, post_modified_gmt, auth_version)
     VALUES (?, 1, ?, ?, 'post', ?, ?, ?, ?, ?, ?, 1)`,
  );
  for (const p of posts) {
    const day = p.modified ?? `2026-03-${String(p.id).padStart(2, '0')}T00:00:00Z`;
    ins.run(
      p.id,
      p.status ?? 'publish',
      p.password ?? null,
      // post_name は schema 上 NOT NULL DEFAULT '' のため、slug なしは空文字で表す。
      p.slug === undefined ? `s-${p.id}` : (p.slug ?? ''),
      p.title ?? `Title ${p.id}`,
      p.excerpt ?? `Excerpt ${p.id}`,
      p.content ?? `Content ${p.id}`,
      day,
      day,
    );
  }
  return db;
}

function deps(db: DatabaseSync, resolveActor?: GateDeps['resolveActor']): GateDeps {
  return {
    db,
    resolveActor: resolveActor ?? (async () => ANON),
    staticAllowlist: new Map(),
    siteUrl: SITE,
  };
}

const get = (path: string, d: GateDeps): Promise<Response> =>
  handle(new Request(`${SITE}${path}`), d);

describe('escape: title/excerpt/content containing markup and XML-breaking text', () => {
  const payload = '<script>alert(1)</script>]]>"&';
  const db = openDb([
    {
      id: 9,
      title: payload,
      slug: 'esc-9',
      excerpt: '"&<b>',
      content: '</article><script>x</script>',
    },
  ]);

  it('HTML route escapes title, excerpt and content', async () => {
    const res = await get('/p/esc-9', deps(db));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).not.toContain('</article><script>x</script>');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).toContain('&quot;&amp;&lt;b&gt;');
  });

  it('feed escapes the title and does not emit a raw CDATA terminator', async () => {
    const body = await (await get('/feed', deps(db))).text();
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).not.toContain(']]>');
    expect(body).toContain(']]&gt;');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('search escapes the title in its result list', async () => {
    const body = await (await get('/search?q=alert(1)', deps(db))).text();
    expect(body).toContain('href="' + SITE + '/p/esc-9"');
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('search', () => {
  const db = openDb([
    { id: 1, slug: 'alpha-1', title: 'alpha word' },
    { id: 2, slug: 'beta-2', title: 'beta word' },
  ]);

  it('empty or missing q gives 200 with zero results, not 400', async () => {
    for (const path of ['/search', '/search?q=', '/search?q=%20']) {
      const res = await get(path, deps(db));
      const body = await res.text();
      expect(res.status, path).toBe(200);
      expect(body, path).not.toContain('/p/alpha-1');
      expect(body, path).not.toContain('/p/beta-2');
    }
  });

  it('returns only matching visible posts', async () => {
    const body = await (await get('/search?q=alpha', deps(db))).text();
    expect(body).toContain(SITE + '/p/alpha-1');
    expect(body).not.toContain(SITE + '/p/beta-2');
  });

  it('truncates q to 200 characters before searching', async () => {
    const long = 'p'.repeat(200);
    const longDb = openDb([{ id: 8, slug: 'long-8', title: long + 'QQ' }]);
    const res = await get(`/search?q=${long}ZZ`, deps(longDb));
    const body = await res.text();
    expect(body).toContain(SITE + '/p/long-8');
  });
});

describe('feed and sitemap', () => {
  const db = openDb([
    { id: 1, slug: 'one' },
    { id: 2, slug: 'two' },
    { id: 3, slug: null },
    { id: 4, slug: 'hidden', password: 'x' },
  ]);

  it('sitemap lists only visible posts that have a slug', async () => {
    const body = await (await get('/sitemap.xml', deps(db))).text();
    const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${SITE}/p/one`, `${SITE}/p/two`]);
  });

  it('feed is RSS 2.0 and includes visible posts with absolute links', async () => {
    const res = await get('/feed', deps(db));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toMatch(/<rss version="2\.0"/);
    expect(body).toContain(`<link>${SITE}/p/one</link>`);
    expect(body).toContain(`<link>${SITE}/p/two</link>`);
    expect(body).not.toContain('/p/hidden');
  });
});

describe('REST /wp-json/wp/v2/posts', () => {
  const posts: Post[] = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    slug: `r-${i + 1}`,
    modified: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const db = openDb(posts);

  const ids = async (query: string): Promise<number[]> => {
    const res = await get(`/wp-json/wp/v2/posts${query}`, deps(db));
    expect(res.status, query).toBe(200);
    const rows = (await res.json()) as Array<{ id: number }>;
    return rows.map((r) => r.id);
  };

  it('returns only id, slug, title, excerpt, date and link, and no content', async () => {
    const res = await get('/wp-json/wp/v2/posts?per_page=1', deps(db));
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      'date',
      'excerpt',
      'id',
      'link',
      'slug',
      'title',
    ]);
    expect(rows[0]?.date).toBe('2026-04-25T00:00:00Z');
    expect(rows[0]?.link).toBe(`${SITE}/p/r-25`);
  });

  it.each(['per_page=0', 'per_page=101', 'per_page=abc', 'per_page=-1'])(
    'out-of-range or non-numeric %s yields the default of 10 items',
    async (q) => {
      expect(await ids(`?${q}`)).toHaveLength(10);
    },
  );

  it('per_page=100 is accepted as the upper bound', async () => {
    expect(await ids('?per_page=100')).toHaveLength(25);
  });

  it.each(['page=0', 'page=-1', 'page=abc'])('%s behaves as page 1', async (q) => {
    expect(await ids(`?${q}`)).toEqual(await ids('?page=1'));
  });

  it('pages are disjoint and ordered by the visible query', async () => {
    const p1 = await ids('?per_page=5&page=1');
    const p2 = await ids('?per_page=5&page=2');
    expect(p1).toHaveLength(5);
    expect(p2).toHaveLength(5);
    expect(p1.filter((id) => p2.includes(id))).toEqual([]);
  });

  it('a huge page number returns 200 with an empty list instead of 500', async () => {
    const res = await get(`/wp-json/wp/v2/posts?page=${Number.MAX_SAFE_INTEGER}`, deps(db));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('methods', () => {
  const allowlist = new Map([['/assets/app.css', { body: 'a{}', contentType: 'text/css' }]]);
  const paths = [
    '/p/s-1',
    '/feed',
    '/sitemap.xml',
    '/search?q=a',
    '/wp-json/wp/v2/posts',
    '/assets/app.css',
  ];

  it.each(['POST', 'PUT', 'DELETE'])('%s gives 405 with Allow header on every route', async (m) => {
    const d: GateDeps = { ...deps(openDb([{ id: 1 }])), staticAllowlist: allowlist };
    for (const path of paths) {
      const res = await handle(new Request(`${SITE}${path}`, { method: m }), d);
      expect(res.status, `${m} ${path}`).toBe(405);
      expect(res.headers.get('allow'), `${m} ${path}`).toBe('GET, HEAD');
    }
  });

  it('HEAD returns the same headers as GET with an empty body', async () => {
    const d = deps(openDb([{ id: 1, slug: 'h' }]));
    const getRes = await get('/feed', d);
    const headRes = await handle(new Request(`${SITE}/feed`, { method: 'HEAD' }), d);
    expect(headRes.status).toBe(getRes.status);
    expect(headRes.headers.get('cache-control')).toBe(getRes.headers.get('cache-control'));
    expect(headRes.headers.get('x-wpn-class')).toBe('private');
    expect(await headRes.text()).toBe('');
  });
});

describe('response headers', () => {
  const allowlist = new Map([['/assets/app.css', { body: 'a{}', contentType: 'text/css' }]]);
  const d: GateDeps = { ...deps(openDb([{ id: 1, slug: 'h1' }])), staticAllowlist: allowlist };

  it.each([
    '/p/h1',
    '/p/missing',
    '/feed',
    '/sitemap.xml',
    '/search?q=h1',
    '/wp-json/wp/v2/posts',
  ])('dynamic %s is private, no-store, Vary Cookie', async (path) => {
    const res = await get(path, d);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-wpn-class')).toBe('private');
    expect(res.headers.get('vary')).toContain('Cookie');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).not.toContain('public');
  });

  it('static asset is immutable and class static', async () => {
    const res = await get('/assets/app.css', d);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-wpn-class')).toBe('static');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('a{}');
    expect(res.headers.get('content-type')).toContain('text/css');
  });
});

describe('internal errors return a fixed 500', () => {
  const secret = 'SQLITE_SECRET_CONSTRAINT select * from posts';
  const throwingDb = {
    prepare(): never {
      throw new Error(secret);
    },
  } as unknown as DatabaseSync;

  it.each(['/p/x', '/feed', '/sitemap.xml', '/search?q=a', '/wp-json/wp/v2/posts'])(
    '%s: 500 with fixed body and no exception text in body or headers',
    async (path) => {
      const res = await get(path, deps(throwingDb));
      const body = await res.text();
      const headers = JSON.stringify([...res.headers.entries()]);
      expect(res.status).toBe(500);
      expect(body).toBe('Internal Server Error');
      expect(body).not.toContain('SQLITE');
      expect(headers).not.toContain('SQLITE');
      expect(headers).not.toContain('select');
    },
  );

  it('a rejecting resolveActor also yields the fixed 500', async () => {
    const d = deps(openDb([{ id: 1 }]), async () => {
      throw new Error('AUTH_SECRET_TOKEN_LEAK');
    });
    const res = await get('/feed', d);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).toBe('Internal Server Error');
    expect(body).not.toContain('AUTH_SECRET');
  });
});

describe('404 for paths outside the route table', () => {
  it('unknown paths give 404 for every method', async () => {
    const d = deps(openDb([]));
    for (const path of ['/', '/admin', '/wp-admin/']) {
      const res = await get(path, d);
      expect(res.status, path).toBe(404);
    }
  });
});

describe('createHandler', () => {
  it('is a function that returns a handler', () => {
    const h = createHandler(deps(openDb([])));
    expect(typeof h).toBe('function');
  });
});
