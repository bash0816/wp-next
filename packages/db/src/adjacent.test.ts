// SPDX-License-Identifier: GPL-3.0-only
// D3e: content.adjacent(dir) の実装仕様テスト。
// 仕様: (post_date_gmt, ID) の辞書順で、post_type='post' かつ publish(保護を含む)の直近 1 件を返す。
//   previous = 基準より前で最も近い / next = 基準より後で最も近い。該当なしは null。
//   返す title は DB の生値、url は `<home>/<encodeURIComponent(post_name)>/`。
//   同 post_date_gmt の別の公開投稿が存在すれば両方向で UnsupportedDataError。dir 不正は RangeError。
// 現状: postData.ts の adjacent は UnsupportedDataError を投げる stub。以下の Red 理由は各 it に記す。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDumpDb } from './dumpDb.js';
import { addPost, applyS1, applyS2 } from './mainStates.js';
import { openCurrentPost } from './currentPost.js';
import { queryPosts } from './queryPosts.js';
import { UnsupportedDataError } from './postData.js';

const here = dirname(fileURLToPath(import.meta.url));
const REGIONS = join(here, '../../../fixtures/ref/regions');
const SET_MAIN2 = join(here, '../../../fixtures/ref/set-main2');
const HOME = 'http://127.0.0.1:8080';

/** fixture の nav リンク(rel="prev|next")の href を取り出す。title は接頭辞や wptexturize 前の生値と比べないため使わない。 */
function fixtureNavHref(file: string, rel: 'prev' | 'next'): string {
  const html = readFileSync(file, 'utf8');
  const m = new RegExp(`<a href="([^"]+)" rel="${rel}">`).exec(html);
  if (!m) throw new Error(`fixture に rel="${rel}" がない: ${file}`);
  return m[1]!;
}

describe('D3e-01 S0 の post 5 から previous / next を取得', () => {
  // 検出対象: 直近の公開投稿が正しく選ばれ、title は DB 生値、url は home + post_name になること。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる(戻り値 null/object にならない)。
  it('previous は Hello world!、next は入れ子の投稿(title は DB 生値)', () => {
    const db = openDumpDb();
    const r = openCurrentPost(db, { id: 5 });
    expect(r, '前提: 投稿 5 は公開・非保護で開けること').not.toBeNull();

    // fixture の href と仕様の URL が一致することを先に確認する(期待値の取り違え防止)。
    expect(fixtureNavHref(join(REGIONS, 'main-01.html'), 'prev')).toBe(`${HOME}/hello-world/`);
    expect(fixtureNavHref(join(REGIONS, 'main-01.html'), 'next')).toBe(`${HOME}/fixture-two-nested/`);

    expect(r!.content.adjacent('previous')).toEqual({ title: 'Hello world!', url: `${HOME}/hello-world/` });
    // title は DB の生値(straight quote)。fixture の &#8220; 等は wptexturize 後の表示なので比較に使わない。
    expect(r!.content.adjacent('next')).toEqual({
      title: '入れ子 & <特殊> "文字"',
      url: `${HOME}/fixture-two-nested/`,
    });
  });
});

/** 公開投稿の content を開く(前提として開けることを確認する)。 */
type Content = NonNullable<ReturnType<typeof openCurrentPost>>['content'];

/** queryPosts 用の spec(contentPorts.test.ts と同じ既定値)。 */
function spec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { postType: 'post', perPage: 4, pages: 0, offset: 0, order: 'desc', orderBy: 'date', author: '', search: '', exclude: [], sticky: '', inherit: false, taxQuery: null, parents: [], ...over };
}

function contentOf(db: DatabaseSync, id: number): Content {
  const r = openCurrentPost(db, { id });
  expect(r, `前提: 投稿 ${id} は公開・非保護で開けること`).not.toBeNull();
  return r!.content;
}

describe('D3e-02 境界: 最古の投稿の previous / 最新の投稿の next は null', () => {
  // 検出対象: 該当なしで null を返すこと(例外や別投稿へのフォールバックをしないこと)。
  // Red 理由: adjacent が未実装で stub が UnsupportedDataError を投げるため null にならない。
  it('post 1(最古の公開投稿)の previous は null', () => {
    const db = openDumpDb();
    expect(contentOf(db, 1).adjacent('previous')).toBeNull();
  });
  it('post 7(最新の公開投稿)の next は null', () => {
    const db = openDumpDb();
    expect(contentOf(db, 7).adjacent('next')).toBeNull();
  });
});

describe('D3e-03 S1: 保護投稿は候補、draft / private / future は除外', () => {
  // 検出対象: 保護投稿 22 が next 候補になること。23(draft)・24(private)・25(future) は
  //   いずれも post 5 の後(23:26:15〜25)にあり、除外が効かなければ next になるため検出力がある。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる。
  it('post 5 の next は保護投稿 M-prot、previous は Hello world!', () => {
    const db = openDumpDb();
    applyS1(db);
    expect(fixtureNavHref(join(SET_MAIN2, 'main.mixed-status-protected-adjacent.html'), 'next')).toBe(`${HOME}/m-prot/`);
    const c = contentOf(db, 5);
    expect(c.adjacent('next')).toEqual({ title: 'M-prot', url: `${HOME}/m-prot/` });
    expect(c.adjacent('previous')).toEqual({ title: 'Hello world!', url: `${HOME}/hello-world/` });
  });
});

describe('D3e-04 S2: 同一 post_date_gmt の公開投稿が基準にあると両方向で UnsupportedDataError', () => {
  // 回帰ガード(Green-now): 26 / 27 は同時刻 23:40:00 の別公開投稿があるため、stub の全例外でも一致する。
  it('[Green-now 回帰ガード] post 26 / 27 は previous も next も UnsupportedDataError', () => {
    const db = openDumpDb();
    applyS2(db);
    for (const id of [26, 27]) {
      const c = contentOf(db, id);
      expect(() => c.adjacent('previous'), `post ${id} previous`).toThrow(UnsupportedDataError);
      expect(() => c.adjacent('next'), `post ${id} next`).toThrow(UnsupportedDataError);
    }
  });

  // 検出対象: 同時刻が存在しない基準(28 / 5)は例外にならず値を返すこと(過剰な例外を検出する)。
  // Red 理由: stub が全方向で UnsupportedDataError を投げるため値が返らない。
  it('post 28 は previous=tie-a2(27)、next=class-c2(29) を返す', () => {
    const db = openDumpDb();
    applyS2(db);
    const c = contentOf(db, 28);
    expect(c.adjacent('previous')).toEqual({ title: 'tieA2', url: `${HOME}/tie-a2/` });
    expect(c.adjacent('next')).toEqual({ title: 'classC2', url: `${HOME}/class-c2/` });
  });
  it('post 5 は S2 後も previous=Hello world!、next=入れ子(7)を返す', () => {
    const db = openDumpDb();
    applyS2(db);
    const c = contentOf(db, 5);
    expect(c.adjacent('previous')).toEqual({ title: 'Hello world!', url: `${HOME}/hello-world/` });
    expect(c.adjacent('next')).toEqual({ title: '入れ子 & <特殊> "文字"', url: `${HOME}/fixture-two-nested/` });
  });
});

describe('D3e-05 page / wp_navigation / revision / attachment は候補にならない', () => {
  // 検出対象: post 5 の前後に非 post 型の行を置いても、post_type='post' の公開投稿だけが選ばれること。
  //   追加の 30(page)・31(attachment)・32(wp_navigation) は 5 の直後に置く。
  //   S0 の revision 6(23:26:26) と navigation 4(22:52:10) も同じ理由で候補外。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる。
  it('非 post 型は next / previous に現れない', () => {
    const db = openDumpDb();
    addPost(db, { id: 30, title: 'pg-new', name: 'pg-new', date: '2026-10-27 23:26:30', status: 'publish', type: 'page' });
    addPost(db, { id: 31, title: 'att-new', name: 'att-new', date: '2026-10-27 23:26:40', status: 'inherit', type: 'attachment' });
    addPost(db, { id: 32, title: 'nav-new', name: 'nav-new', date: '2026-10-27 23:26:50', status: 'publish', type: 'wp_navigation' });
    const c = contentOf(db, 5);
    expect(c.adjacent('next')).toEqual({ title: '入れ子 & <特殊> "文字"', url: `${HOME}/fixture-two-nested/` });
    expect(c.adjacent('previous')).toEqual({ title: 'Hello world!', url: `${HOME}/hello-world/` });
  });
});

describe('D3e-06 queryPosts の item に束縛され、保護投稿の secret を漏らさない', () => {
  // 検出対象: item 22(保護)の adjacent が item 自身を基準にすること(post 5 の結果と取り違えない)。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる。
  it('queryPosts の item 22 の previous は spike-blocks(5)、next は入れ子(7)', () => {
    const db = openDumpDb();
    applyS1(db);
    const items = queryPosts(db, spec({ perPage: 10 }));
    const item = items.find((i) => i.post.id === 22);
    expect(item, '前提: queryPosts に保護投稿 22 が含まれること').toBeDefined();
    expect(item!.content.adjacent('previous')).toEqual({ title: 'スパイク用ページ', url: `${HOME}/spike-blocks/` });
    expect(item!.content.adjacent('next')).toEqual({ title: '入れ子 & <特殊> "文字"', url: `${HOME}/fixture-two-nested/` });
  });

  // 検出対象: 保護投稿 22 が next として返るとき、戻り値は title/url のみで secret(パスワード・本文)を含まないこと。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる。
  it('保護投稿 22 が next の戻り値に、keys は title/url のみで SECRET- を含まない', () => {
    const db = openDumpDb();
    applyS1(db);
    const next = contentOf(db, 5).adjacent('next');
    expect(next).not.toBeNull();
    expect(Object.keys(next!).sort()).toEqual(['title', 'url']);
    expect(JSON.stringify(next)).not.toContain('SECRET-');
  });
});

describe('D3e-07 dir が不正なら RangeError', () => {
  // 検出対象: 'prev' / 'NEXT'(大文字小文字を区別) / undefined / null を RangeError で拒否すること。
  // Red 理由: adjacent が未実装で stub が UnsupportedDataError を投げるため RangeError にならない。
  it.each([['prev'], ['NEXT'], [undefined], [null]])('dir=%s は RangeError', (dir) => {
    const db = openDumpDb();
    const c = contentOf(db, 5) as unknown as { adjacent(d: unknown): unknown };
    expect(() => c.adjacent(dir)).toThrow(RangeError);
  });
});

describe('D3e-08 1 秒差の隣接投稿', () => {
  // 検出対象: 秒単位の差で前後が正しく選ばれること(日時の丸め・文字列比較の誤りを検出する)。
  // Red 理由: adjacent が未実装で UnsupportedDataError を投げる。
  it('post 5 の 1 秒前(23:26:09)と 1 秒後(23:26:11)の投稿を取る', () => {
    const db = openDumpDb();
    addPost(db, { id: 30, title: 'one-sec-before', name: 'one-sec-before', date: '2026-10-27 23:26:09', status: 'publish' });
    addPost(db, { id: 31, title: 'one-sec-after', name: 'one-sec-after', date: '2026-10-27 23:26:11', status: 'publish' });
    const c = contentOf(db, 5);
    expect(c.adjacent('previous')).toEqual({ title: 'one-sec-before', url: `${HOME}/one-sec-before/` });
    expect(c.adjacent('next')).toEqual({ title: 'one-sec-after', url: `${HOME}/one-sec-after/` });
  });
});

// D3e-01 補強(STEP6 mutation 生存): 隣接投稿の URL は slug を encodeURIComponent する。
import { addPost as _addPost, relate as _relate } from './mainStates.js';
import { openDumpDb as _openDumpDb } from './dumpDb.js';
import { openCurrentPost as _openCurrentPost } from './currentPost.js';
describe('adjacent の URL エンコード', () => {
  it('D3e-01: slug の空白と % がエンコードされる', () => {
    const db = _openDumpDb();
    _addPost(db, { id: 70, title: 'enc', name: 'a b%c', date: '2026-10-27 23:30:00', status: 'publish' });
    _relate(db, 70, 1);
    const opened = _openCurrentPost(db, { slug: 'spike-blocks' })!;
    expect(opened.content.adjacent('next')).toEqual({ title: 'enc', url: 'http://127.0.0.1:8080/a%20b%25c/' });
  });
});
