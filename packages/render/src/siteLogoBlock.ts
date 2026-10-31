// SPDX-License-Identifier: GPL-3.0-only
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const BLOCK_NAME = 'core/site-logo';

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

// D-2a は attrs を一切受け付けない(空のみ許可)。未知キーは黙殺せず拒否する。
const assertNoAttrs = (attrs: Obj): void => {
  const keys = Object.keys(attrs);
  if (keys.length > 0) {
    throw rangeError(`未対応の属性です: ${keys.join(', ')}`);
  }
};

export const siteLogoRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    assertNoAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    assertNoAttrs(block.attrs ?? {});

    // fail-closed: サイト情報が無い文脈では描画しない。
    if (ctx.site === undefined) {
      throw rangeError('ctx.site が無いため描画できません');
    }
    const logoId: unknown = ctx.site.logoId;
    // undefined は『情報未取得』であり『未設定』ではないため拒否する(§8.2 省略規則)。
    if (logoId === undefined) {
      throw rangeError('site.logoId が未取得のため描画できません');
    }
    // null はカスタムロゴ未設定。基準 WP と同じく空出力。
    if (logoId === null) {
      return '';
    }
    // 数値(設定済み)は D-2a の範囲外のため、黙って無視せず拒否する。
    if (typeof logoId === 'number') {
      throw rangeError('カスタムロゴ設定済み(logoId)は D-2a では未対応です');
    }
    throw rangeError('site.logoId は number または null である必要があります');
  },
};
