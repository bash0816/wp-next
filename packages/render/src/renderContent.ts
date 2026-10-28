// SPDX-License-Identifier: GPL-3.0-only
import { parse } from '@wordpress/block-serialization-default-parser';
import type { DatabaseSync } from 'node:sqlite';
import { selectLatestPublishedPosts } from '@wpn/db';
import { renderBlocks, renderBlock, texturizeText } from './renderBlocks.js';
import type { ParsedBlock } from './renderBlocks.js';
import { sanitizeHtml } from './sanitizeHtml.js';

export interface RenderContentContext {
  db: DatabaseSync;
  siteUrl: string;
}

const LATEST_POSTS_BLOCK = 'core/latest-posts';
const DEFAULT_POSTS_TO_SHOW = 5;
const LIST_CLASSES = 'wp-block-latest-posts__list wp-block-latest-posts is-layout-flow wp-block-latest-posts-is-layout-flow';

/** 直直の二重引用符を曲がり引用符に変換する (WordPress の texturize 相当) */
function curlyDoubleQuotes(text: string): string {
  return text.replace(/"([^"]*)"/g, '“$1”');
}

function renderLatestPosts(block: ParsedBlock, ctx: RenderContentContext): string {
  const attrs = block.attrs ?? {};
  const requested =
    typeof attrs.postsToShow === 'number' && Number.isFinite(attrs.postsToShow)
      ? Math.trunc(attrs.postsToShow)
      : DEFAULT_POSTS_TO_SHOW;
  const postsToShow = Math.min(100, Math.max(1, requested));
  const order = attrs.order === 'asc' ? 'asc' : 'desc';

  const posts = selectLatestPublishedPosts(ctx.db, { limit: postsToShow, order });
  const items = posts.map((post) => {
    const prefix = post.isProtected ? 'Protected: ' : '';
    const title = curlyDoubleQuotes(`${prefix}${post.title}`);
    const href = `${ctx.siteUrl}/${encodeURIComponent(post.slug)}/`;
    return `<li><a class="wp-block-latest-posts__post-title" href="${href}">${title}</a></li>`;
  });

  return `<ul class="${LIST_CLASSES}">${items.join('\n')}\n</ul>`;
}

/**
 * 投稿本文を HTML に変換する。
 * core/latest-posts は DB から記事一覧を組み立てて描画し、それ以外は renderBlocks に委譲する。
 * 出力はすべて sanitizeHtml を通す。
 */
export function renderContent(postContent: string, ctx: RenderContentContext): string {
  const blocks = parse(postContent) as ParsedBlock[];
  const hasLatestPosts = blocks.some((block) => block.blockName === LATEST_POSTS_BLOCK);
  if (!hasLatestPosts) {
    return renderBlocks(postContent);
  }

  const html = blocks
    .map((block) =>
      block.blockName === LATEST_POSTS_BLOCK ? renderLatestPosts(block, ctx) : renderBlock(block),
    )
    .join('');
  return sanitizeHtml(texturizeText(html));
}
