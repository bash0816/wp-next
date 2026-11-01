// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { ContentPort, PostCtx } from '@wpn/core/ports';
import {
  assertNoStickyOrThumbnail,
  buildContentPort,
  buildPostCtx,
  UnsupportedDataError,
  type PostRowForCtx,
} from './postData.js';

type Ref = { slug: string } | { id: number };

interface PostRow extends PostRowForCtx {
  post_password: string | null;
  post_parent: number;
}

export type CurrentKind = 'post' | 'page';

// 公開(publish)かつ通常の post のみを対象にする。ref は slug か正の整数 id のどちらか一方。
function parseRef(ref: unknown): Ref {
  if (typeof ref !== 'object' || ref === null) {
    throw new RangeError('ref はオブジェクトで指定してください');
  }
  const hasSlug = 'slug' in ref;
  const hasId = 'id' in ref;
  if (hasSlug === hasId) {
    throw new RangeError('ref は slug か id のどちらか一方だけを指定してください');
  }
  if (hasSlug) {
    const slug = (ref as { slug: unknown }).slug;
    if (typeof slug !== 'string' || slug === '') {
      throw new RangeError('slug は空でない文字列で指定してください');
    }
    return { slug };
  }
  const id = (ref as { id: unknown }).id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new RangeError('id は正の整数で指定してください');
  }
  return { id };
}

// 公開(publish)かつ指定 kind(post_type)のみを対象にする。
function findPublished(db: DatabaseSync, ref: Ref, kind: CurrentKind): PostRow | null {
  const base = `SELECT ID AS id, post_name AS slug, post_title AS title,
                       post_date_gmt, post_content, post_password, post_author, post_parent
                  FROM posts
                 WHERE post_status = 'publish' AND post_type = ?`;
  const row =
    'id' in ref
      ? db.prepare(`${base} AND ID = ?`).get(kind, ref.id)
      : db.prepare(`${base} AND post_name = ? ORDER BY ID LIMIT 1`).get(kind, ref.slug);
  return (row as PostRow | undefined) ?? null;
}

/**
 * 現在の投稿(kind='post' は通常の投稿、'page' は固定ページ)を公開状態から開く。
 * 見つからない・非公開・パスワード保護の投稿は null。
 * 未対応の dump 状態(sticky / サムネイル / 非対応 term / 基準外 options / 階層 page)は UnsupportedDataError。
 * kind が 'post' | 'page' 以外なら RangeError。
 */
export function openCurrentPost(
  db: DatabaseSync,
  ref: { slug: string } | { id: number },
  kind: CurrentKind = 'post',
): { post: PostCtx; content: ContentPort } | null {
  if (kind !== 'post' && kind !== 'page') {
    throw new RangeError('kind は "post" か "page" で指定してください');
  }
  const parsed = parseRef(ref);
  const row = findPublished(db, parsed, kind);
  if (!row) return null;
  if (row.post_password !== null && row.post_password !== '') return null;
  if (kind === 'page' && Number(row.post_parent) !== 0) {
    throw new UnsupportedDataError('階層のある page(post_parent≠0)は非対応です');
  }
  assertNoStickyOrThumbnail(db, row.id);
  const withKind = { ...row, kind };
  const post = buildPostCtx(db, withKind);
  const content = buildContentPort(db, withKind);
  return { post, content };
}
