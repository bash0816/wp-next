// SPDX-License-Identifier: GPL-3.0-only
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const BLOCK_NAME = 'core/site-tagline';

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

// D-2a は attrs を一切受け付けない(level / textAlign を含め空のみ許可)。未知キーは拒否する。
const assertNoAttrs = (attrs: Obj): void => {
  const keys = Object.keys(attrs);
  if (keys.length > 0) {
    throw rangeError(`未対応の属性です: ${keys.join(', ')}`);
  }
};

// テキストノード用エスケープ。ブラウザ側で一切の解釈をさせないため & < > " ' を全て退避する。
const escapeText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const siteTaglineRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    assertNoAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(block.attrs ?? {});

    // fail-closed: サイト情報が無い文脈では描画しない。
    if (ctx.site === undefined) {
      throw rangeError('ctx.site が無いため描画できません');
    }
    const tagline: unknown = ctx.site.tagline;
    // undefined を含め string 以外は『情報未取得』として拒否する(§8.2 省略規則)。
    if (typeof tagline !== 'string') {
      throw rangeError('site.tagline が未取得、または文字列ではありません');
    }
    // 空文字は blogdescription 空と同じく出力なし。
    if (tagline === '') {
      return '';
    }
    return `<p class="wp-block-site-tagline">${escapeText(tagline)}</p>`;
  },
};
