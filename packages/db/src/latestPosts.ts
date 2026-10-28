// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';

/**
 * 最新の公開記事を取得する。
 *
 * ADR-027: 匿名閲覧者向けに、公開済み (post_status = 'publish') の記事を
 * 保護記事も含めて返す。保護記事はタイトルに "Protected: " を付けて表示する前提のため、
 * パスワード本体は返さず isProtected フラグだけを返す。
 * private / draft / future は含めない。
 */
export interface LatestPublishedPost {
  id: number;
  slug: string;
  title: string;
  isProtected: boolean;
}

export interface LatestPublishedPostsOptions {
  limit: number;
  order: 'asc' | 'desc';
}

const MAX_LIMIT = 100;

function assertInteger(name: string, value: number, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} は ${min}〜${max} の整数である必要があります: ${String(value)}`);
  }
}

const DIRECTION: Record<LatestPublishedPostsOptions['order'], 'ASC' | 'DESC'> = {
  asc: 'ASC',
  desc: 'DESC',
};

interface LatestPostRow {
  id: number;
  slug: string;
  title: string;
  password: string | null;
}

export function selectLatestPublishedPosts(
  db: DatabaseSync,
  opts: LatestPublishedPostsOptions,
): LatestPublishedPost[] {
  assertInteger('limit', opts.limit, 1, MAX_LIMIT);
  const dir = DIRECTION[opts.order];
  if (dir === undefined) {
    throw new RangeError(`order は 'asc' または 'desc' である必要があります: ${String(opts.order)}`);
  }

  const rows = db
    .prepare(
      `SELECT ID AS id, post_name AS slug, post_title AS title, post_password AS password
         FROM posts
        WHERE post_status = 'publish' AND post_type = 'post'
        ORDER BY post_date_gmt ${dir}, ID ${dir}
        LIMIT ?`,
    )
    .all(opts.limit) as unknown as LatestPostRow[];

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    isProtected: (row.password ?? '') !== '',
  }));
}
