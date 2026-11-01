// SPDX-License-Identifier: GPL-3.0-only
// D-2e STEP5: footer template part の合成。
// theme の parts/footer.html を展開し、既定レジストリで木を描画して <footer> で包む。
import { parse } from '@wordpress/block-serialization-default-parser';
import { type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { type ParsedBlock } from './renderBlocks.js';
import { expandPatterns, resolveTemplatePart, type ThemeFiles } from './templateResolve.js';

export function renderFooter(theme: ThemeFiles, ctx: RenderCtx): string {
  const markup = resolveTemplatePart(theme, 'footer');
  const expanded = expandPatterns(markup, theme);
  const blocks = parse(expanded) as ParsedBlock[];
  const inner = renderTree(blocks, ctx, createThemeRegistry());
  return `<footer class="wp-block-template-part">${inner}</footer>`;
}
