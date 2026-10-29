// SPDX-License-Identifier: GPL-3.0-only
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const BLOCK_NAME = 'core/site-title';
const LINK_TARGETS = ['_self', '_blank'] as const;
// level 0 は p、1〜6 は h1〜h6。範囲外は parseSiteTitleAttrs で弾いてからここを引く。
const TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

// テキストノード用エスケープ。ブラウザ側で一切の解釈をさせないため & < > " ' を全て退避する。
const escapeText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 属性値用エスケープ(href など)。
const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type SiteTitleAttrs = {
  tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  isLink: boolean;
  linkTarget: (typeof LINK_TARGETS)[number];
};

// attrs を検証し描画用に正規化する。validateAttrs と render の両方から呼ぶ。
const parseSiteTitleAttrs = (attrs: Obj): SiteTitleAttrs => {
  const rawLevel = attrs.level;
  let level = 1;
  if (rawLevel !== undefined) {
    if (typeof rawLevel !== 'number' || !Number.isInteger(rawLevel) || rawLevel < 0 || rawLevel > 6) {
      throw rangeError('level は 0〜6 の整数である必要があります');
    }
    level = rawLevel;
  }
  const tag = TAGS[level];
  if (tag === undefined) {
    throw rangeError('level の変換に失敗しました');
  }

  const rawIsLink = attrs.isLink;
  let isLink = true;
  if (rawIsLink !== undefined) {
    if (typeof rawIsLink !== 'boolean') {
      throw rangeError('isLink は真偽値である必要があります');
    }
    isLink = rawIsLink;
  }

  const rawTarget = attrs.linkTarget;
  let linkTarget: (typeof LINK_TARGETS)[number] = '_self';
  if (rawTarget !== undefined) {
    if (typeof rawTarget !== 'string' || !(LINK_TARGETS as readonly string[]).includes(rawTarget)) {
      throw rangeError('linkTarget は _self または _blank のみ許可されます');
    }
    linkTarget = rawTarget as (typeof LINK_TARGETS)[number];
  }

  return { tag, isLink, linkTarget };
};

// site.url は http: / https: のみ許可する。URL の正規化は検証にだけ使い、出力は元の文字列を属性エスケープする。
const assertHttpUrl = (url: unknown): string => {
  if (typeof url !== 'string') {
    throw rangeError('site.url が文字列ではありません');
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw rangeError('site.url を URL として解釈できません');
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw rangeError('site.url は http: または https: のみ許可されます');
  }
  return url;
};

export const siteTitleRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseSiteTitleAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    const attrs: Obj = block.attrs ?? {};
    const parsed = parseSiteTitleAttrs(attrs);

    // fail-closed: サイト情報・ページ情報が無い文脈では描画しない。
    if (ctx.site === undefined || ctx.page === undefined) {
      throw rangeError('ctx.site / ctx.page が無いため描画できません');
    }
    const siteName: unknown = ctx.site.name;
    if (typeof siteName !== 'string') {
      throw rangeError('site.name が文字列ではありません');
    }
    const siteUrl = assertHttpUrl(ctx.site.url);

    const text = escapeText(siteName);
    const open = `<${parsed.tag} class="wp-block-site-title">`;
    const close = `</${parsed.tag}>`;
    if (!parsed.isLink) {
      return `${open}${text}${close}`;
    }
    const ariaCurrent = ctx.page.isHome ? ' aria-current="page"' : '';
    return `${open}<a href="${escapeAttr(siteUrl)}" target="${parsed.linkTarget}" rel="home"${ariaCurrent}>${text}</a>${close}`;
  },
};
