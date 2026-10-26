// SPDX-License-Identifier: GPL-3.0-only
import { selectVisiblePosts } from '@wpn/db/src/visiblePosts.js';
import { postPath } from '../html.js';
import { dynamic } from '../respond.js';
import type { RouteCtx } from '../handler.js';

const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

// GET /wp-json/wp/v2/posts: 公開フィールドのみ。不正な per_page/page は既定値に丸める。
export function restPostsRoute(ctx: RouteCtx): Response {
  const perPageRaw = parsePositiveInt(ctx.url.searchParams.get('per_page'));
  const perPage =
    perPageRaw !== null && perPageRaw <= MAX_PER_PAGE ? perPageRaw : DEFAULT_PER_PAGE;
  const page = parsePositiveInt(ctx.url.searchParams.get('page')) ?? 1;
  const offset = (page - 1) * perPage;
  // 安全整数を超えるオフセットは結果が存在しないため空配列を返す。
  if (!Number.isSafeInteger(offset)) {
    return dynamic(ctx.method, '[]', 'application/json; charset=utf-8');
  }
  const rows = selectVisiblePosts(ctx.deps.db, ctx.actor, {
    type: 'post',
    limit: perPage,
    offset,
  });
  const body = rows.map((row) => ({
    id: row.id,
    slug: row.slug ?? '',
    title: row.title ?? '',
    excerpt: row.excerpt ?? '',
    date: row.modifiedGmt ?? '',
    link: ctx.deps.siteUrl + postPath(row.slug ?? ''),
  }));
  return dynamic(ctx.method, JSON.stringify(body), 'application/json; charset=utf-8');
}
