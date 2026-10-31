// SPDX-License-Identifier: GPL-3.0-only
// D-2c: テーマ(PHP 展開後)由来の core/paragraph レンダラ。
// 入力は保存 HTML の外殻 <p> を剥がした内側を sanitizeHtml に通し、class は attrs.fontSize から導出する。
import { parseFragment } from 'parse5';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { sanitizeHtml } from './sanitizeHtml.js';

const BLOCK_NAME = 'core/paragraph';

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

// fontSize の slug は小文字英数字とハイフン区切りのみ(class への連結前の検証)。
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_ATTRS = ['fontSize'] as const;

// attrs を検証し、描画に使う fontSize(未指定なら undefined)を返す。validateAttrs と render の両方から呼ぶ。
const parseParagraphAttrs = (attrs: Obj): { fontSize: string | undefined } => {
  for (const key of Object.keys(attrs)) {
    if (!(ALLOWED_ATTRS as readonly string[]).includes(key)) {
      throw rangeError(`未対応の属性です: ${key}`);
    }
  }
  if (attrs.fontSize === undefined) {
    return { fontSize: undefined };
  }
  if (typeof attrs.fontSize !== 'string' || !SLUG_RE.test(attrs.fontSize)) {
    throw rangeError('fontSize は英小文字・数字とハイフンによる slug 文字列である必要があります');
  }
  return { fontSize: attrs.fontSize };
};

// 保存 HTML から外殻 <p ...>…</p> の内側を取り出す。
// 最外が単一の p 要素であることを parse5 で確認してから、生の文字列から開始・終了タグを剥がす。
const stripOuterParagraph = (innerHTML: string): string => {
  const match = /^\s*<p(?:\s[^>]*)?>([\s\S]*)<\/p>\s*$/.exec(innerHTML);
  if (match === null) {
    throw rangeError('最外が p 要素ではありません');
  }
  const top = parseFragment(innerHTML).childNodes.filter(
    (n) => !(n.nodeName === '#text' && (n as { value: string }).value.trim() === ''),
  );
  if (top.length !== 1 || top[0]?.nodeName !== 'p') {
    throw rangeError('最外が単一の p 要素ではありません');
  }
  return match[1] ?? '';
};

export const paragraphRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseParagraphAttrs(attrs);
  },
  render: (block: ParsedBlock, _ctx: RenderCtx) => {
    const { fontSize } = parseParagraphAttrs(block.attrs ?? {});
    if (block.innerBlocks.length > 0) {
      throw rangeError('子ブロックは対応していません');
    }
    const inner = stripOuterParagraph(block.innerHTML);
    const sanitized = sanitizeHtml(inner);
    const classes = `${fontSize !== undefined ? `has-${fontSize}-font-size ` : ''}wp-block-paragraph`;
    return `<p class="${classes}">${sanitized}</p>`;
  },
};
