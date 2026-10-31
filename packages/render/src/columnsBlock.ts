// SPDX-License-Identifier: GPL-3.0-only
import { containerClassName } from './layoutClass.js';
import { layoutHashInput } from './layoutInput.js';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const COLUMNS_BLOCK = 'core/columns';
const COLUMN_BLOCK = 'core/column';

// column の width は CSS flex-basis に載るパーセント値のみ許可する。
const WIDTH_RE = /^\d+(?:\.\d+)?%$/;

type Obj = Record<string, unknown>;

const columnsRangeError = (msg: string): RangeError => new RangeError(`${COLUMNS_BLOCK}: ${msg}`);
const columnRangeError = (msg: string): RangeError => new RangeError(`${COLUMN_BLOCK}: ${msg}`);

// 属性値用エスケープ(style などへ出す前の最終防御)。
const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// core/columns: attrs は空のみ許可。
const parseColumnsAttrs = (attrs: Obj): void => {
  const keys = Object.keys(attrs);
  if (keys.length > 0) {
    throw columnsRangeError(`未対応の属性です: ${keys.join(', ')}`);
  }
};

// core/column: width のみ許可。戻り値は style 属性に入れる CSS 宣言(無ければ undefined)。
const parseColumnAttrs = (attrs: Obj): string | undefined => {
  for (const key of Object.keys(attrs)) {
    if (key !== 'width') {
      throw columnRangeError(`未対応の属性です: ${key}`);
    }
  }
  const raw = attrs.width;
  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw columnRangeError('width は文字列である必要があります');
  }
  if (!WIDTH_RE.test(raw)) {
    throw columnRangeError(`width の値が許可された形式ではありません(非負の数+%のみ): ${raw}`);
  }
  return `flex-basis:${raw}`;
};

export const columnsRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseColumnsAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const attrs: Obj = block.attrs ?? {};
    parseColumnsAttrs(attrs);
    const hash = containerClassName(COLUMNS_BLOCK, layoutHashInput({ name: COLUMNS_BLOCK, attrs }, ctx.global));
    const classes = ['wp-block-columns', 'is-layout-flex'];
    if (hash !== '') {
      classes.push(hash);
    }
    classes.push('wp-block-columns-is-layout-flex');
    const classAttr = escapeAttr(classes.join(' '));
    return `<div class="${classAttr}">${renderChildren(block.innerBlocks)}</div>`;
  },
};

export const columnRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseColumnAttrs(attrs);
  },
  render: (block: ParsedBlock, _ctx: RenderCtx, renderChildren) => {
    const style = parseColumnAttrs(block.attrs ?? {});
    const styleAttr = style === undefined ? '' : ` style="${escapeAttr(style)}"`;
    return `<div class="wp-block-column is-layout-flow wp-block-column-is-layout-flow"${styleAttr}>${renderChildren(block.innerBlocks)}</div>`;
  },
};
