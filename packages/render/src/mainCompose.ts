// SPDX-License-Identifier: GPL-3.0-only
// D-3g STEP5: main template part 相当の合成 (renderMain)。
// theme の templates/<name>.html から main 部分を取り出して展開し、既定レジストリで木を描画する。
// 出力の <main> 開始タグに skip-link のターゲット id を付与する。
// 違反 (<main> が 1 個でない / 既存 id あり / 本文に予約文字列) は RangeError で拒否し、部分出力は返さない。
import { parse } from '@wordpress/block-serialization-default-parser';
import { type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { type ParsedBlock } from './renderBlocks.js';
import { expandPatterns, parseTemplate, type ThemeFiles } from './templateResolve.js';

export const SKIP_LINK_TARGET_ID = 'wp--skip-link--target';

const MAIN_OPEN = /<main(?=[\s>/])/g;

export function renderMain(theme: ThemeFiles, ctx: RenderCtx, templateName = 'single'): string {
  const { main } = parseTemplate(theme, templateName);
  const expanded = expandPatterns(main, theme);
  const blocks = parse(expanded) as ParsedBlock[];
  const out = renderTree(blocks, ctx, createThemeRegistry());

  const openings = [...out.matchAll(MAIN_OPEN)];
  if (openings.length !== 1) {
    throw new RangeError(`renderMain: expected exactly one <main> opening tag, found ${openings.length}`);
  }
  const start = openings[0]?.index ?? 0;
  const tagEnd = out.indexOf('>', start);
  if (tagEnd < 0) {
    throw new RangeError('renderMain: unterminated <main> opening tag');
  }
  const openTag = out.slice(start, tagEnd + 1);
  if (/\sid\s*=/.test(openTag)) {
    throw new RangeError('renderMain: <main> already has an id attribute');
  }
  if (out.includes(SKIP_LINK_TARGET_ID)) {
    throw new RangeError(`renderMain: output already contains "${SKIP_LINK_TARGET_ID}"`);
  }

  const insertAt = start + '<main'.length;
  return `${out.slice(0, insertAt)} id="${SKIP_LINK_TARGET_ID}"${out.slice(insertAt)}`;
}
