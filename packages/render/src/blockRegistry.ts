// SPDX-License-Identifier: GPL-3.0-only
import { type GlobalConfig } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';
import { type ContentPort, type PostCtx, type QueriesPort, type QueryCtx } from './ports.js';
import { postBlockRenderers } from './postRegistry.js';

// site / page は D-1c の core/site-title 用。既存の呼び出しを壊さないため optional。
// site / page を必要とするレンダラは、無いときに fail-closed で RangeError を投げる。
export type RenderCtx = {
  global: GlobalConfig;
  // navNameCounts は core/navigation の aria-label 採番(名前ごとの出現回数)。遅延初期化する。
  renderState: { modalCounter: number; navNameCounts?: Map<string, number> };
  // D-2a の core/site-tagline / core/site-logo 用。tagline / logoId が undefined のときは
  // 各レンダラが fail-closed で RangeError を投げる(§8.2)。'' と null は未設定として空出力。
  site?: { name: string; url: string; tagline?: string; logoId?: number | null };
  page?: { isHome: boolean; isSingular: boolean };
  // D-1d-2 の core/navigation 用。無い文脈では navigation 系レンダラが fail-closed で RangeError を投げる。
  navigation?: {
    post: { id: number; content: string } | null;
    pages: Array<{ id: number; title: string; slug: string; parent: number; menuOrder: number }>;
  };
  // D-3a1: 投稿文脈・コンテンツ・クエリの port。
  post?: PostCtx;
  content?: ContentPort;
  queries?: QueriesPort;
  // D-3b2: core/post-template 用。core/query が renderChildren の override で渡す。
  query?: QueryCtx;
};

// renderChildren で子の文脈を一時的に差し替える。許可されるキーは post / content / query のみ。
export type ChildOverride = { post?: PostCtx; content?: ContentPort; query?: QueryCtx };

export type BlockRenderer = {
  validateAttrs: (attrs: Record<string, unknown>) => void;
  // true のとき、innerBlocks を持つブロックでも renderChildren を 0 回呼んでよい。
  childrenOptional?: boolean;
  render: (
    block: ParsedBlock,
    ctx: RenderCtx,
    renderChildren: (blocks: ParsedBlock[], override?: ChildOverride) => string,
  ) => string;
};

export type BlockRegistry = Map<string, BlockRenderer>;

// renderTree が必要とするのは get のみ。Map と ThemeRegistry / PostRegistry の双方を受け取る。
// freeform は投稿用のみ。null blockName の内容(フリーフォーム HTML)を素通しする。サニタイズは後段で行う。
export type RegistryLike = {
  get(name: string): BlockRenderer | undefined;
  freeform?: (html: string) => string;
};

// テーマ由来の既定レジストリ。構築後は凍結され、set / delete / clear を持たない。
export class ThemeRegistry {
  readonly #brand = 'theme';
  readonly #map: Map<string, BlockRenderer>;

  constructor(entries: Iterable<[string, BlockRenderer]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  get(name: string): BlockRenderer | undefined {
    return this.#map.get(name);
  }

  has(name: string): boolean {
    return this.#map.has(name);
  }

  keys(): MapIterator<string> {
    return this.#map.keys();
  }

  entries(): MapIterator<[string, BlockRenderer]> {
    return this.#map.entries();
  }

  values(): MapIterator<BlockRenderer> {
    return this.#map.values();
  }

  get size(): number {
    return this.#map.size;
  }

  [Symbol.iterator](): MapIterator<[string, BlockRenderer]> {
    return this.#map[Symbol.iterator]();
  }
}

// 投稿単位のレジストリ。ThemeRegistry とは nominal に区別される(#brand が異なる)。
export class PostRegistry {
  readonly #brand = 'post';
  readonly #map: Map<string, BlockRenderer>;

  constructor(entries: Iterable<[string, BlockRenderer]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  // フリーフォーム HTML はそのまま通す(サニタイズは renderContent 側で行う)。
  freeform(html: string): string {
    return html;
  }

  static is(x: unknown): x is PostRegistry {
    return typeof x === 'object' && x !== null && #brand in x;
  }

  get(name: string): BlockRenderer | undefined {
    return this.#map.get(name);
  }

  has(name: string): boolean {
    return this.#map.has(name);
  }

  keys(): MapIterator<string> {
    return this.#map.keys();
  }

  entries(): MapIterator<[string, BlockRenderer]> {
    return this.#map.entries();
  }

  values(): MapIterator<BlockRenderer> {
    return this.#map.values();
  }

  get size(): number {
    return this.#map.size;
  }

  [Symbol.iterator](): MapIterator<[string, BlockRenderer]> {
    return this.#map[Symbol.iterator]();
  }
}

export function assertPostRegistry(x: unknown): asserts x is PostRegistry {
  if (!PostRegistry.is(x)) {
    throw new RangeError('expected a PostRegistry instance');
  }
}

export function createPostRegistry(): PostRegistry {
  return new PostRegistry(postBlockRenderers);
}

function assertOverrideKeys(override: ChildOverride): void {
  for (const key of Object.keys(override)) {
    if (key !== 'post' && key !== 'content' && key !== 'query') {
      throw new RangeError(`renderChildren override key not allowed: ${key}`);
    }
  }
}

function sameChildren(actual: ParsedBlock[], expected: ParsedBlock[]): boolean {
  return actual.length === expected.length && actual.every((b, i) => b === expected[i]);
}

// 未登録ブロックは fail-closed で UnsupportedBlockError を投げる。
// blockName が null の空白のみのブロックは無視し、内容を持つ null ブロックは
// blockName の代わりに '(null blockName)' を入れて投げる(設計判断)。
// innerBlocks を持つブロックは、renderChildren に同一要素・同順の innerBlocks を渡す契約を検査する。
export function renderTree(blocks: ParsedBlock[], ctx: RenderCtx, registry: RegistryLike): string {
  let out = '';
  for (const block of blocks) {
    if (block.blockName === null) {
      if (block.innerHTML.trim() === '') {
        continue;
      }
      if (registry.freeform !== undefined) {
        out += registry.freeform(block.innerHTML);
        continue;
      }
      throw new UnsupportedBlockError('(null blockName)');
    }
    const renderer = registry.get(block.blockName);
    if (renderer === undefined) {
      throw new UnsupportedBlockError(block.blockName);
    }
    const attrs = block.attrs ?? {};
    renderer.validateAttrs(attrs);
    // レンダラが block.innerBlocks を書き換えても検査を迂回できないよう、描画開始時点のスナップショットを使う。
    const expected: ParsedBlock[] = [...(block.innerBlocks ?? [])];
    let called = false;
    out += renderer.render(block, ctx, (children, override) => {
      called = true;
      if (override !== undefined) {
        assertOverrideKeys(override);
      }
      if (expected.length > 0 && !sameChildren(children, expected)) {
        throw new RangeError(
          `renderChildren must receive exactly the block's innerBlocks (same elements, same order) for ${block.blockName}`,
        );
      }
      const childCtx = override === undefined ? ctx : { ...ctx, ...override };
      return renderTree(children, childCtx, registry);
    });
    if (!called && expected.length > 0 && renderer.childrenOptional !== true) {
      throw new RangeError(
        `renderChildren was never called for ${block.blockName} which has innerBlocks`,
      );
    }
  }
  return out;
}
