// SPDX-License-Identifier: GPL-3.0-only
// D-3d0 STEP4-db: makeQueriesPort(db) の振る舞いテスト(D3d0-01〜05)。
// 実装 queriesPort.ts は未作成のため、import 解決失敗(収集失敗)で全体が Red になる想定。
// 期待値は fixtures 由来の S0 ID 列(D3b1-11 と同じ [7,5,1])・mainStates の S1 定義・DB の生値から取る。
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDumpDb } from './dumpDb.js';
import { addPost, applyS1 } from './mainStates.js';
import { makeQueriesPort } from './queriesPort.js';
import { queryPosts } from './queryPosts.js';

// 型検査を通しつつ、不正入力(unknown)を実行時に渡すための窓口。
type LooseQueriesPort = {
  queryPosts(spec: unknown): Array<{ post: { id: number } }>;
  latestPosts(spec: unknown): Array<Record<string, unknown>>;
};
const loose = (db: DatabaseSync): LooseQueriesPort =>
  makeQueriesPort(db) as unknown as LooseQueriesPort;

// queryPosts.test.ts の spec() と同じ既定の一覧 spec(S0 で [7,5,1] を返す形)。
const validQuery: Record<string, unknown> = {
  postType: 'post',
  perPage: 4,
  pages: 0,
  offset: 0,
  order: 'desc',
  orderBy: 'date',
  author: '',
  search: '',
  exclude: [],
  sticky: '',
  inherit: false,
  taxQuery: null,
  parents: [],
};

const slugsOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.slug as string);

// DB の生値(post_title)を直接読む。ポートが返す title がこの値と一致することを確認するため。
const rawTitle = (db: DatabaseSync, name: string): string => {
  const row = db
    .prepare('SELECT post_title AS title FROM posts WHERE post_name = ?')
    .get(name) as { title: string } | undefined;
  if (row === undefined) throw new Error(`fixture 投稿が見つからない: ${name}`);
  return row.title;
};

const S0_DESC = ['fixture-two-nested', 'spike-blocks', 'hello-world'];

describe('makeQueriesPort.latestPosts (D3d0-01)', () => {
  it('D3d0-01: S0 で limit 5 desc は fixture-two-nested, spike-blocks, hello-world の順、title は DB 生値、isProtected は false', () => {
    const db = openDumpDb();
    const rows = loose(db).latestPosts({ limit: 5, order: 'desc' });
    expect(slugsOf(rows)).toEqual(S0_DESC);
    for (const row of rows) {
      const slug = row.slug as string;
      expect(row.title).toBe(rawTitle(db, slug));
      expect(row.isProtected).toBe(false);
    }
  });

  it('D3d0-01: S0 で order asc は desc の逆順を返す', () => {
    const db = openDumpDb();
    const asc = loose(db).latestPosts({ limit: 5, order: 'asc' });
    expect(slugsOf(asc)).toEqual([...S0_DESC].reverse());
  });

  it('D3d0-01: S0 で limit 1 は先頭 1 件だけを返す', () => {
    const db = openDumpDb();
    const rows = loose(db).latestPosts({ limit: 1, order: 'desc' });
    expect(slugsOf(rows)).toEqual(['fixture-two-nested']);
  });
});

describe('makeQueriesPort.latestPosts 保護混在 (D3d0-02)', () => {
  it('D3d0-02: S1 で保護投稿 m-prot は isProtected true で含まれ、draft/private/future は含まれない', () => {
    const db = openDumpDb();
    applyS1(db);
    const rows = loose(db).latestPosts({ limit: 100, order: 'desc' });
    const slugs = slugsOf(rows);
    expect(slugs).toContain('m-prot');
    const prot = rows.find((r) => r.slug === 'm-prot');
    expect(prot?.isProtected).toBe(true);
    for (const hidden of ['m-draft', 'm-priv', 'm-fut']) {
      expect(slugs).not.toContain(hidden);
    }
  });

  it('D3d0-02: 戻り値の各オブジェクトのキーはちょうど slug/title/isProtected で、パスワードと本文を含まない', () => {
    const db = openDumpDb();
    applyS1(db);
    const rows = loose(db).latestPosts({ limit: 100, order: 'desc' });
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['isProtected', 'slug', 'title']);
    }
    const json = JSON.stringify(rows);
    expect(json).not.toContain('SECRET-PW-S1');
    expect(json).not.toContain('SECRET-BODY-S1');
  });
});

describe('makeQueriesPort.latestPosts 入力検証 (D3d0-03)', () => {
  const db = openDumpDb();
  const port = loose(db);

  it.each([
    ['limit 0', { limit: 0, order: 'desc' }],
    ['limit 101', { limit: 101, order: 'desc' }],
    ['limit 1.5', { limit: 1.5, order: 'desc' }],
    ['limit が文字列 "3"', { limit: '3', order: 'desc' }],
    ['limit が null', { limit: null, order: 'desc' }],
    ['order 大文字 DESC', { limit: 5, order: 'DESC' }],
    ['order random', { limit: 5, order: 'random' }],
    ['order undefined', { limit: 5, order: undefined }],
    ['未知キー追加', { limit: 5, order: 'desc', extra: 1 }],
    ['キー欠落 (order なし)', { limit: 5 }],
    ['キー欠落 (limit なし)', { order: 'desc' }],
    ['spec が null', null],
    ['spec が配列', [5, 'desc']],
    ['spec が文字列', 'desc'],
  ])('D3d0-03: %s は RangeError', (_label, bad) => {
    expect(() => port.latestPosts(bad)).toThrow(RangeError);
  });
});

describe('makeQueriesPort.queryPosts 委譲 (D3d0-04)', () => {
  it('D3d0-04: S0 で queryPosts(validSpec) は queryPosts(db, validSpec) と同じ ID 列 [7,5,1] を返す', () => {
    const db = openDumpDb();
    const viaPort = loose(db).queryPosts(validQuery).map((i) => i.post.id);
    const direct = queryPosts(db, validQuery).map((i) => i.post.id);
    expect(viaPort).toEqual([7, 5, 1]);
    expect(viaPort).toEqual(direct);
  });

  it('D3d0-04: 不正な spec(perPage 0・未知キー・null)は RangeError', () => {
    const db = openDumpDb();
    const port = loose(db);
    expect(() => port.queryPosts({ ...validQuery, perPage: 0 })).toThrow(RangeError);
    expect(() => port.queryPosts({ ...validQuery, extra: 1 })).toThrow(RangeError);
    expect(() => port.queryPosts(null)).toThrow(RangeError);
  });
});

describe('makeQueriesPort 束縛 (D3d0-05)', () => {
  it('D3d0-05: 別々の DB から作ったポートは互いの内容を返さない', () => {
    const dbA = openDumpDb();
    const dbB = openDumpDb();
    applyS1(dbB);
    addPost(dbB, {
      id: 90,
      title: 'bind-only-b',
      name: 'bind-only-b',
      date: '2026-10-30 00:00:00',
      status: 'publish',
    });

    const portA = loose(dbA);
    const portB = loose(dbB);

    const slugsA = slugsOf(portA.latestPosts({ limit: 100, order: 'desc' }));
    const slugsB = slugsOf(portB.latestPosts({ limit: 100, order: 'desc' }));

    expect(slugsB).toContain('bind-only-b');
    expect(slugsB).toContain('m-prot');
    expect(slugsA).not.toContain('bind-only-b');
    expect(slugsA).not.toContain('m-prot');
    expect(slugsA).toEqual(S0_DESC);

    const idsA = portA.queryPosts(validQuery).map((i) => i.post.id);
    expect(idsA).not.toContain(90);
    expect(idsA).toEqual([7, 5, 1]);
  });
});
