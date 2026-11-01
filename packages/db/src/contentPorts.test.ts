// SPDX-License-Identifier: GPL-3.0-only
// D3c1: content ポート(terms / author / hasThumbnail)の実装仕様テスト。
// 注意: 現状の buildContentPort は 1 引数で、terms/author/hasThumbnail は UnsupportedDataError を投げる stub。
// そのため「UnsupportedDataError を期待する」ケースは stub でも Green になる(回帰ガード)。
// 各ケースに「Red 理由」または「Green-now(回帰ガード)」を明記する。
import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { ContentPort } from '@wpn/core/ports';
import { insertRow, openDumpDb, updateRow } from './dumpDb.js';
import { addTerm, applyS1, applyS2, applyS3, relate } from './mainStates.js';
import { openCurrentPost } from './currentPost.js';
import { queryPosts } from './queryPosts.js';
import { UnsupportedDataError, buildContentPort, type PostRowForCtx } from './postData.js';

const HOME = 'http://127.0.0.1:8080';

function spec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...over,
  };
}

/** 公開投稿の content を開く。前提(開けること)を先に確認する。 */
function contentOf(db: DatabaseSync, id: number): ContentPort {
  const r = openCurrentPost(db, { id });
  expect(r, `前提: 投稿 ${id} は公開・非保護で開けること`).not.toBeNull();
  return r!.content;
}

/** 関数が投げた例外を返す(投げなければ null)。 */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

describe('D3c1-01 terms: category / post_tag の基本(S0 投稿 5)', () => {
  it('前提: 投稿 5 は Uncategorized(tt 1)に紐づく', () => {
    const db = openDumpDb();
    const rows = db
      .prepare(
        `SELECT t.name AS name FROM term_relationships tr
           JOIN term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
           JOIN terms t ON t.term_id = tt.term_id
          WHERE tr.object_id = 5 AND tt.taxonomy = 'category'`,
      )
      .all();
    expect(rows).toEqual([{ name: 'Uncategorized' }]);
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる(実装未了)。
  it('terms("category") は Uncategorized の {name, slug, url} を返す', () => {
    const c = contentOf(openDumpDb(), 5);
    expect(c.terms('category')).toEqual([
      { name: 'Uncategorized', slug: 'uncategorized', url: `${HOME}/category/uncategorized/` },
    ]);
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる(実装未了)。
  it('terms("post_tag") はタグなしで空配列を返す', () => {
    const c = contentOf(openDumpDb(), 5);
    expect(c.terms('post_tag')).toEqual([]);
  });
});

describe('D3c1-02 terms: 複数件・タグ・name 順ソート', () => {
  // Red 理由: 現状 stub が UnsupportedDataError を投げる。
  it('S2 投稿 28 の category は name 昇順(Alpha, Zeta)で url 付き', () => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    expect(terms28(db)).toEqual([
      { name: 'Alpha', slug: 'alpha', url: `${HOME}/category/alpha/` },
      { name: 'Zeta', slug: 'zeta', url: `${HOME}/category/zeta/` },
    ]);
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる。
  it('S2 投稿 29 の post_tag は t-one、category は Uncategorized のみ', () => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    const c = contentOf(db, 29);
    expect(c.terms('post_tag')).toEqual([{ name: 't-one', slug: 't-one', url: `${HOME}/tag/t-one/` }]);
    expect(c.terms('category')).toEqual([
      { name: 'Uncategorized', slug: 'uncategorized', url: `${HOME}/category/uncategorized/` },
    ]);
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる。name 順と slug 順の不一致を検出する。
  it('name 昇順で並ぶ(slug 順ではない): Bravo(aa) と Alpha(zz) は Alpha が先', () => {
    const db = openDumpDb();
    addTerm(db, 6, 'Bravo', 'aa', 'category');
    addTerm(db, 7, 'Alpha', 'zz', 'category');
    relate(db, 5, 6);
    relate(db, 5, 7);
    expect(contentOf(db, 5).terms('category')).toEqual([
      { name: 'Alpha', slug: 'zz', url: `${HOME}/category/zz/` },
      { name: 'Bravo', slug: 'aa', url: `${HOME}/category/aa/` },
      { name: 'Uncategorized', slug: 'uncategorized', url: `${HOME}/category/uncategorized/` },
    ]);
  });
});

function terms28(db: DatabaseSync): unknown {
  return contentOf(db, 28).terms('category');
}

describe('D3c1-03 terms: 異常系', () => {
  // Red 理由: 現状 stub は UnsupportedDataError を投げ、RangeError ではない(引数検証が未実装)。
  it.each([
    ['post_format', 'post_format'],
    ['link_category', 'link_category'],
    ['x', 'x'],
    ['undefined', undefined],
  ])('taxonomy=%s は RangeError', (_label, value) => {
    const c = contentOf(openDumpDb(), 5);
    const err = thrownBy(() => (c.terms as (t: unknown) => unknown)(value));
    expect(err).toBeInstanceOf(RangeError);
    expect(err).not.toBeInstanceOf(UnsupportedDataError);
  });

  // Green-now(回帰ガード): 現状 stub が常に UnsupportedDataError を投げるため通る。
  // 実装後に「親なしなら返る」の正の対照(下の Red テスト)と組み合わせて初めて識別力を持つ。
  it('カテゴリに親(parent=1)がある場合は UnsupportedDataError', () => {
    const db = openDumpDb();
    addTerm(db, 6, 'Child', 'child', 'category');
    updateRow(db, 'term_taxonomy', 'term_taxonomy_id', 6, { parent: 1 });
    relate(db, 5, 6);
    const c = contentOf(db, 5);
    expect(() => c.terms('category')).toThrow(UnsupportedDataError);
  });

  // 正の対照(親なし): 同じ構成で parent=0 なら Child を返す。現状 stub のため Red。
  it('正の対照: 親なしカテゴリ Child(parent=0)は返る', () => {
    const db = openDumpDb();
    addTerm(db, 6, 'Child', 'child', 'category');
    relate(db, 5, 6);
    expect(contentOf(db, 5).terms('category')).toContainEqual({
      name: 'Child',
      slug: 'child',
      url: `${HOME}/category/child/`,
    });
  });

  // Green-now(回帰ガード): 現状 stub が UnsupportedDataError を投げる。
  // open 時点で拒否される可能性があるため、open と呼び出しを同じ expect 内に入れる。
  it.each([
    ['大文字', 'Up-Case'],
    ['空白', 'has space'],
    ['ダブルクォート', 'a"b'],
  ])('slug が不正(%s)なら UnsupportedDataError', (_label, slug) => {
    const db = openDumpDb();
    addTerm(db, 6, 'Bad', slug, 'category');
    relate(db, 5, 6);
    expect(() => openCurrentPost(db, { id: 5 })!.content.terms('category')).toThrow(UnsupportedDataError);
  });

  // 正の対照(slug 正常): 同じ構成で slug が正規表現に合えば返る。現状 stub のため Red。
  it('正の対照: slug が ok-slug なら返る', () => {
    const db = openDumpDb();
    addTerm(db, 6, 'Ok', 'ok-slug', 'category');
    relate(db, 5, 6);
    expect(contentOf(db, 5).terms('category')).toContainEqual({
      name: 'Ok',
      slug: 'ok-slug',
      url: `${HOME}/category/ok-slug/`,
    });
  });
});

describe('D3c1-04 author()', () => {
  // Red 理由: 現状 stub が UnsupportedDataError を投げる。
  it('S0 投稿 5(post_author 0)は null', () => {
    expect(contentOf(openDumpDb(), 5).author()).toBeNull();
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる。
  it('S3 投稿 5(post_author 1 = admin)は {name, url}', () => {
    const db = openDumpDb();
    applyS3(db);
    expect(contentOf(db, 5).author()).toEqual({ name: 'admin', url: `${HOME}/author/admin/` });
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる。前提としてユーザー 1 が admin であることを確認。
  it('投稿 1(dump の著者 1)も admin', () => {
    const db = openDumpDb();
    expect(db.prepare('SELECT user_nicename AS n FROM users WHERE ID = 1').get()).toEqual({ n: 'admin' });
    expect(contentOf(db, 1).author()).toEqual({ name: 'admin', url: `${HOME}/author/admin/` });
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる(存在しないユーザーは null のはず)。
  it('存在しないユーザー ID 99 は null', () => {
    const db = openDumpDb();
    applyS3(db);
    updateRow(db, 'posts', 'ID', 5, { post_author: 99 });
    expect(contentOf(db, 5).author()).toBeNull();
  });

  // Green-now(回帰ガード): stub が UnsupportedDataError を投げる。
  // 正の対照として、同じ構成で display_name が正常なら {name} を返す(下の Red テスト)。
  it('display_name が空なら UnsupportedDataError', () => {
    const db = openDumpDb();
    applyS3(db);
    updateRow(db, 'users', 'ID', 1, { display_name: '' });
    expect(() => contentOf(db, 5).author()).toThrow(UnsupportedDataError);
  });

  // 正の対照: 同じ構成で display_name=admin は返る。現状 stub のため Red。
  it('正の対照: display_name が admin なら返る', () => {
    const db = openDumpDb();
    applyS3(db);
    updateRow(db, 'users', 'ID', 1, { display_name: 'admin' });
    expect(contentOf(db, 5).author()).toEqual({ name: 'admin', url: `${HOME}/author/admin/` });
  });

  // Green-now(回帰ガード): stub が UnsupportedDataError を投げる。
  it.each([
    ['空白を含む', 'a b'],
    ['大文字を含む', 'Admin'],
  ])('user_nicename が不正(%s)なら UnsupportedDataError', (_label, nicename) => {
    const db = openDumpDb();
    applyS3(db);
    updateRow(db, 'users', 'ID', 1, { user_nicename: nicename });
    expect(() => contentOf(db, 5).author()).toThrow(UnsupportedDataError);
  });

  // 正の対照: nicename=admin-2 は返る。現状 stub のため Red。
  it('正の対照: user_nicename が admin-2 なら url に反映', () => {
    const db = openDumpDb();
    applyS3(db);
    updateRow(db, 'users', 'ID', 1, { user_nicename: 'admin-2' });
    expect(contentOf(db, 5).author()).toEqual({ name: 'admin', url: `${HOME}/author/admin-2/` });
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる。エスケープされず raw で返ること。
  it('display_name に <>&" を含んでも raw(非エスケープ)で返る', () => {
    const db = openDumpDb();
    applyS3(db);
    const raw = '<b>A&B "q"</b>';
    updateRow(db, 'users', 'ID', 1, { display_name: raw });
    expect(contentOf(db, 5).author()).toEqual({ name: raw, url: `${HOME}/author/admin/` });
  });
});

describe('D3c1-05 hasThumbnail()', () => {
  // Red 理由: 現状 stub が UnsupportedDataError を投げる(false を返すべき)。
  it('通常の投稿 5(_thumbnail_id なし)は false', () => {
    const db = openDumpDb();
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM postmeta WHERE post_id = 5 AND meta_key = '_thumbnail_id'`).get(),
    ).toEqual({ n: 0 });
    expect(contentOf(db, 5).hasThumbnail()).toBe(false);
  });

  // Red 理由: 2 引数の buildContentPort(db, row) を 1 引数の現行関数に渡すため、
  // 第 1 引数の db が row として扱われ、hasThumbnail は stub の UnsupportedDataError を投げる。
  // 型の不一致(PostRowForCtx に post_author が無い / 引数数)は tsc でしか見えず、未検証。
  it('buildContentPort(db, row) で _thumbnail_id ありの row を渡すと hasThumbnail は true', () => {
    const db = openDumpDb();
    insertRow(db, 'postmeta', { post_id: 5, meta_key: '_thumbnail_id', meta_value: '1' });
    const row = db
      .prepare(
        `SELECT ID AS id, post_name AS slug, post_title AS title, post_date_gmt, post_content,
                post_password, post_author
           FROM posts WHERE ID = 5`,
      )
      .get() as unknown as PostRowForCtx;
    const port = (buildContentPort as unknown as (d: DatabaseSync, r: PostRowForCtx) => ContentPort)(db, row);
    expect(port.hasThumbnail()).toBe(true);
  });

  // Green-now(回帰ガード): assertNoStickyOrThumbnail により open で拒否される。
  it('openCurrentPost は _thumbnail_id ありの投稿を UnsupportedDataError で拒否する', () => {
    const db = openDumpDb();
    insertRow(db, 'postmeta', { post_id: 5, meta_key: '_thumbnail_id', meta_value: '1' });
    expect(() => openCurrentPost(db, { id: 5 })).toThrow(UnsupportedDataError);
  });

  // Green-now(回帰ガード): queryPosts 側も同様に拒否する。
  it('queryPosts は _thumbnail_id ありの投稿を含むと UnsupportedDataError', () => {
    const db = openDumpDb();
    insertRow(db, 'postmeta', { post_id: 5, meta_key: '_thumbnail_id', meta_value: '1' });
    expect(() => queryPosts(db, spec({ perPage: 10 }))).toThrow(UnsupportedDataError);
  });
});

describe('D3c1-06 queryPosts: 各 item の terms / author が自分の投稿に束縛される', () => {
  // Red 理由: 現状 stub が UnsupportedDataError を投げる(terms が item ごとに異なるかの検証)。
  it('S2: item 29 と item 28 は別々の terms を返す', () => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    const items = queryPosts(db, spec({ perPage: 4 }));
    const i29 = items.find((i) => i.post.id === 29);
    const i28 = items.find((i) => i.post.id === 28);
    expect(i29, '前提: 投稿 29 が含まれる').toBeDefined();
    expect(i28, '前提: 投稿 28 が含まれる').toBeDefined();
    expect(i29!.content.terms('post_tag').map((t) => t.slug)).toEqual(['t-one']);
    expect(i28!.content.terms('post_tag')).toEqual([]);
    expect(i28!.content.terms('category').map((t) => t.slug)).toEqual(['alpha', 'zeta']);
    expect(i29!.content.terms('category').map((t) => t.slug)).toEqual(['uncategorized']);
  });

  // Red 理由: 現状 stub が UnsupportedDataError を投げる(author が item ごとに束縛されるかの検証)。
  it('S3: item 5 は admin、item 28 は null', () => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    applyS3(db);
    const items = queryPosts(db, spec({ perPage: 10 }));
    const i5 = items.find((i) => i.post.id === 5);
    const i28 = items.find((i) => i.post.id === 28);
    expect(i5, '前提: 投稿 5 が含まれる').toBeDefined();
    expect(i28, '前提: 投稿 28 が含まれる').toBeDefined();
    expect(i5!.content.author()).toEqual({ name: 'admin', url: `${HOME}/author/admin/` });
    expect(i28!.content.author()).toBeNull();
  });

  // Red: terms は stub が UnsupportedDataError を投げるため。
  // contentOf が undefined であることは現状でも満たす(Green-now、回帰ガード部分)。
  it('保護投稿 22: terms / author は自身の値を返し、contentOf は undefined', () => {
    const db = openDumpDb();
    applyS1(db);
    const items = queryPosts(db, spec({ perPage: 2 }));
    const prot = items.find((i) => i.post.id === 22);
    expect(prot, '前提: 保護投稿 22 が含まれる').toBeDefined();
    expect(prot!.content.contentOf).toBeUndefined();
    expect(prot!.content.terms('category').map((t) => t.slug)).toEqual(['uncategorized']);
    expect(prot!.content.author()).toBeNull();
  });
});

describe('D3c1-07 commentsState は引き続き(adjacent は D-3e で実装) UnsupportedDataError', () => {
  // Green-now(回帰ガード): stub が UnsupportedDataError を投げるため通る。
  // 実装で誤って解放されないことを保証する目的。識別力は弱い(正の対照なし)。
  it.each([
    ['commentsState', (c: ContentPort) => c.commentsState()],
  ])('%s は UnsupportedDataError', (_label, call) => {
    const c = contentOf(openDumpDb(), 5);
    expect(() => call(c)).toThrow(UnsupportedDataError);
  });
});

// D3c1 補強(STEP6): 名前順は大文字小文字を区別しない(MySQL の ci collation に合わせた仮定。実測は 2 件の異名のみ)。
import { openDumpDb as _open } from './dumpDb.js';
import { addPost as _addPost, addTerm as _addTerm, relate as _relate } from './mainStates.js';
import { openCurrentPost as _open1 } from './currentPost.js';
describe('terms の名前順(大文字小文字を無視)', () => {
  it('D3c1-02b: apple(slug zz)が Banana(slug aa)より先', () => {
    const db = _open();
    _addTerm(db, 30, 'Banana', 'aa', 'category');
    _addTerm(db, 31, 'apple', 'zz', 'category');
    _addPost(db, { id: 60, title: 't', name: 'p60', date: '2026-11-05 00:00:00', status: 'publish' });
    _relate(db, 60, 30);
    _relate(db, 60, 31);
    const opened = _open1(db, { id: 60 })!;
    expect(opened.content.terms('category').map((t) => t.slug)).toEqual(['zz', 'aa']);
    expect(opened.post.className).toContain('category-zz category-aa');
  });
});

// D3c1-03 補強(STEP6): ポート単体でも不正な slug を拒否する(className 側の検査に依存しない)。
import { buildContentPort as _bcp } from './postData.js';
describe('terms の slug 検査(ポート単体)', () => {
  it('D3c1-03b: 大文字を含む slug の term は buildContentPort 直呼びでも UnsupportedDataError', () => {
    const db = _open();
    _addTerm(db, 40, 'Bad', 'BadSlug', 'category');
    _addPost(db, { id: 61, title: 't', name: 'p61', date: '2026-11-06 00:00:00', status: 'publish' });
    _relate(db, 61, 40);
    const row = db
      .prepare('SELECT ID AS id, post_name AS slug, post_title AS title, post_date_gmt, post_content, post_password, post_author FROM posts WHERE ID = 61')
      .get() as unknown as Parameters<typeof _bcp>[1];
    expect(() => _bcp(db, row).terms('category')).toThrow(UnsupportedDataError);
  });
});
