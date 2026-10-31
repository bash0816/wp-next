// SPDX-License-Identifier: GPL-3.0-only
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const BLOCK_NAME = 'core/spacer';

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

// 許可する長さ値(厳密一致。部分一致にしない)。
// - preset 変数: var:preset|spacing|<英数>
// - 非負の数 + 単位(px, em, rem, %, vh, vw)
const PRESET_RE = /^var:preset\|spacing\|[A-Za-z0-9]+$/;
const LENGTH_RE = /^\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw)$/;
const ALLOWED_ATTRS = ['height', 'width'] as const;

// 属性値用エスケープ(style / 属性へ出す前の最終防御)。
const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 長さ値を CSS 値へ正規化する。許可パターン外は RangeError。
const toCssLength = (name: string, raw: unknown): string => {
  if (typeof raw !== 'string') {
    throw rangeError(`${name} は文字列である必要があります`);
  }
  if (PRESET_RE.test(raw)) {
    const slug = raw.slice('var:preset|spacing|'.length);
    return `var(--wp--preset--spacing--${slug})`;
  }
  if (LENGTH_RE.test(raw)) {
    return raw;
  }
  throw rangeError(`${name} の値が許可された形式ではありません(preset 変数または非負の数+単位のみ)`);
};

// attrs を検証し、描画用の CSS 値を返す。validateAttrs と render の両方から呼ぶ。
const parseSpacerAttrs = (attrs: Obj): { height: string; width: string | undefined } => {
  for (const key of Object.keys(attrs)) {
    if (!(ALLOWED_ATTRS as readonly string[]).includes(key)) {
      throw rangeError(`未対応の属性です: ${key}`);
    }
  }
  if (attrs.height === undefined) {
    throw rangeError('height は必須です');
  }
  const height = toCssLength('height', attrs.height);
  const width = attrs.width === undefined ? undefined : toCssLength('width', attrs.width);
  return { height, width };
};

export const spacerRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseSpacerAttrs(attrs);
  },
  render: (block: ParsedBlock, _ctx: RenderCtx) => {
    const { height, width } = parseSpacerAttrs(block.attrs ?? {});
    const style = width === undefined ? `height:${escapeAttr(height)}` : `height:${escapeAttr(height)};width:${escapeAttr(width)}`;
    return `<div style="${style}" aria-hidden="true" class="wp-block-spacer"></div>`;
  },
};
