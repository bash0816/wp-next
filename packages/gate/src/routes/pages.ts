// SPDX-License-Identifier: GPL-3.0-only
import { selectVisiblePostBySlug, selectVisiblePosts } from '@wpn/db/src/visiblePosts.js';
import { escapeHtml, postPath } from '../html.js';
import { dynamic, notFound } from '../respond.js';
import type { RouteCtx } from '../handler.js';

const SEARCH_MAX_CHARS = 200;
const SEARCH_LIMIT = 20;

// GET /p/<slug>: 可視でなければ notFound と完全同一の応答を返す。
export function postRoute(ctx: RouteCtx, rawSlug: string): Response {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return notFound(ctx.method);
  }
  const row = selectVisiblePostBySlug(ctx.deps.db, ctx.actor, slug);
  if (row === null) return notFound(ctx.method);
  const html = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>${escapeHtml(row.title ?? '')}</title></head>
<body>
<article>
<h1>${escapeHtml(row.title ?? '')}</h1>
<p class="excerpt">${escapeHtml(row.excerpt ?? '')}</p>
<div class="content">${escapeHtml(row.content ?? '')}</div>
</article>
</body>
</html>
`;
  return dynamic(ctx.method, html, 'text/html; charset=utf-8');
}

// GET /search?q=: 前後空白を除去し200字に切り詰める。空なら0件で200。
export function searchRoute(ctx: RouteCtx): Response {
  const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, SEARCH_MAX_CHARS).trim();
  const rows =
    q === ''
      ? []
      : selectVisiblePosts(ctx.deps.db, ctx.actor, { search: q, limit: SEARCH_LIMIT });
  const items = rows
    .map(
      (row) =>
        `<li><a href="${escapeHtml(ctx.deps.siteUrl + postPath(row.slug ?? ''))}">${escapeHtml(row.title ?? '')}</a></li>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>Search</title></head>
<body>
<main>
<ul class="results">
${items}
</ul>
</main>
</body>
</html>
`;
  return dynamic(ctx.method, html, 'text/html; charset=utf-8');
}
