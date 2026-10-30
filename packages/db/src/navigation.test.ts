// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { selectLatestNavigationPost, selectPublishedPagesForNav } from './navigation.js';

const here = dirname(fileURLToPath(import.meta.url));
const dumpPath = join(here, '../../../fixtures/ref/db/dump.sql');

type PostInput = {
  ID: number;
  post_author?: number;
  post_date_gmt: string;
  post_content?: string;
  post_title: string;
  post_excerpt?: string;
  post_status: string;
  post_password?: string;
  post_name: string;
  post_type: string;
  post_parent?: number;
  menu_order?: number;
  post_modified_gmt?: string;
};

/**
 * fixtures/ref/db/dump.sql を一時 SQLite に流し、指定 ID の wp_posts 行をそのまま取り出す。
 * 値をテストに手書きせず、ダンプの実データを入力にするための関数。
 */
function loadDumpPosts(ids: number[]): PostInput[] {
  const src = new DatabaseSync(':memory:');
  src.exec(readFileSync(dumpPath, 'utf8'));
  const placeholders = ids.map(() => '?').join(',');
  return src
    .prepare(`SELECT * FROM wp_posts WHERE ID IN (${placeholders}) ORDER BY ID`)
    .all(...ids) as unknown as PostInput[];
}

function openDb(rows: PostInput[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const insert = db.prepare(`
    INSERT INTO posts (ID, post_author, post_date_gmt, post_content, post_title, post_excerpt,
      post_status, post_password, post_name, post_type, post_parent, menu_order, post_modified_gmt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of rows) {
    insert.run(
      r.ID,
      r.post_author ?? 0,
      r.post_date_gmt,
      r.post_content ?? '',
      r.post_title,
      r.post_excerpt ?? '',
      r.post_status,
      r.post_password ?? '',
      r.post_name,
      r.post_type,
      r.post_parent ?? 0,
      r.menu_order ?? 0,
      r.post_modified_gmt ?? r.post_date_gmt,
    );
  }
  return db;
}

// ---- wp_navigation 用の検証データ ----
const BEE_CONTENT = '<!-- wp:navigation-link {"label":"Bee","url":"/bee/"} /-->';
const DEE_CONTENT = '<!-- wp:navigation-link {"label":"Dee","url":"/dee/"} /-->';
const OLD_CONTENT = '<!-- wp:navigation-link {"label":"Old","url":"/old/"} /-->';
const TIE_CONTENT = '<!-- wp:navigation-link {"label":"Tie","url":"/tie/"} /-->';
const FUTURE_CONTENT = '<!-- wp:navigation-link {"label":"Future","url":"/future/"} /-->';

// ---- 固定ページ用の検証データ(fixtures/ref/set-header2/README.md の混在再現) ----
const pageFixtures: PostInput[] = [
  {
    // (a) publish + パスワード保護、menu_order が Sample Page(0) より小さい
    ID: 40,
    post_date_gmt: '2026-10-27 22:53:00',
    post_title: 'Prot Page',
    post_status: 'publish',
    post_type: 'page',
    post_name: 'prot-page',
    post_password: 'PW-SECRET-7f3a',
    post_content: 'PROTECTED-BODY-MARKER',
    menu_order: -1,
  },
  {
    // (b) draft / private / future / trash の固定ページは含めない
    ID: 41,
    post_date_gmt: '2026-10-27 22:53:10',
    post_title: 'Draft Page',
    post_status: 'draft',
    post_type: 'page',
    post_name: 'draft-page',
    menu_order: -2,
  },
  {
    ID: 42,
    post_date_gmt: '2026-10-27 22:53:20',
    post_title: 'Private Page',
    post_status: 'private',
    post_type: 'page',
    post_name: 'private-page',
    menu_order: -2,
  },
  {
    ID: 43,
    post_date_gmt: '2099-01-01 00:00:00',
    post_title: 'Future Page',
    post_status: 'future',
    post_type: 'page',
    post_name: 'future-page',
    menu_order: -2,
  },
  {
    ID: 44,
    post_date_gmt: '2026-10-27 22:53:40',
    post_title: 'Trash Page',
    post_status: 'trash',
    post_type: 'page',
    post_name: 'trash-page',
    menu_order: -2,
  },
  {
    // 階層ページ: post_parent = Sample Page(ID 2)
    ID: 45,
    post_date_gmt: '2026-10-27 22:53:50',
    post_title: 'Child Page',
    post_status: 'publish',
    post_type: 'page',
    post_name: 'child-page',
    post_parent: 2,
    menu_order: 0,
  },
  {
    // (c) publish の投稿(post_type='post')は含めない
    ID: 46,
    post_date_gmt: '2026-10-27 22:54:00',
    post_title: 'Blog Post',
    post_status: 'publish',
    post_type: 'post',
    post_name: 'blog-post',
    menu_order: -3,
  },
  {
    // menu_order と title が同値のとき ID 昇順になることを検査
    ID: 47,
    post_date_gmt: '2026-10-27 22:54:10',
    post_title: 'Dup',
    post_status: 'publish',
    post_type: 'page',
    post_name: 'dup-a',
    menu_order: 3,
  },
  {
    ID: 48,
    post_date_gmt: '2026-10-27 22:54:20',
    post_title: 'Dup',
    post_status: 'publish',
    post_type: 'page',
    post_name: 'dup-b',
    menu_order: 3,
  },
];

describe('selectLatestNavigationPost', () => {
  it('publish の wp_navigation のうち最新を選び、より新しい draft(Dee)は無視する', () => {
    // 検出対象: post_status='publish' フィルタ、post_date_gmt 降順
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([
      ...loadDumpPosts([4]),
      {
        ID: 20,
        post_date_gmt: '2026-10-28 09:00:00',
        post_title: 'Bee',
        post_status: 'publish',
        post_type: 'wp_navigation',
        post_name: 'bee',
        post_content: BEE_CONTENT,
      },
      {
        ID: 21,
        post_date_gmt: '2026-10-29 09:00:00',
        post_title: 'Dee',
        post_status: 'draft',
        post_type: 'wp_navigation',
        post_name: 'dee',
        post_content: DEE_CONTENT,
      },
    ]);
    expect(selectLatestNavigationPost(db)).toEqual({ id: 20, content: BEE_CONTENT });
    db.close();
  });

  it('ID4(dump)より古い publish は負け、ID が大きくても日付で ID4 が選ばれる', () => {
    // 検出対象: 日付降順が ID 降順より優先されること(古い日付・大きい ID の行を混ぜる)
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([
      ...loadDumpPosts([4]),
      {
        ID: 30,
        post_date_gmt: '2026-10-01 00:00:00',
        post_title: 'Old',
        post_status: 'publish',
        post_type: 'wp_navigation',
        post_name: 'old',
        post_content: OLD_CONTENT,
      },
    ]);
    expect(selectLatestNavigationPost(db)).toEqual({ id: 4, content: '<!-- wp:page-list /-->' });
    db.close();
  });

  it('post_date_gmt が同一なら ID 降順で後の行(ID 31)を選ぶ', () => {
    // 検出対象: 同日時タイブレークの ID 降順
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([
      ...loadDumpPosts([4]),
      {
        ID: 31,
        post_date_gmt: '2026-10-27 22:52:10',
        post_title: 'Tie',
        post_status: 'publish',
        post_type: 'wp_navigation',
        post_name: 'tie',
        post_content: TIE_CONTENT,
      },
    ]);
    expect(selectLatestNavigationPost(db)).toEqual({ id: 31, content: TIE_CONTENT });
    db.close();
  });

  it('より新しい future の wp_navigation は無視し、ID4 を選ぶ', () => {
    // 検出対象: post_status='publish' の厳密一致(future を含めない)
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([
      ...loadDumpPosts([4]),
      {
        ID: 32,
        post_date_gmt: '2026-11-01 00:00:00',
        post_title: 'Future',
        post_status: 'future',
        post_type: 'wp_navigation',
        post_name: 'future',
        post_content: FUTURE_CONTENT,
      },
    ]);
    expect(selectLatestNavigationPost(db)).toEqual({ id: 4, content: '<!-- wp:page-list /-->' });
    db.close();
  });

  it('publish の wp_navigation がゼロ(ID4 を draft にし、draft のみ)なら null', () => {
    // 検出対象: publish 0 件時に null を返すこと
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([
      ...loadDumpPosts([4]).map((r) => ({ ...r, post_status: 'draft' })),
    ]);
    expect(selectLatestNavigationPost(db)).toBeNull();
    db.close();
  });

  it('空 DB では null を返す', () => {
    // 検出対象: 行が無い場合の null
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([]);
    expect(selectLatestNavigationPost(db)).toBeNull();
    db.close();
  });
});

describe('selectPublishedPagesForNav', () => {
  it('publish の固定ページ(パスワード保護含む)を menu_order→title→ID 順で返す', () => {
    // 検出対象: post_type='page' AND post_status='publish'、パスワード保護を含む、
    //   並び menu_order 昇順 → post_title 昇順 → ID 昇順、Prot Page が Sample Page より前
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([...loadDumpPosts([1, 2, 3, 4]), ...pageFixtures]);
    expect(selectPublishedPagesForNav(db)).toEqual([
      { id: 40, title: 'Prot Page', slug: 'prot-page', parent: 0, menuOrder: -1 },
      { id: 45, title: 'Child Page', slug: 'child-page', parent: 2, menuOrder: 0 },
      { id: 2, title: 'Sample Page', slug: 'sample-page', parent: 0, menuOrder: 0 },
      { id: 47, title: 'Dup', slug: 'dup-a', parent: 0, menuOrder: 3 },
      { id: 48, title: 'Dup', slug: 'dup-b', parent: 0, menuOrder: 3 },
    ]);
    db.close();
  });

  it('draft / private / future / trash の固定ページを結果に含めず、そのタイトル・slug も現れない', () => {
    // 検出対象: post_status='publish' 以外の除外
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([...loadDumpPosts([1, 2, 3, 4]), ...pageFixtures]);
    const result = selectPublishedPagesForNav(db);
    const ids = result.map((p) => p.id);
    for (const hidden of [3, 41, 42, 43, 44]) {
      expect(ids).not.toContain(hidden);
    }
    const json = JSON.stringify(result);
    for (const marker of [
      'Draft Page',
      'draft-page',
      'Private Page',
      'private-page',
      'Future Page',
      'future-page',
      'Trash Page',
      'trash-page',
      'Privacy Policy',
      'privacy-policy',
    ]) {
      expect(json).not.toContain(marker);
    }
    db.close();
  });

  it('post_type=post の publish 投稿(Blog Post / dump の Hello world!)を含めない', () => {
    // 検出対象: post_type='page' フィルタ
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([...loadDumpPosts([1, 2, 3, 4]), ...pageFixtures]);
    const result = selectPublishedPagesForNav(db);
    const ids = result.map((p) => p.id);
    expect(ids).not.toContain(46);
    expect(ids).not.toContain(1);
    expect(JSON.stringify(result)).not.toContain('Blog Post');
    db.close();
  });

  it('階層ページは parent に post_parent を返す', () => {
    // 検出対象: post_parent → parent のマッピング(Child Page は親 ID 2)
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([...loadDumpPosts([1, 2, 3, 4]), ...pageFixtures]);
    const child = selectPublishedPagesForNav(db).find((p) => p.id === 45);
    expect(child).toEqual({ id: 45, title: 'Child Page', slug: 'child-page', parent: 2, menuOrder: 0 });
    db.close();
  });

  it('DTO のキー集合は厳密に {id,title,slug,parent,menuOrder}、パスワード・本文の値は現れない', () => {
    // 検出対象: DTO に post_password / post_content を含めないこと
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([...loadDumpPosts([1, 2, 3, 4]), ...pageFixtures]);
    const result = selectPublishedPagesForNav(db);
    expect(result.length).toBeGreaterThan(0);
    for (const dto of result) {
      expect(Object.keys(dto).sort()).toEqual(['id', 'menuOrder', 'parent', 'slug', 'title']);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain('PW-SECRET-7f3a');
    expect(json).not.toContain('PROTECTED-BODY-MARKER');
    // dump の Sample Page 本文の一部(実データ)も返り値に出ないこと
    expect(json).not.toContain('This is an example page');
    db.close();
  });

  it('空 DB では空配列を返す', () => {
    // 検出対象: 行が無い場合に空配列
    // 想定 Red 理由: navigation.ts 未存在のため import 解決に失敗する
    const db = openDb([]);
    expect(selectPublishedPagesForNav(db)).toEqual([]);
    db.close();
  });
});
