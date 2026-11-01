// SPDX-License-Identifier: GPL-3.0-only
// D-1e STEP5: header template part の合成。
// theme の parts/header.html を展開し、既定レジストリで木を描画して <header> で包む。
import { parse } from '@wordpress/block-serialization-default-parser';
import { type RenderCtx, renderTree, ThemeRegistry } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { groupRenderer } from './groupBlock.js';
import { navigationLinkRenderer, navigationRenderer, pageListRenderer } from './navigationBlock.js';
import { siteTitleRenderer } from './siteTitleBlock.js';
import { siteLogoRenderer } from './siteLogoBlock.js';
import { siteTaglineRenderer } from './siteTaglineBlock.js';
import { spacerRenderer } from './spacerBlock.js';
import { columnRenderer, columnsRenderer } from './columnsBlock.js';
import { paragraphRenderer } from './paragraphBlock.js';
import { headingRenderer } from './headingBlock.js';
import { postDateRenderer, postTitleRenderer } from './postTitleDate.js';
import { postNavigationLinkRenderer } from './postNavigation.js';
import { postTemplateRenderer, queryRenderer } from './queryBlock.js';
import { postAuthorNameRenderer, postFeaturedImageRenderer, postTermsRenderer } from './termsAuthor.js';
import { postContentRenderer } from './postContent.js';
import { expandPatterns, resolveTemplatePart, type ThemeFiles } from './templateResolve.js';

export function createThemeRegistry(): ThemeRegistry {
  return new ThemeRegistry([
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
    ['core/heading', headingRenderer],
    ['core/post-title', postTitleRenderer],
    ['core/post-date', postDateRenderer],
    ['core/query', queryRenderer],
    ['core/post-template', postTemplateRenderer],
    ['core/post-terms', postTermsRenderer],
    ['core/post-author-name', postAuthorNameRenderer],
    ['core/post-featured-image', postFeaturedImageRenderer],
    ['core/post-content', postContentRenderer],
    ['core/post-navigation-link', postNavigationLinkRenderer],
  ]);
}

export function renderHeader(theme: ThemeFiles, ctx: RenderCtx): string {
  const markup = resolveTemplatePart(theme, 'header');
  const expanded = expandPatterns(markup, theme);
  const blocks = parse(expanded) as ParsedBlock[];
  const inner = renderTree(blocks, ctx, createThemeRegistry());
  return `<header class="wp-block-template-part">${inner}</header>`;
}
