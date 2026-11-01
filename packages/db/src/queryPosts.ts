// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { QueryItem } from '@wpn/core/ports';
import {
  UnsupportedDataError,
  assertNoStickyOrThumbnail,
  buildContentPort,
  buildPostCtx,
  type PostRowForCtx,
} from './postData.js';

// 対応する spec のキー。これ以外のキー・欠落は RangeError にする。
const SPEC_KEYS = [
  'postType',
  'perPage',
  'pages',
  'offset',
  'order',
  'orderBy',
  'author',
  'search',
  'exclude',
  'sticky',
  'inherit',
  'taxQuery',
  'parents',
] as const;

interface QueryRow extends PostRowForCtx {
  post_password: string | null;
}

// 現時点で対応するのは「既定の一覧」のみ。それ以外の指定は RangeError。
function parsePerPage(spec: Record<string, unknown>): number {
  const perPage = spec.perPage;
  if (typeof perPage !== 'number' || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new RangeError('perPage は 1〜100 の整数で指定してください');
  }
  return perPage;
}

function assertSupportedSpec(spec: unknown): asserts spec is Record<string, unknown> {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new RangeError('spec はオブジェクトで指定してください');
  }
  const obj = spec as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (!(SPEC_KEYS as readonly string[]).includes(key)) {
      throw new RangeError(`未対応の spec キーです: ${key}`);
    }
  }
  for (const key of SPEC_KEYS) {
    if (!(key in obj)) {
      throw new RangeError(`spec に ${key} がありません`);
    }
  }
  if (obj.postType !== 'post') throw new RangeError('postType は "post" のみ対応です');
  if (obj.pages !== 0) throw new RangeError('pages は 0 のみ対応です');
  if (obj.offset !== 0) throw new RangeError('offset は 0 のみ対応です');
  if (obj.order !== 'desc') throw new RangeError('order は "desc" のみ対応です');
  if (obj.orderBy !== 'date') throw new RangeError('orderBy は "date" のみ対応です');
  if (obj.author !== '') throw new RangeError('author は未対応です');
  if (obj.search !== '') throw new RangeError('search は未対応です');
  if (!Array.isArray(obj.exclude) || obj.exclude.length !== 0) {
    throw new RangeError('exclude は未対応です');
  }
  if (obj.sticky !== '') throw new RangeError('sticky は未対応です');
  if (obj.inherit !== false) throw new RangeError('inherit は未対応です');
  if (obj.taxQuery !== null) throw new RangeError('taxQuery は未対応です');
  if (!Array.isArray(obj.parents) || obj.parents.length !== 0) {
    throw new RangeError('parents は未対応です');
  }
}

/**
 * 公開済みの通常投稿を新しい順に perPage 件まで返す。
 * パスワード保護の投稿は本文(contentOf)を含めない。未対応の dump 状態は UnsupportedDataError を投げる。
 */
export function queryPosts(db: DatabaseSync, spec: unknown): QueryItem[] {
  assertSupportedSpec(spec);
  const perPage = parsePerPage(spec);
  const rows = db
    .prepare(
      `SELECT ID AS id, post_name AS slug, post_title AS title,
              post_date_gmt, post_content, post_password
         FROM posts
        WHERE post_type = 'post' AND post_status = 'publish'
        ORDER BY post_date_gmt DESC, ID DESC
        LIMIT ?`,
    )
    .all(perPage) as unknown as QueryRow[];

  const otherTaxonomy = db.prepare(
    `SELECT tt.taxonomy AS taxonomy
       FROM term_relationships tr
       JOIN term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      WHERE tr.object_id = ?
        AND tt.taxonomy NOT IN ('category', 'post_tag', 'post_format')
      LIMIT 1`,
  );

  return rows.map((row) => {
    const other = otherTaxonomy.get(row.id) as { taxonomy: string } | undefined;
    if (other) {
      throw new UnsupportedDataError(`非対応のタクソノミーが付いています: ${other.taxonomy}`);
    }
    assertNoStickyOrThumbnail(db, row.id);
    const post = buildPostCtx(db, row);
    const content = buildContentPort(row);
    if (post.protected) {
      delete content.contentOf;
    }
    return { post, content };
  });
}
