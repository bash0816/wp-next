// SPDX-License-Identifier: GPL-3.0-only
// D3b1-11〜17: queryPosts(db, spec) のテスト。期待値は fixtures(regions / set-main2)と dump.sql から取る。
// 実装 queryPosts.ts は未作成のため、全テストは import 解決失敗(収集失敗)で Red になる想定。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { ContentPort } from '@wpn/core/ports';
import { insertRow, openDumpDb, updateRow } from './dumpDb.js';
import { addPost, addTerm, applyS1, applyS2, relate } from './mainStates.js';
import { queryPosts } from './queryPosts.js';
import { UnsupportedDataError } from './postData.js';

const here = dirname(fileURLToPath(import.meta.url));
const REGIONS = join(here, '../../../fixtures/ref/regions');
const SET_MAIN2 = join(here, '../../../fixtures/ref/set-main2');
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

type FixLi = { id: number; cls: string; datetime: string | null; dateText: string | null; href: string };

/** フィクスチャの <li class="..."> 単位で、投稿 ID ごとの期待値を抜き出す(HTML 全体の読み込みはしない)。 */
function fixtureLis(path: string): Map<number, FixLi> {
  const html = readFileSync(path, 'utf8');
  const out = new Map<number, FixLi>();
  for (const chunk of html.split('<li class="').slice(1)) {
    const cls = chunk.slice(0, chunk.indexOf('"'));
    const id = Number(/\bpost-(\d+)\b/.exec(cls)?.[1]);
    const t = /<time datetime="([^"]+)"[^>]*>([^<]*)<\/time>/.exec(chunk);
    const h = /wp-block-post-title[^>]*><a href="([^"]+)"/.exec(chunk);
    // 保護投稿の li には <time>(post-date)が無い(実測)ので、日付は null を許す。
    if (Number.isNaN(id) || !h) continue;
    out.set(id, { id, cls: cls.replace(/^wp-block-post /, ''), datetime: t ? (t[1] ?? '') : null, dateText: t ? (t[2] ?? '') : null, href: h[1] ?? '' });
  }
  return out;
}

const idsOf = (items: Array<{ post: { id: number } }>): number[] => items.map((i) => i.post.id);

describe('queryPosts (D3b1-11〜17)', () => {
  it('D3b1-11: S0 で perPage 4 は [7,5,1] を返し、各項目が regions/main-02.html の li と一致する', () => {
    // 検出対象: 基準 dump の公開 post(post_type=post, publish)だけを日付降順で窓に入れること。
    //   page / wp_navigation(4) / revision(6) / 固定ページ(2,3) は除外されること。
    //   className・dateIso・dateText・url が基準 HTML と一致すること。
    // Red 理由: queryPosts.ts 未実装のため import が解決できず収集失敗する。
    const db = openDumpDb();
    const items = queryPosts(db, spec());
    expect(idsOf(items)).toEqual([7, 5, 1]);

    const fx = fixtureLis(join(REGIONS, 'main-02.html'));
    expect(fx.size).toBe(3);
    for (const it of items) {
      const f = fx.get(it.post.id);
      expect(f).toBeDefined();
      expect(it.post.className).toBe(f!.cls);
      expect(it.post.dateIso).toBe(f!.datetime);
      expect(it.post.dateText).toBe(f!.dateText);
      expect(it.post.url).toBe(f!.href);
      expect(it.post.protected).toBe(false);
    }
    // タイトルは DB の生値(HTML エンコード前)。
    expect(items.map((i) => i.post.title)).toEqual(['入れ子 & <特殊> "文字"', 'スパイク用ページ', 'Hello world!']);
  });

  it('D3b1-12: S1 で perPage 4 は [7,22,5,1] を返し、保護投稿 22 は protected=true・contentOf なし、draft/private/future は出ない', () => {
    // 検出対象: 保護(publish+password)は含まれ、draft(23)・private(24)・future(25)は除外されること。
    //   保護投稿は className に post-password-required が付き、本文アクセサ contentOf を持たないこと。
    //   期待 className・dateIso・url は mixed-status-protected-adjacent.html の li と一致すること。
    // Red 理由: queryPosts.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    applyS1(db);
    const items = queryPosts(db, spec());
    expect(idsOf(items)).toEqual([7, 22, 5, 1]);

    const fx = fixtureLis(join(SET_MAIN2, 'main.mixed-status-protected-adjacent.html'));
    for (const it of items) {
      const f = fx.get(it.post.id);
      expect(f).toBeDefined();
      expect(it.post.className).toBe(f!.cls);
      if (it.post.protected) {
        // 保護カードは日付を出さない(fixture に time が無い)。PostCtx 側の日付は存在してもよいが、描画側が抑止する。
        expect(f!.datetime).toBeNull();
      } else {
        expect(it.post.dateIso).toBe(f!.datetime);
      }
      expect(it.post.url).toBe(f!.href);
    }

    const p22 = items[1]!;
    expect(p22.post.protected).toBe(true);
    expect(p22.post.title).toBe('M-prot');
    expect(p22.post.url).toBe(`${HOME}/m-prot/`);
    expect(p22.post.className).toContain('post-password-required');
    expect(p22.content.contentOf).toBeUndefined();

    const p7 = items[0]!;
    expect(p7.post.protected).toBe(false);
    expect(typeof p7.content.contentOf).toBe('function');
  });

  it('D3b1-13: S2 で perPage 4 は [29,28,27,26]、perPage 1 は [29]、perPage 100 は公開 8 件を日付降順・同日時は ID 降順で返す', () => {
    // 検出対象: 同日時(26,27 は 23:40:00)の tie-break が ID 降順になること。
    //   複数カテゴリは alphabetical(category-alpha category-zeta)、format aside と tag(t-one)が className に載ること。
    //   期待 className は classes-tiebreak-format-tag.html の li と一致すること。
    // Red 理由: queryPosts.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);

    const items = queryPosts(db, spec());
    expect(idsOf(items)).toEqual([29, 28, 27, 26]);
    const fx = fixtureLis(join(SET_MAIN2, 'main.classes-tiebreak-format-tag.html'));
    for (const it of items) {
      const f = fx.get(it.post.id);
      expect(f).toBeDefined();
      expect(it.post.className).toBe(f!.cls);
      expect(it.post.dateIso).toBe(f!.datetime);
      expect(it.post.url).toBe(f!.href);
    }
    expect(items[1]!.post.className).toContain('category-alpha category-zeta');
    expect(items[1]!.post.className).not.toContain('category-uncategorized');
    expect(items[0]!.post.className).toContain('format-aside');
    expect(items[0]!.post.className).toContain('tag-t-one post_format-post-format-aside');

    expect(idsOf(queryPosts(db, spec({ perPage: 1 })))).toEqual([29]);
    expect(idsOf(queryPosts(db, spec({ perPage: 100 })))).toEqual([29, 28, 27, 26, 7, 22, 5, 1]);
  });

  it.each([
    ['perPage 0', { perPage: 0 }],
    ['perPage 101', { perPage: 101 }],
    ['perPage 小数', { perPage: 1.5 }],
    ['perPage 文字列', { perPage: '4' }],
    ['postType page', { postType: 'page' }],
    ['order asc', { order: 'asc' }],
    ['orderBy title', { orderBy: 'title' }],
    ['pages 1', { pages: 1 }],
    ['offset 1', { offset: 1 }],
    ['author 指定', { author: 'admin' }],
    ['search 指定', { search: 'x' }],
    ['exclude 指定', { exclude: [1] }],
    ['sticky only', { sticky: 'only' }],
    ['inherit true', { inherit: true }],
    ['taxQuery 非 null', { taxQuery: {} }],
    ['parents 指定', { parents: [1] }],
    ['未知キー', { foo: 1 }],
  ])('D3b1-14: spec の閉じた型に違反(%s)は RangeError', (_label, over) => {
    // 検出対象: spec は閉じた型。値の範囲外・未知キー・既定以外の値はすべて RangeError で拒否されること。
    // Red 理由: queryPosts.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    expect(() => queryPosts(db, spec(over))).toThrow(RangeError);
  });

  it('D3b1-14: 必須キー欠落・null・文字列 spec も RangeError', () => {
    // 検出対象: 全キー必須。キー欠落、null、文字列の spec は型違反として RangeError になること。
    // Red 理由: queryPosts.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    const missing = spec();
    delete missing.postType;
    expect(() => queryPosts(db, missing)).toThrow(RangeError);
    expect(() => queryPosts(db, null)).toThrow(RangeError);
    expect(() => queryPosts(db, 'x')).toThrow(RangeError);
  });

  it('D3b1-15: 窓内に sticky の投稿があると全体を UnsupportedDataError で拒否する(窓外なら通す)', () => {
    // 検出対象: sticky_posts に窓内の ID(5)がある場合は黙って落とさず全体を拒否すること。
    //   窓外(ID 1 は perPage 1 の窓 [7] の外)は検査対象外で、結果 [7] を返すこと。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const inWindow = openDumpDb();
    updateRow(inWindow, 'options', 'option_name', 'sticky_posts', { option_value: 'a:1:{i:0;i:5;}' });
    expect(() => queryPosts(inWindow, spec())).toThrow(UnsupportedDataError);

    const outWindow = openDumpDb();
    updateRow(outWindow, 'options', 'option_name', 'sticky_posts', { option_value: 'a:1:{i:0;i:1;}' });
    expect(idsOf(queryPosts(outWindow, spec({ perPage: 1 })))).toEqual([7]);
  });

  it('D3b1-15: 窓内の投稿にサムネイル(_thumbnail_id)があると UnsupportedDataError、窓外なら通す', () => {
    // 検出対象: thumbnail は窓内の項目で拒否されること。窓外の項目は検査対象外であること。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const inWindow = openDumpDb();
    insertRow(inWindow, 'postmeta', { post_id: 7, meta_key: '_thumbnail_id', meta_value: '5' });
    expect(() => queryPosts(inWindow, spec())).toThrow(UnsupportedDataError);

    const outWindow = openDumpDb();
    insertRow(outWindow, 'postmeta', { post_id: 1, meta_key: '_thumbnail_id', meta_value: '5' });
    expect(idsOf(queryPosts(outWindow, spec({ perPage: 1 })))).toEqual([7]);
  });

  it('D3b1-15: category/post_tag/post_format 以外のタクソノミー(nav_menu)が窓内にあると UnsupportedDataError', () => {
    // 検出対象: 対応外タクソノミーを含む項目は全体拒否されること。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    addTerm(db, 6, 'Menu', 'menu', 'nav_menu');
    relate(db, 7, 6);
    expect(() => queryPosts(db, spec())).toThrow(UnsupportedDataError);
  });

  it('D3b1-15: format が standard/aside 以外(gallery)の窓内投稿は UnsupportedDataError', () => {
    // 検出対象: 対応外 post format(gallery)を持つ投稿 5 が窓内にあると全体拒否されること。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    addTerm(db, 7, 'post-format-gallery', 'post-format-gallery', 'post_format');
    relate(db, 5, 7);
    expect(() => queryPosts(db, spec())).toThrow(UnsupportedDataError);
  });

  it.each([
    ['空白を含む slug', 'Bad Slug'],
    ['大文字を含む slug', 'Upper'],
    ['アンダースコアを含む slug', 'under_score'],
  ])('D3b1-15: カテゴリ slug が規則 ^[a-z0-9-]+$ に反する(%s)と UnsupportedDataError', (_label, slug) => {
    // 検出対象: 正規表現に合わない term slug は className を正しく作れないため拒否されること。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    addTerm(db, 8, slug, slug, 'category');
    relate(db, 7, 8);
    expect(() => queryPosts(db, spec())).toThrow(UnsupportedDataError);
  });

  it.each([
    ['timezone_string', 'Asia/Tokyo'],
    ['gmt_offset', '9'],
    ['date_format', 'Y-m-d'],
  ])('D3b1-15: 日付オプション %s が基準値と異なると UnsupportedDataError', (name, value) => {
    // 検出対象: 基準(timezone_string='', gmt_offset='0', date_format='F j, Y')と異なる日付設定は
    //   dateText/dateIso を基準どおり作れないため拒否されること。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    updateRow(db, 'options', 'option_name', name, { option_value: value });
    expect(() => queryPosts(db, spec())).toThrow(UnsupportedDataError);
  });

  it('D3b1-16: 保護投稿のパスワード・本文は結果に現れず、contentOf は各投稿の本文に束縛される', () => {
    // 検出対象: 保護投稿(22)の SECRET-PW-S1 / SECRET-BODY-S1 は PostCtx にも結果全体にも出ないこと。
    //   contentOf は項目ごとに自分の post_content を返すこと(ID 5 と 7 を取り違えない)。
    // Red 理由: queryPosts.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    applyS1(db);
    updateRow(db, 'posts', 'ID', 7, { post_content: 'BIND-7' });
    updateRow(db, 'posts', 'ID', 5, { post_content: 'BIND-5' });
    const items = queryPosts(db, spec());
    const by = (id: number) => items.find((i) => i.post.id === id)!;

    expect(by(7).content.contentOf!()).toBe('BIND-7');
    expect(by(5).content.contentOf!()).toBe('BIND-5');
    expect(by(22).content.contentOf).toBeUndefined();
    expect(by(22).post).not.toHaveProperty('password');

    const json = JSON.stringify(items.map((i) => i.post));
    expect(json).not.toContain('SECRET-PW-S1');
    expect(json).not.toContain('SECRET-BODY-S1');
  });

  it.each([
    ['commentsState', (c: ContentPort) => c.commentsState()],
  ])('D3b1-17: content.%s は UnsupportedDataError(保護・非保護の両方)', (_label, call) => {
    // 検出対象: 未対応の文脈メソッドは黙って既定値を返さず UnsupportedDataError を投げること。
    //   窓 [7,22] の非保護(7)と保護(22)の両方で確認する。
    // Red 理由: queryPosts.ts / postData.ts 未実装のため収集失敗する。
    const db = openDumpDb();
    applyS1(db);
    const items = queryPosts(db, spec({ perPage: 2 }));
    expect(idsOf(items)).toEqual([7, 22]);
    for (const it of items) {
      expect(() => call(it.content)).toThrow(UnsupportedDataError);
    }
  });
});

// D3b1 補強(STEP6): 保護クラス・名前順・sticky 判定・URL エンコード。
import { postClassName } from './postData.js';
describe('queryPosts 補強', () => {
  it('D3b1-13b: category は slug ではなく term 名の昇順(名前 Alpha=slug zz が名前 Bravo=slug aa より先)', () => {
    const db = openDumpDb();
    addTerm(db, 20, 'Bravo', 'aa', 'category');
    addTerm(db, 21, 'Alpha', 'zz', 'category');
    addPost(db, { id: 40, title: 't', name: 'p40', date: '2026-11-01 00:00:00', status: 'publish' });
    relate(db, 40, 20);
    relate(db, 40, 21);
    const [item] = queryPosts(db, { ...spec(), perPage: 1 });
    expect(item!.post.className).toBe(
      'post-40 post type-post status-publish format-standard hentry category-zz category-aa',
    );
  });
  it('D3b1-13c: sticky_posts の添字と値を取り違えない(添字 5 / 値 99 は post 5 を sticky にしない、値 5 は sticky)', () => {
    const db = openDumpDb();
    updateRow(db, 'options', 'option_name', 'sticky_posts', { option_value: 'a:1:{i:5;i:99;}' });
    expect(() => queryPosts(db, { ...spec(), perPage: 4 })).not.toThrow();
    updateRow(db, 'options', 'option_name', 'sticky_posts', { option_value: 'a:1:{i:0;i:5;}' });
    expect(() => queryPosts(db, { ...spec(), perPage: 4 })).toThrow(UnsupportedDataError);
    updateRow(db, 'options', 'option_name', 'sticky_posts', { option_value: 'garbage' });
    expect(() => queryPosts(db, { ...spec(), perPage: 4 })).toThrow(UnsupportedDataError);
  });
  it('D3b1-13d: URL は slug を encodeURIComponent する', () => {
    const db = openDumpDb();
    addPost(db, { id: 41, title: 't', name: 'a b%c', date: '2026-11-02 00:00:00', status: 'publish' });
    relate(db, 41, 1);
    const [item] = queryPosts(db, { ...spec(), perPage: 1 });
    expect(item!.post.url).toBe(`${HOME}/a%20b%25c/`);
  });
  it('D3b1-13e: postClassName の保護フラグは hentry の直前', () => {
    const db = openDumpDb();
    expect(postClassName(db, 5, true)).toBe(
      'post-5 post type-post status-publish format-standard post-password-required hentry category-uncategorized',
    );
    expect(postClassName(db, 5)).not.toContain('post-password-required');
  });
});
