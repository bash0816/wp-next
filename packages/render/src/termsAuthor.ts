// SPDX-License-Identifier: GPL-3.0-only
// D3c2: core/post-terms(category のみ)・core/post-author-name・core/post-featured-image のレンダラ。
// 投稿文脈(ctx.post)とコンテンツポート(ctx.content)から値を取り、テキストは escape して出力する。URL は http(s) のみ許可する。
// 対応範囲外の入力は fail-closed で RangeError とする。
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { type ContentPort, type PostCtx } from './ports.js';

type Obj = Record<string, unknown>;

const TERMS_BLOCK = 'core/post-terms';
const AUTHOR_BLOCK = 'core/post-author-name';
const IMAGE_BLOCK = 'core/post-featured-image';

const TERMS_KEYS = ['term', 'separator', 'className', 'style'] as const;
const AUTHOR_KEYS = ['isLink'] as const;
const IMAGE_KEYS = ['aspectRatio'] as const;

const FONT_WEIGHTS: ReadonlySet<string> = new Set(['100', '200', '300', '400', '500', '600', '700', '800', '900']);
const ASPECT_RATIO_RE = /^[1-9]\d*\/[1-9]\d*$/;

const rangeError = (blockName: string, msg: string): RangeError =>
  new RangeError(`${blockName}: ${msg}`);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

const assertKeys = (blockName: string, attrs: Obj, allowed: readonly string[]): void => {
  for (const key of Object.keys(attrs)) {
    if (!allowed.includes(key)) {
      throw rangeError(blockName, `未対応の属性です: ${key}`);
    }
  }
};

const assertNoChildren = (blockName: string, block: ParsedBlock): void => {
  if (block.innerBlocks.length > 0) {
    throw rangeError(blockName, '子ブロックは対応していません');
  }
};

const requirePost = (blockName: string, ctx: RenderCtx): PostCtx => {
  if (ctx.post === undefined) {
    throw rangeError(blockName, '投稿文脈(post)がありません');
  }
  return ctx.post;
};

const requireContent = (blockName: string, ctx: RenderCtx): ContentPort => {
  if (ctx.content === undefined) {
    throw rangeError(blockName, 'コンテンツポート(content)がありません');
  }
  return ctx.content;
};

// URL は絶対 http(s) のみ許可する。出力は生の文字列を属性用に escape する。
const safeHref = (blockName: string, url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw rangeError(blockName, 'url が不正です');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw rangeError(blockName, 'url は http または https である必要があります');
  }
  return escapeAttr(url);
};

// ---- core/post-terms ----

type ParsedTermsAttrs = {
  term: 'category' | 'post_tag';
  separator: string | undefined;
  className: string | undefined;
  fontWeight: string | undefined;
};

const parseTermsStyle = (style: unknown): string | undefined => {
  if (style === undefined) return undefined;
  if (!isObj(style)) {
    throw rangeError(TERMS_BLOCK, 'style はオブジェクトである必要があります');
  }
  assertKeys(TERMS_BLOCK, style, ['typography']);
  if (style.typography === undefined) return undefined;
  if (!isObj(style.typography)) {
    throw rangeError(TERMS_BLOCK, 'style.typography はオブジェクトである必要があります');
  }
  assertKeys(TERMS_BLOCK, style.typography, ['fontWeight']);
  const fw = style.typography.fontWeight;
  if (fw === undefined) return undefined;
  if (typeof fw !== 'string' || !FONT_WEIGHTS.has(fw)) {
    throw rangeError(TERMS_BLOCK, 'fontWeight は 100 から 900 の 100 刻みの文字列である必要があります');
  }
  return fw;
};

const parsePostTermsAttrs = (attrs: Obj): ParsedTermsAttrs => {
  assertKeys(TERMS_BLOCK, attrs, TERMS_KEYS);

  if (attrs.term !== 'category' && attrs.term !== 'post_tag') {
    throw rangeError(TERMS_BLOCK, 'term は category または post_tag である必要があります');
  }
  const term = attrs.term;

  let separator: string | undefined;
  let className: string | undefined;
  if (term === 'category') {
    // category の出力形は固定とし、区切り文字とクラス追加は対応しない。
    if (attrs.separator !== undefined) {
      throw rangeError(TERMS_BLOCK, 'category では separator は対応していません');
    }
    if (attrs.className !== undefined) {
      throw rangeError(TERMS_BLOCK, 'category では className は対応していません');
    }
  } else {
    if (attrs.separator !== undefined) {
      if (typeof attrs.separator !== 'string') {
        throw rangeError(TERMS_BLOCK, 'separator は文字列である必要があります');
      }
      separator = attrs.separator;
    }
    if (attrs.className !== undefined) {
      if (typeof attrs.className !== 'string') {
        throw rangeError(TERMS_BLOCK, 'className は文字列である必要があります');
      }
      className = attrs.className;
    }
  }

  const fontWeight = parseTermsStyle(attrs.style);

  return { term, separator, className, fontWeight };
};

export const postTermsRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parsePostTermsAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    const { term, fontWeight } = parsePostTermsAttrs(block.attrs ?? {});
    assertNoChildren(TERMS_BLOCK, block);
    requirePost(TERMS_BLOCK, ctx);
    const content = requireContent(TERMS_BLOCK, ctx);

    const terms = content.terms(term);

    if (term === 'post_tag') {
      // タグが 0 件なら何も出力しない。タグの出力形は未対応のため 1 件以上は拒否する。
      if (terms.length === 0) return '';
      throw rangeError(TERMS_BLOCK, 'post_tag の表示は未対応です');
    }

    const cat = terms.length === 1 ? terms[0] : undefined;
    if (cat === undefined) {
      throw rangeError(TERMS_BLOCK, 'category は 1 件のみ対応しています');
    }
    const href = safeHref(TERMS_BLOCK, cat.url);
    const styleAttr = fontWeight !== undefined ? ` style="font-weight:${fontWeight}"` : '';
    return `<div${styleAttr} class="taxonomy-category wp-block-post-terms"><a href="${href}" rel="tag">${escapeText(cat.name)}</a></div>`;
  },
};

// ---- core/post-author-name ----

const authorOf = (content: ContentPort): { name: string; url: string } | null => content.author();

const parsePostAuthorAttrs = (attrs: Obj): void => {
  assertKeys(AUTHOR_BLOCK, attrs, AUTHOR_KEYS);
  // 著者名は常にリンクとして出力する。isLink は true のみ許可する。
  if (attrs.isLink !== true) {
    throw rangeError(AUTHOR_BLOCK, 'isLink は true である必要があります');
  }
};

export const postAuthorNameRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parsePostAuthorAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    parsePostAuthorAttrs(block.attrs ?? {});
    assertNoChildren(AUTHOR_BLOCK, block);
    requirePost(AUTHOR_BLOCK, ctx);
    const content = requireContent(AUTHOR_BLOCK, ctx);

    const author = authorOf(content);
    if (author === null) return '';

    const href = safeHref(AUTHOR_BLOCK, author.url);
    return `<div class="wp-block-post-author-name"><a href="${href}" target="_self" class="wp-block-post-author-name__link">${escapeText(author.name)}</a></div>`;
  },
};

// ---- core/post-featured-image ----

const parsePostImageAttrs = (attrs: Obj): void => {
  assertKeys(IMAGE_BLOCK, attrs, IMAGE_KEYS);
  if (attrs.aspectRatio !== undefined) {
    if (typeof attrs.aspectRatio !== 'string' || !ASPECT_RATIO_RE.test(attrs.aspectRatio)) {
      throw rangeError(IMAGE_BLOCK, 'aspectRatio は「幅/高さ」の整数表記である必要があります');
    }
  }
};

export const postFeaturedImageRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parsePostImageAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    parsePostImageAttrs(block.attrs ?? {});
    assertNoChildren(IMAGE_BLOCK, block);
    requirePost(IMAGE_BLOCK, ctx);
    const content = requireContent(IMAGE_BLOCK, ctx);

    // アイキャッチ画像が無い投稿は何も出力しない。画像の出力は本ステップでは未対応のため、ある場合は拒否する。
    if (!content.hasThumbnail()) return '';
    throw rangeError(IMAGE_BLOCK, 'アイキャッチ画像の出力は未対応です');
  },
};
