// SPDX-License-Identifier: GPL-3.0-only
// D-1e STEP5: header template part の合成。
// theme の parts/header.html を展開し、既定レジストリで木を描画して <header> で包む。
import { parse } from '@wordpress/block-serialization-default-parser';
import { type BlockRegistry, type RenderCtx, renderTree } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { groupRenderer } from './groupBlock.js';
import { navigationLinkRenderer, navigationRenderer, pageListRenderer } from './navigationBlock.js';
import { siteTitleRenderer } from './siteTitleBlock.js';
import { siteLogoRenderer } from './siteLogoBlock.js';
import { siteTaglineRenderer } from './siteTaglineBlock.js';
import { spacerRenderer } from './spacerBlock.js';
import { columnRenderer, columnsRenderer } from './columnsBlock.js';
import { paragraphRenderer } from './paragraphBlock.js';
import { expandPatterns, resolveTemplatePart, type ThemeFiles } from './templateResolve.js';

export function createDefaultRegistry(): BlockRegistry {
  return new Map([
    ['core/group', groupRenderer],
    ['core/site-title', siteTitleRenderer],
    ['core/navigation', navigationRenderer],
    ['core/page-list', pageListRenderer],
    ['core/navigation-link', navigationLinkRenderer],
    ['core/site-logo', siteLogoRenderer],
    ['core/site-tagline', siteTaglineRenderer],
    ['core/spacer', spacerRenderer],
    ['core/columns', columnsRenderer],
    ['core/column', columnRenderer],
    ['core/paragraph', paragraphRenderer],
  ]);
}

export function renderHeader(theme: ThemeFiles, ctx: RenderCtx): string {
  const markup = resolveTemplatePart(theme, 'header');
  const expanded = expandPatterns(markup, theme);
  const blocks = parse(expanded) as ParsedBlock[];
  const inner = renderTree(blocks, ctx, createDefaultRegistry());
  return `<header class="wp-block-template-part">${inner}</header>`;
}
