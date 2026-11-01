// SPDX-License-Identifier: GPL-3.0-only
import { parse } from '@wordpress/block-serialization-default-parser';
import { createPostRegistry, renderTree, type RenderCtx } from './blockRegistry.js';
import type { GlobalConfig } from './layoutInput.js';
import type { QueriesPort } from './ports.js';
import { texturizeText, type ParsedBlock } from './renderBlocks.js';
import { sanitizeHtml } from './sanitizeHtml.js';

export interface RenderContentContext {
  queries: QueriesPort;
  siteUrl: string;
}

/**
 * 投稿本文を HTML に変換する。投稿用レジストリ(createPostRegistry)で描画し、
 * 出力はすべて sanitizeHtml を通す。DB には直接依存せず、ctx.queries 経由で問い合わせる。
 */
export function renderContent(postContent: string, ctx: RenderContentContext): string {
  // global は layout(テーマ側)用。投稿起点のブロックは参照しないため、ここだけで空値を埋める。
  const renderCtx: RenderCtx = {
    global: {} as GlobalConfig,
    renderState: { modalCounter: 0 },
    site: { name: '', url: ctx.siteUrl },
    queries: ctx.queries,
  };
  return renderPostBody(postContent, renderCtx);
}

/**
 * 本文 post_content を投稿用レジストリで描画し、texturize と sanitizeHtml を通した HTML を返す。
 * core/post-content(テーマ側)からも同じパイプラインを使うため、ここに切り出している。
 */
export function renderPostBody(postContent: string, ctx: RenderCtx): string {
  const blocks = parse(postContent) as ParsedBlock[];
  const html = renderTree(blocks, ctx, createPostRegistry());
  return sanitizeHtml(texturizeText(html));
}
