// SPDX-License-Identifier: GPL-3.0-only
// D3f: コメント関連ブロック(core/comments 系 7 種)のレンダラ。
// 受理する属性は twentytwentyfive/comments パターンで使われる形のみ。それ以外は fail-closed で RangeError を投げる。
// コメント状態(ctx.content.commentsState)は 'anon-open-empty' のみ対応する。
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { type PostCtx } from './ports.js';
import { escapeAttr, safeHref } from './postTitleDate.js';

type Obj = Record<string, unknown>;

const COMMENTS = 'core/comments';
const TITLE = 'core/comments-title';
const TEMPLATE = 'core/comment-template';
const PAGINATION = 'core/comments-pagination';
const PREV = 'core/comments-pagination-previous';
const NEXT = 'core/comments-pagination-next';
const FORM = 'core/post-comments-form';

const COMMENTS_CLASS = 'wp-block-comments-query-loop';
const MARGIN_RE = /^var:preset\|spacing\|(\d+)$/;

const rangeError = (blockName: string, msg: string): RangeError =>
  new RangeError(`${blockName}: ${msg}`);

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const assertKeys = (blockName: string, obj: Obj, allowed: readonly string[]): void => {
  for (const key of Object.keys(obj)) {
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

// 属性なし(attrs が null もしくは空オブジェクト)のみ許可する。
const assertNoAttrs = (blockName: string, block: ParsedBlock): void => {
  assertKeys(blockName, block.attrs ?? {}, []);
};

// margin の値は theme.json の spacing slug を指す var:preset 形式のみ許可する。数値 slug に限定する。
const parseMargin = (blockName: string, value: unknown): string => {
  if (typeof value !== 'string') {
    throw rangeError(blockName, 'margin は文字列である必要があります');
  }
  const m = MARGIN_RE.exec(value);
  if (m === null) {
    throw rangeError(blockName, `margin の値が不正です: ${value}`);
  }
  return m[1] as string;
};

// core/comments の属性を検証し、margin の slug を返す。style が無い場合は null(margin なし)。
// style が有る場合は許可キー以外・不正値を RangeError にする。validateAttrs と render の双方がこの関数を使う。
const parseCommentsAttrs = (attrs: Obj): { top: string; bottom: string } | null => {
  assertKeys(COMMENTS, attrs, ['className', 'style']);
  if (attrs.className !== COMMENTS_CLASS) {
    throw rangeError(COMMENTS, `className は ${COMMENTS_CLASS} である必要があります`);
  }
  if (attrs.style === undefined) {
    return null;
  }
  const style = attrs.style;
  if (!isObj(style)) {
    throw rangeError(COMMENTS, 'style はオブジェクトである必要があります');
  }
  assertKeys(COMMENTS, style, ['spacing']);
  const spacing = style.spacing;
  if (!isObj(spacing)) {
    throw rangeError(COMMENTS, 'style.spacing が必要です');
  }
  assertKeys(COMMENTS, spacing, ['margin']);
  const margin = spacing.margin;
  if (!isObj(margin)) {
    throw rangeError(COMMENTS, 'style.spacing.margin が必要です');
  }
  assertKeys(COMMENTS, margin, ['top', 'bottom']);
  return {
    top: parseMargin(COMMENTS, margin.top),
    bottom: parseMargin(COMMENTS, margin.bottom),
  };
};

// 全 7 ブロック共通の文脈検証。content 欠落・commentsState 非対応・post 欠落は RangeError。
const requireCommentsCtx = (blockName: string, ctx: RenderCtx): PostCtx => {
  if (ctx.content === undefined) {
    throw rangeError(blockName, 'コンテンツ文脈(content)がありません');
  }
  if (ctx.content.commentsState() !== 'anon-open-empty') {
    throw rangeError(blockName, 'コメント状態が対応外です');
  }
  if (ctx.post === undefined) {
    throw rangeError(blockName, '投稿文脈(post)がありません');
  }
  return ctx.post;
};

const parseTitleAttrs = (attrs: Obj): void => {
  assertKeys(TITLE, attrs, ['level', 'fontSize']);
  if (attrs.level !== 3) {
    throw rangeError(TITLE, 'level は 3 である必要があります');
  }
  if (attrs.fontSize !== 'large') {
    throw rangeError(TITLE, 'fontSize は large である必要があります');
  }
};

const parsePaginationAttrs = (attrs: Obj): void => {
  assertKeys(PAGINATION, attrs, ['layout']);
  if (attrs.layout === undefined) {
    return;
  }
  const layout = attrs.layout;
  if (!isObj(layout)) {
    throw rangeError(PAGINATION, 'layout はオブジェクトである必要があります');
  }
  assertKeys(PAGINATION, layout, ['type', 'justifyContent']);
  if (layout.type !== 'flex' || layout.justifyContent !== 'space-between') {
    throw rangeError(PAGINATION, 'layout は flex / space-between のみ対応します');
  }
};

// core/post-comments-form の post.id は正の安全な整数のみ許可する(属性注入防止)。
const formId = (id: unknown): number => {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw rangeError(FORM, 'post.id が不正です');
  }
  return id;
};

export const commentsRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseCommentsAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const margin = parseCommentsAttrs(block.attrs ?? {});
    requireCommentsCtx(COMMENTS, ctx);
    const children = renderChildren(block.innerBlocks);
    const style =
      margin === null
        ? ''
        : ` style="margin-top:var(--wp--preset--spacing--${margin.top});margin-bottom:var(--wp--preset--spacing--${margin.bottom})"`;
    return `<div class="wp-block-comments ${COMMENTS_CLASS}"${style}>` + children + '</div>';
  },
};

export const commentsTitleRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseTitleAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    parseTitleAttrs(block.attrs ?? {});
    assertNoChildren(TITLE, block);
    requireCommentsCtx(TITLE, ctx);
    // 見出しはテーマパターン側の core/heading が出力するため、ここでは空を返す。
    return '';
  },
};

// 子(core/comment-content 等)は表示しない。childrenOptional のため renderChildren を呼ばず出力も捨てる。
export const commentTemplateRenderer: BlockRenderer = {
  childrenOptional: true,
  validateAttrs: (attrs) => {
    assertKeys(TEMPLATE, attrs, []);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(TEMPLATE, block);
    requireCommentsCtx(TEMPLATE, ctx);
    return '';
  },
};

export const commentsPaginationRenderer: BlockRenderer = {
  childrenOptional: true,
  validateAttrs: (attrs) => {
    parsePaginationAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    parsePaginationAttrs(block.attrs ?? {});
    requireCommentsCtx(PAGINATION, ctx);
    // 前後リンクは commentsState が anon-open-empty のとき出力を持たないため、子は描画しない。
    return '';
  },
};

export const commentsPaginationPreviousRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    assertKeys(PREV, attrs, []);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(PREV, block);
    assertNoChildren(PREV, block);
    requireCommentsCtx(PREV, ctx);
    return '';
  },
};

export const commentsPaginationNextRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    assertKeys(NEXT, attrs, []);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(NEXT, block);
    assertNoChildren(NEXT, block);
    requireCommentsCtx(NEXT, ctx);
    return '';
  },
};

// 匿名投稿者向けの未ログインコメントフォーム。action・cancel リンク・hidden の post id は検証済みの値だけを埋める。
export const postCommentsFormRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    assertKeys(FORM, attrs, []);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(FORM, block);
    assertNoChildren(FORM, block);
    const post = requireCommentsCtx(FORM, ctx);
    if (ctx.site === undefined) {
      throw rangeError(FORM, 'サイト文脈(site)がありません');
    }
    const action = safeHref(FORM, `${ctx.site.url.replace(/\/+$/, '')}/wp-comments-post.php`);
    // safeHref は http(s) 以外と不正 URL を RangeError にする。cancel リンクは投稿の pathname + #respond。
    const postHref = safeHref(FORM, post.url);
    const cancel = escapeAttr(new URL(post.url).pathname) + '#respond';
    const id = formId(post.id);

    return [
      '<div id="respond" class="comment-respond wp-block-post-comments-form">',
      `<h3 id="reply-title" class="comment-reply-title">Leave a Reply <small><a rel="nofollow" id="cancel-comment-reply-link" href="${cancel}" style="display:none;">Cancel reply</a></small></h3><form action="${action}" method="post" id="commentform" class="comment-form"><p class="comment-notes"><span id="email-notes">Your email address will not be published.</span> <span class="required-field-message">Required fields are marked <span class="required">*</span></span></p><p class="comment-form-comment"><label for="comment">Comment <span class="required">*</span></label> <textarea id="comment" name="comment" cols="45" rows="8" maxlength="65525" required></textarea></p><p class="comment-form-author"><label for="author">Name <span class="required">*</span></label> <input id="author" name="author" type="text" value="" size="30" maxlength="245" autocomplete="name" required /></p>`,
      '<p class="comment-form-email"><label for="email">Email <span class="required">*</span></label> <input id="email" name="email" type="email" value="" size="30" maxlength="100" aria-describedby="email-notes" autocomplete="email" required /></p>',
      '<p class="comment-form-url"><label for="url">Website</label> <input id="url" name="url" type="url" value="" size="30" maxlength="200" autocomplete="url" /></p>',
      '<p class="comment-form-cookies-consent"><input id="wp-comment-cookies-consent" name="wp-comment-cookies-consent" type="checkbox" value="yes" /> <label for="wp-comment-cookies-consent">Save my name, email, and website in this browser for the next time I comment.</label></p>',
      `<p class="form-submit wp-block-button"><input name="submit" type="submit" id="submit" class="wp-block-button__link wp-element-button" value="Post Comment" /> <input type='hidden' name='comment_post_ID' value='${id}' id='comment_post_ID' />`,
      "<input type='hidden' name='comment_parent' id='comment_parent' value='0' />",
      '</p></form>\t</div><!-- #respond -->',
    ].join('\n');
  },
};
