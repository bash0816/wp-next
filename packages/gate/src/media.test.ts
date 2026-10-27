// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@wpn/core/canView';
import { createHandler, type GateDeps } from './handler.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '../../db/src/schema.sql'), 'utf8');
const ORIGIN = 'http://x';
const ANON: Actor = { userId: null, caps: new Set() };
const AUTHOR: Actor = { userId: 1, caps: new Set() };
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

interface ParentPost {
  readonly id: number;
  readonly status: string;
  readonly password?: string | null;
  readonly author?: number;
}

interface Attachment {
  readonly id: number;
  readonly mime: string;
  readonly parents: readonly number[];
  /** postmeta `_wp_attached_file` の値。省略時は `files/<id>.bin`、null なら postmeta 行を作らない。 */
  readonly key?: string | null;
  /** false なら store に実体を置かない。 */
  readonly stored?: boolean;
}

interface Fixture {
  readonly parents?: readonly ParentPost[];
  readonly attachments?: readonly Attachment[];
}

type Get = (path: string, init?: RequestInit) => Promise<Response>;

const PUBLIC: ParentPost = { id: 10, status: 'publish' };
const PRIVATE: ParentPost = { id: 11, status: 'private', author: 1 };

function fixture(f: Fixture): { db: DatabaseSync; store: Map<string, Uint8Array> } {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const insPost = db.prepare(
    `INSERT INTO posts (ID, post_author, post_status, post_password, post_type, post_name,
       post_title, post_content, post_excerpt, post_date_gmt, post_modified_gmt, post_mime_type)
     VALUES (?, ?, ?, ?, ?, '', '', '', '', ?, ?, ?)`,
  );
  const insParent = db.prepare(
    'INSERT INTO media_parents (attachment_id, parent_post_id) VALUES (?, ?)',
  );
  const insMeta = db.prepare(
    "INSERT INTO postmeta (post_id, meta_key, meta_value) VALUES (?, '_wp_attached_file', ?)",
  );
  const day = '2026-01-01T00:00:00Z';
  for (const p of f.parents ?? []) {
    insPost.run(p.id, p.author ?? 1, p.status, p.password ?? null, 'post', day, day, '');
  }
  for (const a of f.attachments ?? []) {
    insPost.run(a.id, 1, 'inherit', null, 'attachment', day, day, a.mime);
    for (const parent of a.parents) insParent.run(a.id, parent);
    const key = a.key === undefined ? `files/${a.id}.bin` : a.key;
    if (key !== null) {
      insMeta.run(a.id, key);
      if (a.stored !== false) store.set(key, BYTES);
    }
  }
  return { db, store };
}

function serve(f: Fixture, actor: Actor = ANON): Get {
  const { db, store } = fixture(f);
  const deps: GateDeps = {
    db,
    resolveActor: async () => actor,
    staticAllowlist: new Map(),
    siteUrl: ORIGIN,
    media: { store: { get: async (key: string) => store.get(key) ?? null } },
  };
  const handler = createHandler(deps);
  return (path, init) => handler(new Request(`${ORIGIN}${path}`, init));
}

const MEDIA_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'private, no-store',
  vary: 'Cookie',
  'x-wpn-class': 'private',
  'x-content-type-options': 'nosniff',
};

async function bytesOf(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

async function expectNotFound(res: Response): Promise<void> {
  expect(res.status).toBe(404);
  expect(await res.text()).toBe('Not Found');
}

function snapshot(res: Response, body: string): unknown {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body };
}

describe('GET /media/<id>: visibility (AND over all parents)', () => {
  it('public parent, anonymous: 200 with the stored bytes', async () => {
    const get = serve({ parents: [PUBLIC], attachments: [{ id: 20, mime: 'image/png', parents: [10] }] });
    const res = await get('/media/20');
    expect(res.status).toBe(200);
    expect(await bytesOf(res)).toEqual(BYTES);
  });

  it('two public parents, anonymous: 200', async () => {
    const parents = [PUBLIC, { id: 12, status: 'publish' }];
    const get = serve({ parents, attachments: [{ id: 20, mime: 'image/png', parents: [10, 12] }] });
    expect((await get('/media/20')).status).toBe(200);
  });

  it('zero parents: 404 even though the object exists', async () => {
    const get = serve({ parents: [PUBLIC], attachments: [{ id: 20, mime: 'image/png', parents: [] }] });
    await expectNotFound(await get('/media/20'));
  });

  it('single private parent, anonymous: 404', async () => {
    const get = serve({ parents: [PRIVATE], attachments: [{ id: 20, mime: 'image/png', parents: [11] }] });
    await expectNotFound(await get('/media/20'));
  });

  it('single private parent, author: 200', async () => {
    const get = serve(
      { parents: [PRIVATE], attachments: [{ id: 20, mime: 'image/png', parents: [11] }] },
      AUTHOR,
    );
    const res = await get('/media/20');
    expect(res.status).toBe(200);
    expect(await bytesOf(res)).toEqual(BYTES);
  });

  it('public + private parents, anonymous: 404 (one invisible parent is enough to deny)', async () => {
    const parents = [PUBLIC, PRIVATE];
    const get = serve({ parents, attachments: [{ id: 20, mime: 'image/png', parents: [10, 11] }] });
    await expectNotFound(await get('/media/20'));
  });

  it('password-protected parent, anonymous (not unlocked): 404', async () => {
    const parents: ParentPost[] = [{ id: 13, status: 'publish', password: 'secret' }];
    const get = serve({ parents, attachments: [{ id: 20, mime: 'image/png', parents: [13] }] });
    await expectNotFound(await get('/media/20'));
  });

  it.each([
    ['attachment id does not exist', { parents: [PUBLIC], attachments: [] as Attachment[] }, '/media/999'],
    [
      'postmeta _wp_attached_file missing',
      { parents: [PUBLIC], attachments: [{ id: 20, mime: 'image/png', parents: [10], key: null }] },
      '/media/20',
    ],
    [
      'object missing from store',
      { parents: [PUBLIC], attachments: [{ id: 20, mime: 'image/png', parents: [10], stored: false }] },
      '/media/20',
    ],
  ])('%s: 404', async (_label, f, path) => {
    await expectNotFound(await serve(f)(path));
  });

  it('invisible attachment is byte-identical to a non-existent id (status, headers, body)', async () => {
    const hidden = serve({ parents: [PRIVATE], attachments: [{ id: 20, mime: 'image/png', parents: [11] }] });
    const missing = serve({ parents: [PRIVATE], attachments: [] });
    const a = await hidden('/media/20');
    const aBody = await a.text();
    const b = await missing('/media/20');
    const bBody = await b.text();
    expect(snapshot(a, aBody)).toEqual(snapshot(b, bBody));
    expect(a.status).toBe(404);
    expect(aBody).toBe('Not Found');
  });
});

describe('GET /media/<id>: response headers', () => {
  it('visible response carries private/no-store/Vary/nosniff headers', async () => {
    const get = serve({ parents: [PUBLIC], attachments: [{ id: 20, mime: 'image/png', parents: [10] }] });
    const res = await get('/media/20');
    expect(res.status).toBe(200);
    for (const [name, value] of Object.entries(MEDIA_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });
});

describe('GET /media/<id>: Content-Type allowlist', () => {
  it.each([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'video/mp4',
    'audio/mpeg',
    'application/pdf',
  ])('%s is served with its own Content-Type', async (mime) => {
    const get = serve({ parents: [PUBLIC], attachments: [{ id: 20, mime, parents: [10] }] });
    const res = await get('/media/20');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(mime);
  });

  it.each([
    'image/svg+xml',
    'text/html',
    'application/xhtml+xml',
    'text/xml',
    'application/javascript',
    'application/octet-stream',
  ])('%s is refused with 404 (no dynamic-active types)', async (mime) => {
    const get = serve({ parents: [PUBLIC], attachments: [{ id: 20, mime, parents: [10] }] });
    await expectNotFound(await get('/media/20'));
  });
});

describe('GET /media/<id>: malformed paths', () => {
  const base: Fixture = {
    parents: [PUBLIC],
    attachments: [{ id: 1, mime: 'image/png', parents: [10] }],
  };

  it.each(['/media/abc', '/media/-1', '/media/1.5', '/media/', '/media/1/2'])(
    '%s is 404 even though attachment 1 is visible',
    async (path) => {
      await expectNotFound(await serve(base)(path));
    },
  );
});

describe('methods on /media/<id>', () => {
  const f: Fixture = {
    parents: [PUBLIC],
    attachments: [{ id: 20, mime: 'image/png', parents: [10] }],
  };

  it.each(['POST', 'PUT', 'DELETE'])('%s gives 405', async (method) => {
    const res = await serve(f)('/media/20', { method });
    expect(res.status).toBe(405);
  });

  it('HEAD gives the same headers and status with an empty body', async () => {
    const res = await serve(f)('/media/20', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    for (const [name, value] of Object.entries(MEDIA_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
    expect(await res.text()).toBe('');
  });
});
