// SPDX-License-Identifier: GPL-3.0-only
// D-3e: core/post-navigation-link のレンダラ。前後の投稿へのリンクを出力する。
// 受理する属性は { type: 'previous', showTitle: true, arrow: 'arrow' } か { showTitle: true, arrow: 'arrow' } のみ。
// それ以外は fail-closed で RangeError を投げる。
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { escapeText, safeHref, typographyTitle } from './postTitleDate.js';

type Obj = Record<string, unknown>;
type Direction = 'previous' | 'next';

const NAV_BLOCK = 'core/post-navigation-link';
const NAV_KEYS = ['type', 'showTitle', 'arrow'] as const;

const rangeError = (msg: string): RangeError => new RangeError(`${NAV_BLOCK}: ${msg}`);

// 属性を検証し、取得方向を返す。validateAttrs と render の双方がこの関数を使う。
const parseNavAttrs = (attrs: Obj): Direction => {
  for (const key of Object.keys(attrs)) {
    if (!(NAV_KEYS as readonly string[]).includes(key)) {
      throw rangeError(`未対応の属性です: ${key}`);
    }
  }

  // type は省略時 next。明示する場合は previous のみ許可する(next の明示は拒否)。
  let dir: Direction = 'next';
  if (attrs.type !== undefined) {
    if (attrs.type !== 'previous') {
      throw rangeError('type は previous のみ明示できます');
    }
    dir = 'previous';
  }

  if (attrs.showTitle !== true) {
    throw rangeError('showTitle は true である必要があります');
  }
  if (attrs.arrow !== 'arrow') {
    throw rangeError('arrow は arrow である必要があります');
  }
  return dir;
};

export const postNavigationLinkRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseNavAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx) => {
    const dir = parseNavAttrs(block.attrs ?? {});

    if (block.innerBlocks.length > 0) {
      throw rangeError('子ブロックは対応していません');
    }
    if (ctx.content === undefined) {
      throw rangeError('コンテンツ文脈(content)がありません');
    }
    if (ctx.post === undefined) {
      throw rangeError('投稿文脈(post)がありません');
    }

    // adjacent は方向ごとに 1 回だけ呼ぶ。
    const target = ctx.content.adjacent(dir);
    if (target === null) {
      throw rangeError('隣接する投稿がありません');
    }

    const href = safeHref(NAV_BLOCK, target.url);
    const text = escapeText(typographyTitle(target.title, NAV_BLOCK));

    if (dir === 'previous') {
      return (
        '<div class="post-navigation-link-previous wp-block-post-navigation-link">' +
        '<span class="wp-block-post-navigation-link__arrow-previous is-arrow-arrow" aria-hidden="true">←</span>' +
        `<a href="${href}" rel="prev">${text}</a>` +
        '</div>'
      );
    }
    return (
      '<div class="post-navigation-link-next wp-block-post-navigation-link">' +
      `<a href="${href}" rel="next">${text}</a>` +
      '<span class="wp-block-post-navigation-link__arrow-next is-arrow-arrow" aria-hidden="true">→</span>' +
      '</div>'
    );
  },
};
