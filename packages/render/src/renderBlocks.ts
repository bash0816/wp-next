// SPDX-License-Identifier: GPL-3.0-only
import { parse } from '@wordpress/block-serialization-default-parser';
import { parseFragment, serialize } from 'parse5';
import { sanitizeHtml } from './sanitizeHtml.js';

export type ParsedBlock = {
  blockName: string | null;
  attrs: Record<string, unknown> | null;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
};

type TreeNode = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: TreeNode[];
  value?: string;
};

/** wptexturize 相当: テキストノード内の単引用符のみを対象とする (属性値・コード系は除外) */
const TEXTURIZE_SKIP = new Set(['code', 'pre', 'kbd']);

function convertSingleQuotes(text: string): string {
  // 文頭・空白・開き括弧の直後の ' は開き引用符、それ以外は閉じ引用符/アポストロフィ
  return text.replace(/(^|[\s([{])'/g, '$1‘').replace(/'/g, '’');
}

export function texturizeText(html: string): string {
  const fragment = parseFragment(html) as unknown as TreeNode;
  const walk = (node: TreeNode, skip: boolean): void => {
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === '#text') {
        if (!skip && child.value !== undefined) {
          child.value = convertSingleQuotes(child.value);
        }
        continue;
      }
      walk(child, skip || TEXTURIZE_SKIP.has(child.nodeName));
    }
  };
  walk(fragment, false);
  return serialize(fragment as never);
}

/** 動的ブロックなど、対応していないブロックを検出したときに投げる (fail-closed) */
export class UnsupportedBlockError extends Error {
  readonly blockName: string;

  constructor(blockName: string) {
    super(`Unsupported block: ${blockName}`);
    this.name = 'UnsupportedBlockError';
    this.blockName = blockName;
  }
}

/** 静的に描画できるブロックの許可リスト */
const SUPPORTED_BLOCKS = new Set([
  'core/heading',
  'core/paragraph',
  'core/list',
  'core/list-item',
  'core/quote',
  'core/separator',
]);

/** 要素の先頭要素にクラスを追加する (既存クラスは保持し、無いものだけ末尾に足す) */
function addClassesToFirstElement(html: string, classes: string[]): string {
  const fragment = parseFragment(html) as unknown as TreeNode;
  const element = fragment.childNodes?.find((n) => !n.nodeName.startsWith('#'));
  if (element === undefined) {
    return html;
  }
  const attrs = element.attrs ?? [];
  const classAttr = attrs.find((a) => a.name === 'class');
  const tokens = classAttr ? classAttr.value.split(/\s+/).filter((t) => t !== '') : [];
  for (const cls of classes) {
    if (!tokens.includes(cls)) {
      tokens.push(cls);
    }
  }
  if (classAttr) {
    classAttr.value = tokens.join(' ');
  } else {
    attrs.push({ name: 'class', value: tokens.join(' ') });
  }
  element.attrs = attrs;
  return serialize(fragment as never);
}

export function renderBlock(block: ParsedBlock): string {
  if (block.blockName === null) {
    // フリーフォーム HTML: 空白のみは捨て、それ以外はそのまま通す (後段でサニタイズ)
    return block.innerHTML.trim() === '' ? '' : block.innerHTML;
  }

  const name = block.blockName;
  if (!SUPPORTED_BLOCKS.has(name)) {
    throw new UnsupportedBlockError(name);
  }

  // innerContent の null 位置に子ブロックを順番に差し込む
  let childIndex = 0;
  const parts = block.innerContent.map((chunk) => {
    if (chunk !== null) {
      return chunk;
    }
    const child = block.innerBlocks[childIndex];
    childIndex += 1;
    return child === undefined ? '' : renderBlock(child);
  });
  const html = parts.join('');

  switch (name) {
    case 'core/paragraph':
      return addClassesToFirstElement(html, ['wp-block-paragraph']);
    case 'core/quote':
      return addClassesToFirstElement(html, ['is-layout-flow', 'wp-block-quote-is-layout-flow']);
    default:
      return html;
  }
}

/**
 * post_content (Gutenberg のブロックマークアップ) を静的 HTML に変換する。
 * 未対応ブロックは UnsupportedBlockError を投げ、生のブロックコメントは出力しない。
 */
export function renderBlocks(postContent: string): string {
  const blocks = parse(postContent) as ParsedBlock[];
  const html = blocks.map(renderBlock).join('');
  return sanitizeHtml(texturizeText(html));
}
