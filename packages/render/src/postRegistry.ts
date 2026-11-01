// SPDX-License-Identifier: GPL-3.0-only
import type { BlockRenderer, RenderCtx } from './blockRegistry.js';
import { addClassesToFirstElement, type ParsedBlock } from './renderBlocks.js';
import { sanitizeTitleHtml } from './sanitizeHtml.js';

// 投稿本文用のブロックレンダラ。テーマ由来の renderer とは別に、投稿単位のレジストリへ登録する。
// 依存は ctx.queries(QueriesPort)のみ。@wpn/db / node:sqlite には依存しない。

const LATEST_POSTS_BLOCK = 'core/latest-posts';
const DEFAULT_POSTS_TO_SHOW = 5;
const LIST_CLASSES =
  'wp-block-latest-posts__list wp-block-latest-posts is-layout-flow wp-block-latest-posts-is-layout-flow';

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

/** ASCII の二重引用符を曲がり引用符に変換する (WordPress の texturize 相当) */
function curlyDoubleQuotes(text: string): string {
  return text.replace(/"([^"]*)"/g, '“$1”');
}

/**
 * 静的ブロック共通の描画。innerBlocks は renderChildren を 1 回だけ呼び、
 * 結果を innerContent の最初の null 位置に入れる(以降の null 位置は空)。
 * 子の出力順は保たれ、ブロック間の空白差は htmlEquals が無視する。
 */
function renderStaticChildren(
  block: ParsedBlock,
  renderChildren: (blocks: ParsedBlock[]) => string,
): string {
  const children = block.innerBlocks;
  const rendered = children.length > 0 ? renderChildren(children) : '';
  let used = false;
  let html = block.innerContent
    .map((chunk) => {
      if (chunk !== null) {
        return chunk;
      }
      if (used) {
        return '';
      }
      used = true;
      return rendered;
    })
    .join('');
  if (!used && rendered !== '') {
    html += rendered;
  }
  return html;
}

function staticBlock(
  transform?: (html: string) => string,
): BlockRenderer {
  return {
    validateAttrs: () => {},
    render: (block, _ctx, renderChildren) => {
      const html = renderStaticChildren(block, renderChildren);
      return transform ? transform(html) : html;
    },
  };
}

function renderLatestPosts(block: ParsedBlock, ctx: RenderCtx): string {
  if (ctx.queries === undefined) {
    throw new RangeError('core/latest-posts requires ctx.queries');
  }
  if (ctx.site === undefined) {
    throw new RangeError('core/latest-posts requires ctx.site.url');
  }
  const attrs: Record<string, unknown> = block.attrs ?? {};
  const requested =
    typeof attrs.postsToShow === 'number' && Number.isFinite(attrs.postsToShow)
      ? Math.trunc(attrs.postsToShow)
      : DEFAULT_POSTS_TO_SHOW;
  const postsToShow = Math.min(100, Math.max(1, requested));
  const order = attrs.order === 'asc' ? 'asc' : 'desc';

  const posts = ctx.queries.latestPosts({ limit: postsToShow, order });
  const siteUrl = ctx.site.url;
  const items = posts.map((post) => {
    const prefix = post.isProtected ? 'Protected: ' : '';
    // 題名は専用サニタイザで許可タグだけ残す(WP の題名 kses 相当)。
    // 引用符の変換はタグ属性を壊さないよう、サニタイズ後のテキスト部分にだけ適用する。
    const sanitized = sanitizeTitleHtml(`${prefix}${post.title}`);
    const title = sanitized
      .split(/(<[^>]*>)/)
      .map((part, i) => (i % 2 === 1 ? part : curlyDoubleQuotes(part)))
      .join('');
    const href = escapeAttr(`${siteUrl}/${encodeURIComponent(post.slug)}/`);
    return `<li><a class="wp-block-latest-posts__post-title" href="${href}">${title}</a></li>`;
  });

  return `<ul class="${LIST_CLASSES}">${items.join('\n')}\n</ul>`;
}

export const postBlockRenderers: Array<[string, BlockRenderer]> = [
  ['core/heading', staticBlock()],
  [
    'core/paragraph',
    staticBlock((html) => addClassesToFirstElement(html, ['wp-block-paragraph'])),
  ],
  ['core/list', staticBlock()],
  ['core/list-item', staticBlock()],
  [
    'core/quote',
    staticBlock((html) =>
      addClassesToFirstElement(html, ['is-layout-flow', 'wp-block-quote-is-layout-flow']),
    ),
  ],
  ['core/separator', staticBlock()],
  [
    LATEST_POSTS_BLOCK,
    {
      validateAttrs: () => {},
      render: (block, ctx) => renderLatestPosts(block, ctx),
    },
  ],
];
