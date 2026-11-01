// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { ContentPort, PostCtx } from '@wpn/core/ports';
import {
  assertNoStickyOrThumbnail,
  buildContentPort,
  buildPostCtx,
  type PostRowForCtx,
} from './postData.js';

type Ref = { slug: string } | { id: number };

interface PostRow extends PostRowForCtx {
  post_password: string | null;
}

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

function findPublished(db: DatabaseSync, ref: Ref): PostRow | null {
  const base = `SELECT ID AS id, post_name AS slug, post_title AS title,
                       post_date_gmt, post_content, post_password, post_author
                  FROM posts
                 WHERE post_status = 'publish' AND post_type = 'post'`;
  const row =
    'id' in ref
      ? db.prepare(`${base} AND ID = ?`).get(ref.id)
      : db.prepare(`${base} AND post_name = ? ORDER BY ID LIMIT 1`).get(ref.slug);
  return (row as PostRow | undefined) ?? null;
}

/**
 * 現在の投稿を公開状態の投稿から開く。見つからない・非公開・パスワード保護の投稿は null。
 * 未対応の dump 状態(sticky / サムネイル / 非対応 term / 基準外 options)は UnsupportedDataError。
 */
export function openCurrentPost(
  db: DatabaseSync,
  ref: { slug: string } | { id: number },
): { post: PostCtx; content: ContentPort } | null {
  const parsed = parseRef(ref);
  const row = findPublished(db, parsed);
  if (!row) return null;
  if (row.post_password !== null && row.post_password !== '') return null;
  assertNoStickyOrThumbnail(db, row.id);
  const post = buildPostCtx(db, row);
  const content = buildContentPort(db, row);
  return { post, content };
}
