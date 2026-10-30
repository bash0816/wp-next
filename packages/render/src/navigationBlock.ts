// SPDX-License-Identifier: GPL-3.0-only
// D-1d-2: core/navigation・core/page-list・core/navigation-link の描画。
// 出力はすべてテキスト・属性とも退避する(sanitizeHtml は使わない)。未対応の入力は fail-closed で投げる。
import { parse } from '@wordpress/block-serialization-default-parser';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { containerClassName } from './layoutClass.js';
import { layoutHashInput } from './layoutInput.js';
import { type ParsedBlock } from './renderBlocks.js';

const NAV = 'core/navigation';
const PAGE_LIST = 'core/page-list';
const NAV_LINK = 'core/navigation-link';

const JUSTIFY_VALUES = ['left', 'right', 'center', 'space-between'] as const;
const FLEX_WRAP_VALUES = ['wrap', 'nowrap'] as const;
const COLOR_SLUG = /^[a-z0-9-]+$/;

type Obj = Record<string, unknown>;
type Justify = (typeof JUSTIFY_VALUES)[number];

const rangeError = (block: string, msg: string): RangeError => new RangeError(`${block}: ${msg}`);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// テキストノード用エスケープ。
const escapeText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 属性値用エスケープ(data-wp-context や href など)。
const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// site.url は http: / https: のみ許可する。
const assertHttpUrl = (url: unknown, block: string): string => {
  if (typeof url !== 'string') {
    throw rangeError(block, 'site.url が文字列ではありません');
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw rangeError(block, 'site.url を URL として解釈できません');
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw rangeError(block, 'site.url は http: または https: のみ許可されます');
  }
  return url;
};

const colorSlug = (value: unknown, key: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !COLOR_SLUG.test(value)) {
    throw rangeError(NAV, `${key} は英小文字・数字・ハイフンのみ許可されます`);
  }
  return value;
};

type NavAttrs = {
  justify: Justify;
  textColor: string | undefined;
  bgColor: string | undefined;
};

// attrs を検証し描画用に正規化する。validateAttrs と render の両方から呼ぶ。
const parseNavAttrs = (attrs: Obj): NavAttrs => {
  if (attrs.ref !== undefined) {
    throw rangeError(NAV, 'ref は未対応です');
  }
  let justify: Justify = 'left';
  const layout = attrs.layout;
  if (layout !== undefined) {
    if (!isObj(layout) || layout.type !== 'flex') {
      throw rangeError(NAV, 'layout.type は flex のみ許可されます');
    }
    const rawJustify = layout.justifyContent;
    if (rawJustify !== undefined) {
      if (typeof rawJustify !== 'string' || !(JUSTIFY_VALUES as readonly string[]).includes(rawJustify)) {
        throw rangeError(NAV, 'layout.justifyContent は left/right/center/space-between のみ許可されます');
      }
      justify = rawJustify as Justify;
    }
    const rawWrap = layout.flexWrap;
    if (rawWrap !== undefined) {
      if (typeof rawWrap !== 'string' || !(FLEX_WRAP_VALUES as readonly string[]).includes(rawWrap)) {
        throw rangeError(NAV, 'layout.flexWrap は wrap/nowrap のみ許可されます');
      }
    }
  }
  return {
    justify,
    textColor: colorSlug(attrs.overlayTextColor, 'overlayTextColor'),
    bgColor: colorSlug(attrs.overlayBackgroundColor, 'overlayBackgroundColor'),
  };
};

// navigation-link の url。http(s) の絶対 URL か '/' 始まりのパスのみ許可する。
// '//host' と '/\host' は絶対 URL 扱いになるため拒否する。
const assertLinkUrl = (url: string): string => {
  if (url.startsWith('/')) {
    if (url.startsWith('//') || url.startsWith('/\\')) {
      throw rangeError(NAV_LINK, 'url の先頭 "//" や "/\\" は許可されません');
    }
    return url;
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw rangeError(NAV_LINK, 'url は http(s) の絶対 URL か "/" 始まりである必要があります');
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw rangeError(NAV_LINK, 'url は http(s) の絶対 URL か "/" 始まりである必要があります');
  }
  return url;
};

type LinkAttrs = { label: string; url: string };

const parseLinkAttrs = (attrs: Obj): LinkAttrs => {
  if (attrs.ref !== undefined) {
    throw rangeError(NAV_LINK, 'ref は未対応です');
  }
  const rawLabel = attrs.label;
  if (rawLabel !== undefined && typeof rawLabel !== 'string') {
    throw rangeError(NAV_LINK, 'label は文字列である必要があります');
  }
  if (typeof attrs.url !== 'string') {
    throw rangeError(NAV_LINK, 'url は文字列である必要があります');
  }
  return { label: rawLabel ?? '', url: assertLinkUrl(attrs.url) };
};

const navigationLinkRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseLinkAttrs(attrs);
  },
  render: (block: ParsedBlock) => {
    const { label, url } = parseLinkAttrs(block.attrs ?? {});
    return `<li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="${escapeAttr(url)}"><span class="wp-block-navigation-item__label">${escapeText(label)}</span></a></li>`;
  },
};

const pageListRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    if (attrs.ref !== undefined) {
      throw rangeError(PAGE_LIST, 'ref は未対応です');
    }
  },
  render: (_block: ParsedBlock, ctx: RenderCtx) => {
    // fail-closed: サイト情報・ナビゲート対象ページ一覧が無い文脈では描画しない。
    if (ctx.site === undefined) {
      throw rangeError(PAGE_LIST, 'ctx.site が無いため描画できません');
    }
    if (ctx.navigation === undefined) {
      throw rangeError(PAGE_LIST, 'ctx.navigation が無いため描画できません');
    }
    const siteUrl = assertHttpUrl(ctx.site.url, PAGE_LIST);
    // 階層メニューは D-1d-2 のスコープ外。親を持つページは拒否する。
    const pages = [...ctx.navigation.pages];
    for (const page of pages) {
      if (page.parent !== 0) {
        throw rangeError(PAGE_LIST, '親を持つページ(parent≠0)は未対応です');
      }
      if (typeof page.title !== 'string' || typeof page.slug !== 'string') {
        throw rangeError(PAGE_LIST, 'page の title / slug は文字列である必要があります');
      }
    }
    // menu_order 順。Array.prototype.sort は安定ソートのため同順位は入力順を保つ。
    pages.sort((a, b) => a.menuOrder - b.menuOrder);
    const items = pages
      .map((page) => {
        const href = `${siteUrl}/${page.slug}/`;
        return `<li class="wp-block-pages-list__item wp-block-navigation-item open-on-hover-click"><a class="wp-block-pages-list__item__link wp-block-navigation-item__content" href="${escapeAttr(href)}">${escapeText(page.title)}</a></li>`;
      })
      .join('');
    return `<ul class="wp-block-page-list">${items}</ul>`;
  },
};

const CONTEXT_JSON = JSON.stringify({
  overlayOpenedBy: { click: false, hover: false, focus: false },
  type: 'overlay',
  roleAttribute: '',
  ariaLabel: 'Menu',
});

const navigationRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseNavAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const attrs: Obj = block.attrs ?? {};
    const parsed = parseNavAttrs(attrs);

    // fail-closed: 文脈に navigation 投稿が無い、または投稿が null の場合は描画しない。
    if (ctx.navigation === undefined) {
      throw rangeError(NAV, 'ctx.navigation が無いため描画できません');
    }
    const post = ctx.navigation.post;
    if (post === null) {
      throw rangeError(NAV, 'navigation 投稿が見つかりません');
    }

    const hash = containerClassName(NAV, layoutHashInput({ name: NAV, attrs }, ctx.global));
    const j = parsed.justify;
    const textCls = parsed.textColor === undefined ? '' : ` has-text-color has-${parsed.textColor}-color`;
    const bgCls = parsed.bgColor === undefined ? '' : ` has-background has-${parsed.bgColor}-background-color`;

    // 子要素(メニュー項目)は投稿本文を解析して描画する。
    const children = renderChildren(parse(post.content) as unknown as ParsedBlock[]);

    ctx.renderState.modalCounter += 1;
    const n = ctx.renderState.modalCounter;

    return (
      `<nav class="is-responsive items-justified-${j} wp-block-navigation is-content-justification-${j} is-layout-flex ${hash} wp-block-navigation-is-layout-flex" ` +
      `data-wp-interactive="core/navigation" data-wp-context="${escapeAttr(CONTEXT_JSON)}">` +
      `<button aria-haspopup="dialog" aria-label="Open menu" class="wp-block-navigation__responsive-container-open" data-wp-on--click="actions.openMenuOnClick" data-wp-on--keydown="actions.handleMenuKeydown">` +
      `<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7.5h16v1.5H4z"></path><path d="M4 15h16v1.5H4z"></path></svg></button>` +
      `<div class="wp-block-navigation__responsive-container${textCls}${bgCls}" id="modal-${n}" data-wp-class--has-modal-open="state.isMenuOpen" data-wp-class--is-menu-open="state.isMenuOpen" data-wp-watch="callbacks.initMenu" data-wp-on--keydown="actions.handleMenuKeydown" data-wp-on--focusout="actions.handleMenuFocusout" tabindex="-1">` +
      `<div class="wp-block-navigation__responsive-close" tabindex="-1"><div class="wp-block-navigation__responsive-dialog" data-wp-bind--aria-modal="state.ariaModal" data-wp-bind--aria-label="state.ariaLabel" data-wp-bind--role="state.roleAttribute">` +
      `<button aria-label="Close menu" class="wp-block-navigation__responsive-container-close" data-wp-on--click="actions.closeMenuOnClick"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="m13.06 12 6.47-6.47-1.06-1.06L12 10.94 5.53 4.47 4.47 5.53 10.94 12l-6.47 6.47 1.06 1.06L12 13.06l6.47 6.47 1.06-1.06L13.06 12Z"></path></svg></button>` +
      `<div class="wp-block-navigation__responsive-container-content" data-wp-watch="callbacks.focusFirstElement" id="modal-${n}-content">` +
      `<ul class="wp-block-navigation__container is-responsive items-justified-${j} wp-block-navigation">${children}</ul>` +
      `</div></div></div></div></nav>`
    );
  },
};

export { navigationRenderer, pageListRenderer, navigationLinkRenderer };
