// SPDX-License-Identifier: GPL-3.0-only
// D-3d STEP5: core/post-content(テーマ由来・本文描画)のレンダラ。
// 対応は align:'full' + layout:{type:'constrained'} の固定形のみ。それ以外は RangeError(fail-closed)。
// 本文は renderPostBody(投稿用レジストリ + sanitizeHtml)で描画し、子文脈は新しい RenderCtx で渡す。
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { renderPostBody } from './renderContent.js';
import { type ParsedBlock } from './renderBlocks.js';

const POST_CONTENT_NAME = 'core/post-content';
const ALLOWED_ATTR_KEYS = ['align', 'layout'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new RangeError(`${where}: attribute not allowed: ${key}`);
    }
  }
}

// attrs は { align: 'full', layout: { type: 'constrained' } } と完全一致すること。
// 欠落・別値・余分なキーはすべて RangeError。
function validatePostContentAttrs(attrs: Record<string, unknown>): void {
  assertOnlyKeys(attrs, ALLOWED_ATTR_KEYS, POST_CONTENT_NAME);
  if (!('align' in attrs) || attrs.align !== 'full') {
    throw new RangeError(`${POST_CONTENT_NAME}: align must be 'full'`);
  }
  if (!('layout' in attrs)) {
    throw new RangeError(`${POST_CONTENT_NAME}: layout is required`);
  }
  const layout = attrs.layout;
  if (!isPlainObject(layout) || Object.keys(layout).length !== 1 || layout.type !== 'constrained') {
    throw new RangeError(`${POST_CONTENT_NAME}: layout must be {type:'constrained'}`);
  }
}

export const postContentRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    validatePostContentAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, _renderChildren) => {
    const attrs = block.attrs ?? {};
    validatePostContentAttrs(attrs);
    if (block.innerBlocks.length !== 0) {
      throw new RangeError(`${POST_CONTENT_NAME}: innerBlocks are not allowed`);
    }
    if (ctx.post === undefined) {
      throw new RangeError(`${POST_CONTENT_NAME}: ctx.post is required`);
    }
    if (ctx.content === undefined) {
      throw new RangeError(`${POST_CONTENT_NAME}: ctx.content is required`);
    }
    if (ctx.site === undefined) {
      throw new RangeError(`${POST_CONTENT_NAME}: ctx.site is required`);
    }
    // 保護投稿では contentOf が無い。本文を出さず fail-closed にする。
    const contentOf = ctx.content.contentOf;
    if (typeof contentOf !== 'function') {
      throw new RangeError(`${POST_CONTENT_NAME}: ctx.content.contentOf is required`);
    }
    const bodyCtx: RenderCtx = {
      global: ctx.global,
      renderState: ctx.renderState,
      site: ctx.site,
      // exactOptionalPropertyTypes のため、queries は存在するときだけ載せる。
      ...(ctx.queries !== undefined ? { queries: ctx.queries } : {}),
    };
    const body = renderPostBody(contentOf(), bodyCtx);
    return `<div class="entry-content alignfull wp-block-post-content has-global-padding is-layout-constrained wp-block-post-content-is-layout-constrained">${body}</div>`;
  },
};
