// SPDX-License-Identifier: GPL-3.0-only
import { type GlobalConfig } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';

export type RenderCtx = {
  global: GlobalConfig;
  renderState: { modalCounter: number };
};

export type BlockRenderer = {
  validateAttrs: (attrs: Record<string, unknown>) => void;
  render: (
    block: ParsedBlock,
    ctx: RenderCtx,
    renderChildren: (blocks: ParsedBlock[]) => string,
  ) => string;
};

export type BlockRegistry = Map<string, BlockRenderer>;

// 未登録ブロックは fail-closed で UnsupportedBlockError を投げる。
// blockName が null の空白のみのブロックは無視し、内容を持つ null ブロックは
// blockName の代わりに '(null blockName)' を入れて投げる(設計判断)。
export function renderTree(blocks: ParsedBlock[], ctx: RenderCtx, registry: BlockRegistry): string {
  let out = '';
  for (const block of blocks) {
    if (block.blockName === null) {
      if (block.innerHTML.trim() === '') {
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
    out += renderer.render(block, ctx, (children) => renderTree(children, ctx, registry));
  }
  return out;
}
