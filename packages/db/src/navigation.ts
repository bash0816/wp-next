// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';

/**
 * ナビゲーション解決に使う読み取り専用クエリ。
 *
 * ADR-033: 匿名向けの page-list ナビでは、パスワード保護の publish 固定ページも
 * タイトルが素のまま表示される。これは ADR-027 と同種の例外であり、
 * 保護ページのタイトル露出を許容する前提で本関数は保護状態による除外を行わない。
 *
 * いずれの関数も本文(post_content)・パスワード(post_password)を SELECT せず、
 * 返り値にも含めない。SQL は固定文字列で、ユーザー入力は連結しない。
 */

export interface NavigationPost {
  id: number;
  content: string;
}

export interface NavigationPage {
  id: number;
  title: string;
  slug: string;
  parent: number;
  menuOrder: number;
}

interface NavigationPostRow {
  id: number;
  content: string;
}

interface NavigationPageRow {
  id: number;
  title: string;
  slug: string;
  parent: number;
  menuOrder: number;
}

/**
 * 最新の publish な wp_navigation 投稿を返す。無ければ null。
 * ブロックに ref が無い場合の解決先として使う(WP 同様、より新しい draft / future は無視)。
 */
export function selectLatestNavigationPost(db: DatabaseSync): NavigationPost | null {
  const row = db
    .prepare(
      `SELECT ID AS id, post_content AS content
         FROM posts
        WHERE post_type = 'wp_navigation' AND post_status = 'publish'
        ORDER BY post_date_gmt DESC, ID DESC
        LIMIT 1`,
    )
    .get() as unknown as NavigationPostRow | undefined;

  if (row === undefined) {
    return null;
  }
  return { id: row.id, content: row.content };
}

/**
 * 匿名向けナビ(page-list)に載せる publish の固定ページ一覧を返す。
 * 並びは menu_order 昇順 → post_title 昇順 → ID 昇順。
 * パスワード保護ページも含む(ADR-033)。draft / private / future / trash は含めない。
 */
export function selectPublishedPagesForNav(db: DatabaseSync): NavigationPage[] {
  const rows = db
    .prepare(
      `SELECT ID AS id, post_title AS title, post_name AS slug,
              post_parent AS parent, menu_order AS menuOrder
         FROM posts
        WHERE post_type = 'page' AND post_status = 'publish'
        ORDER BY menu_order ASC, post_title ASC, ID ASC`,
    )
    .all() as unknown as NavigationPageRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    parent: row.parent,
    menuOrder: row.menuOrder,
  }));
}
