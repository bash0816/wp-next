// SPDX-License-Identifier: GPL-3.0-only
import { selectVisiblePosts } from '@wpn/db/src/visiblePosts.js';
import { escapeHtml, postPath } from '../html.js';
import { dynamic } from '../respond.js';
import type { RouteCtx } from '../handler.js';

const FEED_LIMIT = 20;
const SITEMAP_LIMIT = 100;

// GET /feed: RSS 2.0。本文・抜粋は必ずエスケープ(`]]>` は `]]&gt;` になる)。
export function feedRoute(ctx: RouteCtx): Response {
  const site = ctx.deps.siteUrl;
  const rows = selectVisiblePosts(ctx.deps.db, ctx.actor, { type: 'post', limit: FEED_LIMIT });
  const items = rows
    .map(
      (row) => `    <item>
      <title>${escapeHtml(row.title ?? '')}</title>
      <link>${escapeHtml(site + postPath(row.slug ?? ''))}</link>
      <guid>${escapeHtml(site + postPath(row.slug ?? ''))}</guid>
      <description>${escapeHtml(row.excerpt ?? '')}</description>
    </item>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(site)}</title>
    <link>${escapeHtml(site)}</link>
${items}
  </channel>
</rss>
`;
  return dynamic(ctx.method, xml, 'application/rss+xml; charset=utf-8');
}

// GET /sitemap.xml: slug が空の投稿は除外し、<loc> を ID 昇順で出力する。
export function sitemapRoute(ctx: RouteCtx): Response {
  const site = ctx.deps.siteUrl;
  const rows = selectVisiblePosts(ctx.deps.db, ctx.actor, { limit: SITEMAP_LIMIT })
    .filter((row) => row.slug !== null && row.slug !== '')
    .sort((a, b) => a.id - b.id);
  const urls = rows
    .map((row) => `  <url><loc>${escapeHtml(site + postPath(row.slug ?? ''))}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return dynamic(ctx.method, xml, 'application/xml; charset=utf-8');
}
