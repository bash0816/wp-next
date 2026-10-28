// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { selectLatestPublishedPosts } from './latestPosts.js';

const here = dirname(fileURLToPath(import.meta.url));

type Row = Record<string, string | number>;

// 可視性混在の基準行(fixtures/ref/latest-posts/mixed-posts.json)
const mixedRows = JSON.parse(
  readFileSync(join(here, '../../../fixtures/ref/latest-posts/mixed-posts.json'), 'utf8'),
) as Row[];

// ID 1, 5, 7 は fixtures/ref/db/dump.sql の wp_posts 行(post_date_gmt / post_title / post_name)
const dumpRows: Row[] = [
  {
    ID: 1,
    post_author: 1,
    post_date_gmt: '2026-10-27 22:51:42',
    post_title: 'Hello world!',
    post_excerpt: '',
    post_content: '',
    post_status: 'publish',
    post_password: '',
    post_name: 'hello-world',
    post_type: 'post',
    post_modified_gmt: '2026-10-27 22:51:42',
    auth_version: 1,
  },
  {
    ID: 5,
    post_author: 1,
    post_date_gmt: '2026-10-27 23:26:10',
    post_title: 'スパイク用ページ',
    post_excerpt: '',
    post_content: '',
    post_status: 'publish',
    post_password: '',
    post_name: 'spike-blocks',
    post_type: 'post',
    post_modified_gmt: '2026-10-27 23:26:10',
    auth_version: 1,
  },
  {
    ID: 7,
    post_author: 1,
    post_date_gmt: '2026-10-27 23:38:31',
    post_title: '入れ子 & <特殊> "文字"',
    post_excerpt: '',
    post_content: '',
    post_status: 'publish',
    post_password: '',
    post_name: 'fixture-two-nested',
    post_type: 'post',
    post_modified_gmt: '2026-10-27 23:38:31',
    auth_version: 1,
  },
];

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const insert = db.prepare(`
    INSERT INTO posts (ID, post_author, post_date_gmt, post_title, post_excerpt, post_content,
      post_status, post_password, post_name, post_type, post_modified_gmt, auth_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of [...mixedRows, ...dumpRows]) {
    insert.run(
      Number(r.ID),
      Number(r.post_author),
      String(r.post_date_gmt),
      String(r.post_title),
      String(r.post_excerpt),
      String(r.post_content),
      String(r.post_status),
      String(r.post_password),
      String(r.post_name),
      String(r.post_type),
      String(r.post_modified_gmt),
      Number(r.auth_version ?? 1),
    );
  }
  return db;
}

/** 期待値は行データ(フィクスチャ)から導出し、slug の並びだけを仕様として明示する */
function expectedFor(slugs: string[]) {
  const all = [...mixedRows, ...dumpRows];
  return slugs.map((slug) => {
    const row = all.find((r) => r.post_name === slug);
    if (!row) throw new Error(`fixture missing: ${slug}`);
    return {
      id: Number(row.ID),
      slug,
      title: String(row.post_title),
      isProtected: String(row.post_password) !== '',
    };
  });
}

describe('selectLatestPublishedPosts', () => {
  it('default 相当(limit 5, desc)で公開投稿を日付降順・5件返す', () => {
    const db = openDb();
    const result = selectLatestPublishedPosts(db, { limit: 5, order: 'desc' });
    expect(result).toEqual(
      expectedFor(['fixture-two-nested', 'mx-public-new', 'spike-blocks', 'hello-world', 'mx-protected']),
    );
    db.close();
  });

  it('private / draft / future を結果から除外する', () => {
    const db = openDb();
    const slugs = selectLatestPublishedPosts(db, { limit: 100, order: 'desc' }).map((p) => p.slug);
    for (const hidden of ['mx-private', 'mx-draft', 'mx-future']) {
      expect(slugs).not.toContain(hidden);
    }
    expect(slugs).toHaveLength(5);
    db.close();
  });

  it('パスワード付き投稿を含め isProtected を正しく設定する', () => {
    const db = openDb();
    const result = selectLatestPublishedPosts(db, { limit: 100, order: 'desc' });
    const protectedSlugs = result.filter((p) => p.isProtected).map((p) => p.slug);
    const openSlugs = result.filter((p) => !p.isProtected).map((p) => p.slug);
    expect(protectedSlugs).toEqual(['mx-protected']);
    expect(openSlugs).toEqual(['fixture-two-nested', 'mx-public-new', 'spike-blocks', 'hello-world']);
    db.close();
  });

  it('order asc と limit 2 で古い順に 2 件返す', () => {
    const db = openDb();
    const result = selectLatestPublishedPosts(db, { limit: 2, order: 'asc' });
    expect(result).toEqual(expectedFor(['mx-protected', 'hello-world']));
    db.close();
  });

  it('limit が 1 未満・100 超・非整数なら RangeError を投げ、境界値 1 と 100 は受理する', () => {
    const db = openDb();
    expect(() => selectLatestPublishedPosts(db, { limit: 0, order: 'desc' })).toThrow(RangeError);
    expect(() => selectLatestPublishedPosts(db, { limit: 101, order: 'desc' })).toThrow(RangeError);
    expect(() => selectLatestPublishedPosts(db, { limit: 1.5, order: 'desc' })).toThrow(RangeError);
    expect(selectLatestPublishedPosts(db, { limit: 1, order: 'desc' })).toHaveLength(1);
    expect(selectLatestPublishedPosts(db, { limit: 100, order: 'desc' })).toHaveLength(5);
    db.close();
  });

  it('返却オブジェクトに content / password 系のキーを含まない', () => {
    const db = openDb();
    const result = selectLatestPublishedPosts(db, { limit: 100, order: 'desc' });
    for (const post of result) {
      expect(Object.keys(post).sort()).toEqual(['id', 'isProtected', 'slug', 'title']);
    }
    db.close();
  });
});
