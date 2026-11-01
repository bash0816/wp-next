// SPDX-License-Identifier: GPL-3.0-only
// D3a2: テーマ(PHP 展開後)由来の core/post-title / core/post-date レンダラ。
// 投稿文脈(ctx.post)から値を取り、テキストは escape して出力する。URL は http(s) のみ許可する。
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { type PostCtx } from './ports.js';

type Obj = Record<string, unknown>;

const TITLE_BLOCK = 'core/post-title';
const DATE_BLOCK = 'core/post-date';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITLE_KEYS = ['level', 'isLink', 'fontSize'] as const;
const DATE_KEYS = ['isLink', 'textAlign'] as const;

const rangeError = (blockName: string, msg: string): RangeError =>
  new RangeError(`${blockName}: ${msg}`);

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

// wptexturize で変換される入力は fail-closed で拒否する。
const UNSUPPORTED_TITLE_PATTERNS: readonly RegExp[] = [
  /'/,
  /--/,
  /\.\.\./,
  /\((?:c|r|tm)\)/i,
  /\d[xX]\d/,
];

// 偶数個の " を “ ” に置換する。奇数個は対応の取れない引用符として拒否する。
const typographyTitle = (title: string): string => {
  for (const re of UNSUPPORTED_TITLE_PATTERNS) {
    if (re.test(title)) {
      throw rangeError(TITLE_BLOCK, 'タイトルに未対応の文字列が含まれています');
    }
  }
  const quoteCount = (title.match(/"/g) ?? []).length;
  if (quoteCount % 2 !== 0) {
    throw rangeError(TITLE_BLOCK, 'タイトルの引用符が対応していません');
  }
  return title.replace(/"([^"]*)"/g, '“$1”');
};

type ParsedTitleAttrs = {
  level: number;
  isLink: boolean;
  fontSize: string | undefined;
};

const parsePostTitleAttrs = (attrs: Obj): ParsedTitleAttrs => {
  assertKeys(TITLE_BLOCK, attrs, TITLE_KEYS);

  let level = 2;
  if (attrs.level !== undefined) {
    if (typeof attrs.level !== 'number' || !Number.isInteger(attrs.level) || attrs.level < 1 || attrs.level > 6) {
      throw rangeError(TITLE_BLOCK, 'level は 1 から 6 の整数である必要があります');
    }
    level = attrs.level;
  }

  let isLink = false;
  if (attrs.isLink !== undefined) {
    if (typeof attrs.isLink !== 'boolean') {
      throw rangeError(TITLE_BLOCK, 'isLink は真偽値である必要があります');
    }
    isLink = attrs.isLink;
  }

  let fontSize: string | undefined;
  if (attrs.fontSize !== undefined) {
    if (typeof attrs.fontSize !== 'string' || !SLUG_RE.test(attrs.fontSize)) {
      throw rangeError(TITLE_BLOCK, 'fontSize は英小文字・数字とハイフンによる slug 文字列である必要があります');
    }
    fontSize = attrs.fontSize;
  }

  return { level, isLink, fontSize };
};

export const postTitleRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parsePostTitleAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    const { level, isLink, fontSize } = parsePostTitleAttrs(block.attrs ?? {});
    assertNoChildren(TITLE_BLOCK, block);
    const post = requirePost(TITLE_BLOCK, ctx);

    const titleText = typographyTitle(post.title);
    const displayTitle = post.protected ? `Protected: ${titleText}` : titleText;
    const text = escapeText(displayTitle);
    const inner = isLink
      ? `<a href="${safeHref(TITLE_BLOCK, post.url)}" target="_self">${text}</a>`
      : text;

    const classes = [
      'wp-block-post-title',
      fontSize !== undefined ? `has-${fontSize}-font-size` : null,
    ]
      .filter((c): c is string => c !== null)
      .join(' ');
    return `<h${level} class="${classes}">${inner}</h${level}>`;
  },
};

type ParsedDateAttrs = { textAlignRight: boolean };

const parsePostDateAttrs = (attrs: Obj): ParsedDateAttrs => {
  assertKeys(DATE_BLOCK, attrs, DATE_KEYS);

  // 投稿日付は常にリンクとして出力する。isLink は true のみ許可する。
  if (attrs.isLink !== true) {
    throw rangeError(DATE_BLOCK, 'isLink は true である必要があります');
  }

  let textAlignRight = false;
  if (attrs.textAlign !== undefined) {
    if (attrs.textAlign !== 'right') {
      throw rangeError(DATE_BLOCK, 'textAlign は right のみ対応しています');
    }
    textAlignRight = true;
  }

  return { textAlignRight };
};

export const postDateRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parsePostDateAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    const { textAlignRight } = parsePostDateAttrs(block.attrs ?? {});
    assertNoChildren(DATE_BLOCK, block);
    const post = requirePost(DATE_BLOCK, ctx);

    // 保護投稿の日付は出力しない。
    if (post.protected) {
      return '';
    }

    const href = safeHref(DATE_BLOCK, post.url);
    const classes = `${textAlignRight ? 'has-text-align-right ' : ''}wp-block-post-date`;
    return `<div class="${classes}"><a href="${href}"><time datetime="${escapeAttr(post.dateIso)}">${escapeText(post.dateText)}</time></a></div>`;
  },
};
