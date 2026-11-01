// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openCurrentPost } from './currentPost.js';
import { insertRow, openDumpDb } from './dumpDb.js';
import { addPost, addTerm, applyS1, applyS2, relate } from './mainStates.js';
import { UnsupportedDataError } from './postData.js';

// fixtures は readFileSync + 正規表現で部分だけ読む(全体を出力しない)。
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const main02 = readFileSync(join(repoRoot, 'fixtures/ref/regions/main-02.html'), 'utf8');
const tiebreak = readFileSync(
  join(repoRoot, 'fixtures/ref/set-main2/main.classes-tiebreak-format-tag.html'),
  'utf8',
);

type Ref = Parameters<typeof openCurrentPost>[1];

// 引数の型検査を外してテストする(入力検証の挙動を見るため)。
function call(db: DatabaseSync, ref: unknown): ReturnType<typeof openCurrentPost> {
  return openCurrentPost(db, ref as Ref);
}

// null なら失敗にする(テスト本体の型を絞るため)。
function mustOpen(db: DatabaseSync, ref: Ref): NonNullable<ReturnType<typeof openCurrentPost>> {
  const r = openCurrentPost(db, ref);
  if (r === null) throw new Error(`openCurrentPost(${JSON.stringify(ref)}) が null を返した`);
  return r;
}

// main-02.html の post-<id> の li 内の <time> を取り出す。
function timeOf(postId: number): { datetime: string; text: string } {
  const re = new RegExp(
    `class="wp-block-post post-${postId} [^"]*"[\\s\\S]*?<time datetime="([^"]+)">([^<]+)</time>`,
  );
  const m = re.exec(main02);
  if (!m) throw new Error(`main-02.html に post-${postId} の time が見つからない`);
  return { datetime: m[1]!, text: m[2]! };
}

// fixture の li class から "wp-block-post " を除いたもの(PostCtx.className の形)を取り出す。
function liClassIn(text: string, postId: number): string {
  const m = new RegExp(`class="(wp-block-post post-${postId}(?: [^"]*)?)"`).exec(text);
  if (!m) throw new Error(`fixture に post-${postId} の li class が見つからない`);
  return m[1]!.replace(/^wp-block-post /, '');
}

function setOption(db: DatabaseSync, name: string, value: string): void {
  db.prepare('UPDATE options SET option_value = ? WHERE option_name = ?').run(value, name);
}

function deleteOption(db: DatabaseSync, name: string): void {
  db.prepare('DELETE FROM options WHERE option_name = ?').run(name);
}

function slugOf(db: DatabaseSync, postId: number): string {
  const row = db
    .prepare('SELECT post_name AS n FROM posts WHERE ID = ?')
    .get(postId) as { n: string } | undefined;
  if (!row) throw new Error(`post ${postId} が dump にない`);
  return row.n;
}

function rawContentOf(db: DatabaseSync, postId: number): string {
  const row = db
    .prepare('SELECT post_content AS c FROM posts WHERE ID = ?')
    .get(postId) as { c: string } | undefined;
  if (!row) throw new Error(`post ${postId} が dump にない`);
  return row.c;
}

// ---------------------------------------------------------------------------
// D3b1-03: S0(dump のみ)で slug 経路と id 経路が同じ PostCtx を返す
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-03 openCurrentPost: S0 で slug と id の経路が同じ PostCtx', () => {
  // 出典: dump の posts(post_title / post_name)、options.home=http://127.0.0.1:8080、
  // main-02.html の li class と <time>。
  const cases = [
    { id: 5, slug: 'spike-blocks', title: 'スパイク用ページ' },
    { id: 7, slug: 'fixture-two-nested', title: '入れ子 & <特殊> "文字"' },
    { id: 1, slug: 'hello-world', title: 'Hello world!' },
  ] as const;

  it.each(cases)('post $id は slug 経路と id 経路で同じ PostCtx になる', ({ id, slug, title }) => {
    const db = openDumpDb();
    const bySlug = mustOpen(db, { slug });
    const byId = mustOpen(db, { id });
    const t = timeOf(id);
    const expected = {
      id,
      title,
      url: `http://127.0.0.1:8080/${slug}/`,
      protected: false,
      className: liClassIn(main02, id),
      dateIso: t.datetime,
      dateText: t.text,
    };
    expect(bySlug.post).toEqual(expected);
    expect(byId.post).toEqual(expected);
  });

  it.each(cases)('post $id の contentOf() は dump の生の post_content を返す', ({ id, slug }) => {
    const db = openDumpDb();
    const r = mustOpen(db, { slug });
    expect(r.content.contentOf).toBeTypeOf('function');
    expect(r.content.contentOf?.()).toBe(rawContentOf(db, id));
  });
});

// ---------------------------------------------------------------------------
// D3b1-04: S1 適用後、公開対象外・保護・存在しない・非 post 型は slug/id どちらでも null
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-04 openCurrentPost: 対象外の投稿は null', () => {
  it.each([22, 23, 24, 25, 2, 3, 4, 6])(
    'S1 適用後の post %i は slug 経路・id 経路ともに null',
    (id) => {
      const db = openDumpDb();
      applyS1(db);
      expect(call(db, { id })).toBeNull();
      expect(call(db, { slug: slugOf(db, id) })).toBeNull();
    },
  );

  it('存在しない id と slug は null', () => {
    const db = openDumpDb();
    applyS1(db);
    expect(call(db, { id: 999 })).toBeNull();
    expect(call(db, { slug: 'no-such' })).toBeNull();
  });

  it('attachment は slug 経路・id 経路ともに null(addPost の type で作成)', () => {
    const db = openDumpDb();
    applyS1(db);
    addPost(db, {
      id: 31,
      title: 'att',
      name: 'att-1',
      date: '2026-10-27 23:00:00',
      status: 'inherit',
      type: 'attachment',
    });
    expect(call(db, { id: 31 })).toBeNull();
    expect(call(db, { slug: 'att-1' })).toBeNull();
  });

  it('空白のみの password(" ")は保護扱いで null', () => {
    const db = openDumpDb();
    addPost(db, {
      id: 30,
      title: 'ws-pw',
      name: 'ws-pw',
      date: '2026-10-27 23:00:00',
      status: 'publish',
      password: ' ',
    });
    expect(call(db, { id: 30 })).toBeNull();
    expect(call(db, { slug: 'ws-pw' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D3b1-05: 入力検証違反は null ではなく RangeError を投げる
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-05 openCurrentPost: 入力検証は RangeError', () => {
  const invalid: Array<[string, unknown]> = [
    ['空オブジェクト {}', {}],
    ['slug と id の両方指定', { slug: 'a', id: 1 }],
    ['slug が空文字', { slug: '' }],
    ['slug が数値', { slug: 5 }],
    ['id が小数', { id: 1.5 }],
    ['id が文字列', { id: '5' }],
    ['id が 0', { id: 0 }],
    ['id が負数', { id: -1 }],
    ['null', null],
    ['文字列そのもの', 'spike-blocks'],
  ];

  it.each(invalid)('%s は RangeError', (_label, ref) => {
    const db = openDumpDb();
    expect(() => call(db, ref)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// D3b1-06: 保護投稿は null、公開投稿の結果に秘密文字列が漏れない
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-06 openCurrentPost: 保護投稿の秘密を返さない', () => {
  it('S1 の保護投稿(22)は slug/id どちらでも null', () => {
    const db = openDumpDb();
    applyS1(db);
    expect(call(db, { id: 22 })).toBeNull();
    expect(call(db, { slug: 'm-prot' })).toBeNull();
  });

  it('公開投稿(5)の結果を JSON 化しても SECRET- を含まない(関数は除外)', () => {
    const db = openDumpDb();
    applyS1(db);
    const r = mustOpen(db, { id: 5 });
    const contentData = Object.fromEntries(
      Object.entries(r.content).filter(([, v]) => typeof v !== 'function'),
    );
    const json = JSON.stringify({ post: r.post, content: contentData });
    expect(json).toContain('"id":5');
    expect(json).not.toContain('SECRET-');
  });
});

// ---------------------------------------------------------------------------
// D3b1-07: S2 で 26/27/28/29 が開け、className は fixture の li class と一致する
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-07 openCurrentPost: S2 の投稿と className', () => {
  // 出典: fixtures/ref/set-main2/main.classes-tiebreak-format-tag.html の li class。
  const expectedClass: Record<number, string> = {
    28: 'post-28 post type-post status-publish format-standard hentry category-alpha category-zeta',
    29: 'post-29 post type-post status-publish format-aside hentry category-uncategorized tag-t-one post_format-post-format-aside',
    26: 'post-26 post type-post status-publish format-standard hentry category-uncategorized',
    27: 'post-27 post type-post status-publish format-standard hentry category-uncategorized',
  };

  it.each([26, 27, 28, 29])('post %i が開き、className が fixture と一致する', (id) => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    const r = mustOpen(db, { id });
    expect(liClassIn(tiebreak, id)).toBe(expectedClass[id]);
    expect(r.post.className).toBe(expectedClass[id]);
    expect(r.post.id).toBe(id);
  });

  it('post 28 を slug 経路で開いても className は同じ', () => {
    const db = openDumpDb();
    applyS1(db);
    applyS2(db);
    const r = mustOpen(db, { slug: 'class-c1' });
    expect(r.post.id).toBe(28);
    expect(r.post.className).toBe(expectedClass[28]);
  });
});

// ---------------------------------------------------------------------------
// D3b1-08: 未対応データ(sticky / サムネイル / 別 taxonomy / format gallery / 危険な slug)は
// UnsupportedDataError。各条件は単独で、それぞれ新しい DB で検査する。
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-08 openCurrentPost: 未対応データは UnsupportedDataError', () => {
  const unsupported: Array<[string, (db: DatabaseSync) => void]> = [
    ['sticky_posts に 5 が入る', (db) => setOption(db, 'sticky_posts', 'a:1:{i:5;}')],
    [
      '_thumbnail_id の postmeta がある',
      (db) => {
        insertRow(db, 'postmeta', { post_id: 5, meta_key: '_thumbnail_id', meta_value: '1' });
      },
    ],
    [
      'link_category に紐付く',
      (db) => {
        addTerm(db, 40, 'lk', 'lk', 'link_category');
        relate(db, 5, 40);
      },
    ],
    [
      'post_format が gallery',
      (db) => {
        addTerm(db, 41, 'gallery', 'post-format-gallery', 'post_format');
        relate(db, 5, 41);
      },
    ],
    [
      'category の slug に "(ダブルクォート)',
      (db) => {
        addTerm(db, 42, 'q', 'a"b', 'category');
        relate(db, 5, 42);
      },
    ],
    [
      'category の slug に大文字',
      (db) => {
        addTerm(db, 43, 'up', 'Upper', 'category');
        relate(db, 5, 43);
      },
    ],
    [
      'category の slug に空白',
      (db) => {
        addTerm(db, 44, 'sp', 'has space', 'category');
        relate(db, 5, 44);
      },
    ],
  ];

  it.each(unsupported)('%s なら UnsupportedDataError', (_label, mutate) => {
    const db = openDumpDb();
    mutate(db);
    expect(() => call(db, { id: 5 })).toThrow(UnsupportedDataError);
  });
});

// D3b1-09: content の未実装メソッドの契約テストは、全メソッドが D-3c1/D-3e/D-3f で実装されたため不要になった(削除)。
// 各ポートの検証は contentPorts.test.ts / adjacent.test.ts / commentsState.test.ts にある。

// ---------------------------------------------------------------------------
// D3b1-10: 基準と違う date 系 options では null ではなく UnsupportedDataError
// Red 理由: ./currentPost.js が未実装のため import が失敗する。
// ---------------------------------------------------------------------------
describe('D3b1-10 openCurrentPost: 日付 options が基準外なら UnsupportedDataError', () => {
  const mutations: Array<[string, (db: DatabaseSync) => void]> = [
    ['timezone_string=Asia/Tokyo', (db) => setOption(db, 'timezone_string', 'Asia/Tokyo')],
    ['gmt_offset=9', (db) => setOption(db, 'gmt_offset', '9')],
    ['date_format 未設定', (db) => deleteOption(db, 'date_format')],
  ];

  it.each(mutations)('%s なら id 経路・slug 経路とも UnsupportedDataError', (_label, mutate) => {
    const db = openDumpDb();
    mutate(db);
    expect(() => call(db, { id: 5 })).toThrow(UnsupportedDataError);
    expect(() => call(db, { slug: 'spike-blocks' })).toThrow(UnsupportedDataError);
  });
});

// D3b1-03 補強(STEP6 mutation 生存): 同じ slug の公開投稿が複数あっても ID 最小で決定的に開く。
describe('openCurrentPost 補強: slug 重複の決定性', () => {
  it('D3b1-03: 同 slug の公開投稿が 2 件あるとき ID の小さい方を返す', () => {
    const db = openDumpDb();
    addPost(db, { id: 50, title: 'dupB', name: 'dup', date: '2026-11-03 00:00:00', status: 'publish' });
    addPost(db, { id: 51, title: 'dupA', name: 'dup', date: '2026-11-04 00:00:00', status: 'publish' });
    relate(db, 50, 1);
    relate(db, 51, 1);
    expect(openCurrentPost(db, { slug: 'dup' })!.post.id).toBe(50);
  });
});
