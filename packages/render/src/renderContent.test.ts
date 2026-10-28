// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { extractEntryContent, htmlEquals, normalizeHtml } from './normalizeDom.js';
import { renderBlocks, UnsupportedBlockError } from './renderBlocks.js';
import { renderContent } from './renderContent.js';

const FIXTURES = new URL('../../../fixtures/ref/', import.meta.url);
const SCHEMA = new URL('../../db/src/schema.sql', import.meta.url);
const SITE_URL = 'http://127.0.0.1:8080';

type Row = Record<string, string | number>;

function readFixture(relPath: string): string {
  return readFileSync(new URL(relPath, FIXTURES), 'utf8');
}

// 可視性混在の基準行(fixtures/ref/latest-posts/mixed-posts.json)
const mixedRows = JSON.parse(readFixture('latest-posts/mixed-posts.json')) as Row[];

// ID 1, 5, 7 は fixtures/ref/db/dump.sql の wp_posts 行。
// 公開行(ID 16)を雛形にし、フィクスチャ由来の列(ID / 日付 / タイトル / slug)だけを差し替える。
const publishedTemplate = mixedRows.find((r) => Number(r.ID) === 16);
if (publishedTemplate === undefined) {
  throw new Error('fixture row ID 16 missing');
}
const dumpRows: Row[] = [
  {
    ...publishedTemplate,
    ID: 1,
    post_date_gmt: '2026-10-27 22:51:42',
    post_title: 'Hello world!',
    post_name: 'hello-world',
    post_password: '',
  },
  {
    ...publishedTemplate,
    ID: 5,
    post_date_gmt: '2026-10-27 23:26:10',
    post_title: 'スパイク用ページ',
    post_name: 'spike-blocks',
    post_password: '',
  },
  {
    ...publishedTemplate,
    ID: 7,
    post_date_gmt: '2026-10-27 23:38:31',
    post_title: '入れ子 & <特殊> "文字"',
    post_name: 'fixture-two-nested',
    post_password: '',
  },
];

function openDb(onlyIds?: number[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA, 'utf8'));
  const columns = new Set(
    (db.prepare('PRAGMA table_info(posts)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  for (const row of [...mixedRows, ...dumpRows]) {
    if (onlyIds !== undefined && !onlyIds.includes(Number(row.ID))) continue;
    // テーブルに存在する列だけを、行データのキー順で挿入する
    const keys = Object.keys(row).filter((k) => columns.has(k));
    const sql = `INSERT INTO posts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    const values: SQLInputValue[] = keys.map((k) => {
      const v = row[k];
      return typeof v === 'number' ? v : String(v);
    });
    db.prepare(sql).run(...values);
  }
  return db;
}

describe('renderContent: core/latest-posts', () => {
  it('既定属性(postsToShow 5, desc)の出力が default.html と一致する', () => {
    const db = openDb();
    const actual = renderContent('<!-- wp:latest-posts /-->', { db, siteUrl: SITE_URL });
    expect(normalizeHtml(actual)).toBe(normalizeHtml(readFixture('latest-posts/default.html')));
    db.close();
  });

  it('postsToShow:1 の出力が one.html と一致する', () => {
    const db = openDb();
    const actual = renderContent('<!-- wp:latest-posts {"postsToShow":1} /-->', {
      db,
      siteUrl: SITE_URL,
    });
    expect(normalizeHtml(actual)).toBe(normalizeHtml(readFixture('latest-posts/one.html')));
    db.close();
  });

  it('order:asc, postsToShow:2 の出力が asc.html と一致する', () => {
    const db = openDb();
    const actual = renderContent('<!-- wp:latest-posts {"postsToShow":2,"order":"asc"} /-->', {
      db,
      siteUrl: SITE_URL,
    });
    expect(normalizeHtml(actual)).toBe(normalizeHtml(readFixture('latest-posts/asc.html')));
    db.close();
  });
});

describe('renderContent: 既存ブロックの回帰', () => {
  it('latest-posts 行を除いた静的ブロックは renderBlocks と同一の出力になる', () => {
    const db = openDb();
    const staticOnly = readFixture('spike-blocks.post_content.html')
      .split('\n')
      .filter((line) => !line.includes('wp:latest-posts'))
      .join('\n');
    expect(renderContent(staticOnly, { db, siteUrl: SITE_URL })).toBe(renderBlocks(staticOnly));
    db.close();
  });

  it('spike-blocks の全 post_content(latest-posts 含む)が基準 WP の entry-content と一致する', () => {
    // 基準取得時の DB は ID 1,5,7 のみ(postsToShow:3 → 7,5,1)
    const db = openDb([1, 5, 7]);
    const actual = renderContent(readFixture('spike-blocks.post_content.html'), { db, siteUrl: SITE_URL });
    expect(htmlEquals(actual, extractEntryContent(readFixture('spike-blocks.html')))).toBe(true);
    db.close();
  });

  it('許可リストにない動的ブロックは UnsupportedBlockError を投げる', () => {
    const db = openDb();
    expect(() => renderContent('<!-- wp:archives /-->', { db, siteUrl: SITE_URL })).toThrow(
      UnsupportedBlockError,
    );
    db.close();
  });
});

describe('renderContent: latest-posts の堅牢性', () => {
  it('postsToShow が範囲外でも例外にせず 1〜100 に丸める', () => {
    const db = openDb();
    const ctx = { db, siteUrl: SITE_URL };
    expect(() => renderContent('<!-- wp:latest-posts {"postsToShow":0} /-->', ctx)).not.toThrow();
    expect(() => renderContent('<!-- wp:latest-posts {"postsToShow":9999} /-->', ctx)).not.toThrow();
    const one = renderContent('<!-- wp:latest-posts {"postsToShow":0} /-->', ctx);
    expect((one.match(/<li>/g) ?? []).length).toBe(1);
    db.close();
  });

  it('タイトルに混入したスクリプト・イベント属性は出力に残らない', () => {
    const db = openDb();
    db.prepare("UPDATE posts SET post_title = ? WHERE ID = 7").run(
      '<script>alert(1)</script><img src=x onerror=alert(2)>悪意',
    );
    const out = renderContent('<!-- wp:latest-posts {"postsToShow":1} /-->', { db, siteUrl: SITE_URL });
    expect(out).not.toMatch(/<script|onerror|alert\(/i);
    expect(out).toContain('悪意');
    db.close();
  });
});
