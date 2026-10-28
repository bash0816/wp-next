// SPDX-License-Identifier: GPL-3.0-only
// Red期待: './groupBlock.js' と './blockRegistry.js' が未存在のため、static import の解決に失敗しファイル全体がロード時に落ちる想定。
// header 比較の注意: ヘッダー全体は regions/header.html の site-title / navigation 部分を stub に置換して比較する。
// <header class="wp-block-template-part"> ラッパーは fixture 側に含まれるため、描画結果側にも本テストで付与して比較する。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { describe, expect, it } from 'vitest';
import { type BlockRegistry, type BlockRenderer, type RenderCtx, renderTree } from './blockRegistry.js';
import { groupRenderer } from './groupBlock.js';
import { htmlEquals, normalizeHtml } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import type { ParsedBlock } from './renderBlocks.js';
import { expandPatterns, resolveTemplatePart, type ThemeFiles } from './templateResolve.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

const realTheme: ThemeFiles = {
	read(relPath) {
		const p = join(THEME_DIR, relPath);
		return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
	},
};
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);
const ctx: RenderCtx = { global: cfg, renderState: { modalCounter: 0 } };

const parseBlocks = (src: string): ParsedBlock[] => parse(src) as ParsedBlock[];
const noChildren = (): string => '';

// attrs から group ブロックを検証・描画する。validateAttrs と render の両方を通す。
function renderGroup(
	attrs: Record<string, unknown>,
	innerBlocks: ParsedBlock[] = [],
	renderChildren: (blocks: ParsedBlock[]) => string = noChildren,
): string {
	const block: ParsedBlock = { blockName: 'core/group', attrs, innerBlocks, innerHTML: '', innerContent: [] };
	groupRenderer.validateAttrs(attrs);
	return groupRenderer.render(block, ctx, renderChildren);
}

// 先頭要素の class トークン列(順序保持)
function firstClassTokens(html: string): string[] {
	const m = /^<[a-zA-Z][\w-]*\s+class="([^"]*)"/.exec(html.trim());
	if (!m) throw new Error(`class 属性が見つからない: ${html}`);
	return (m[1] ?? '').split(/\s+/);
}

const withoutContainer = (tokens: string[]): string[] => tokens.filter((t) => !t.startsWith('wp-container-'));
const containerToken = (html: string): string | undefined => firstClassTokens(html).find((t) => t.startsWith('wp-container-'));
const CONTAINER = expect.stringMatching(/^wp-container-core-group-is-layout-[0-9a-f]{8}$/);

const captureError = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
};

describe('core/group: fixture header(regions/header.html)との比較', () => {
	it('template part header を実パイプラインで描画すると、stub 置換後の header.html と一致する', () => {
		// 検出対象: class 順序・layout 分岐・padding style・container class の不一致全般。期待Red理由: モジュール未存在。
		const fixture = readFileSync(join(FIXTURES, 'regions/header.html'), 'utf8');
		const siteTitleRe = /<p class="wp-block-site-title">[\s\S]*?<\/p>/g;
		const navRe = /<nav[\s\S]*?<\/nav>/g;
		expect(fixture.match(siteTitleRe)?.length).toBe(1);
		expect(fixture.match(navRe)?.length).toBe(1);
		const expected = fixture
			.replace(siteTitleRe, '<x-stub data-name="core/site-title"></x-stub>')
			.replace(navRe, '<x-stub data-name="core/navigation"></x-stub>');

		const part = resolveTemplatePart(realTheme, 'header');
		expect(part).toBeDefined();
		const markup = expandPatterns(part as string, realTheme);

		const stub: BlockRenderer = {
			validateAttrs: () => {},
			render: (block) => `<x-stub data-name="${block.blockName}"></x-stub>`,
		};
		const registry: BlockRegistry = new Map<string, BlockRenderer>([
			['core/group', groupRenderer],
			['core/site-title', stub],
			['core/navigation', stub],
		]);
		const rendered = `<header class="wp-block-template-part">${renderTree(parseBlocks(markup), ctx, registry)}</header>`;
		expect(normalizeHtml(rendered)).toBe(normalizeHtml(expected));
	});
});

describe('core/group: 手書きの独立ケース(コンテナ class はハッシュ値を直書きしない)', () => {
	it('layout 未指定は flow 扱いで、コンテナ class を付けず class 順は wp-block-group → is-layout-flow → wp-block-group-is-layout-flow', () => {
		// 検出対象: 既定 layout の誤判定、flow へのコンテナ class 誤付与。期待Red理由: モジュール未存在。
		const out = renderGroup({});
		expect(firstClassTokens(out)).toEqual(['wp-block-group', 'is-layout-flow', 'wp-block-group-is-layout-flow']);
	});

	it('layout.type=default は flow と同じ出力になる', () => {
		// 検出対象: default の flow への正規化漏れ。期待Red理由: モジュール未存在。
		const out = renderGroup({ layout: { type: 'default' } });
		expect(firstClassTokens(out)).toEqual(['wp-block-group', 'is-layout-flow', 'wp-block-group-is-layout-flow']);
	});

	it('align=full は alignfull を wp-block-group の直後に付与する', () => {
		// 検出対象: align クラスの欠落・順序違い。期待Red理由: モジュール未存在。
		const out = renderGroup({ align: 'full', layout: { type: 'default' } });
		expect(firstClassTokens(out)).toEqual(['wp-block-group', 'alignfull', 'is-layout-flow', 'wp-block-group-is-layout-flow']);
	});

	it('constrained は has-global-padding を is-layout-constrained の前に付与する(コンテナ class は除外して順序を見る)', () => {
		// 検出対象: has-global-padding の欠落・順序違い。期待Red理由: モジュール未存在。
		const out = renderGroup({ layout: { type: 'constrained' } });
		expect(withoutContainer(firstClassTokens(out))).toEqual([
			'wp-block-group',
			'has-global-padding',
			'is-layout-constrained',
			'wp-block-group-is-layout-constrained',
		]);
	});

	it('flex + align=wide + justifyContent=space-between + flexWrap=nowrap の class 順序が仕様どおり', () => {
		// 検出対象: class 順序の不一致、is-nowrap/is-content-justification の欠落、コンテナ class の位置ずれ。期待Red理由: モジュール未存在。
		const out = renderGroup({
			align: 'wide',
			layout: { type: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap' },
		});
		expect(firstClassTokens(out)).toEqual([
			'wp-block-group',
			'alignwide',
			'is-content-justification-space-between',
			'is-nowrap',
			'is-layout-flex',
			CONTAINER,
			'wp-block-group-is-layout-flex',
		]);
	});

	it('flex + justifyContent=right は is-content-justification-right を付与する', () => {
		// 検出対象: justifyContent 値のマッピング誤り。期待Red理由: モジュール未存在。
		const out = renderGroup({ layout: { type: 'flex', justifyContent: 'right' } });
		expect(withoutContainer(firstClassTokens(out))).toEqual([
			'wp-block-group',
			'is-content-justification-right',
			'is-layout-flex',
			'wp-block-group-is-layout-flex',
		]);
	});

	it('同じ flex 構成は同じコンテナ class、構成が異なれば別のコンテナ class になる', () => {
		// 検出対象: コンテナ class がレイアウト設定を反映しない実装、または毎回変わる実装。期待Red理由: モジュール未存在。
		const a1 = renderGroup({ layout: { type: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap' } });
		const a2 = renderGroup({ layout: { type: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap' } });
		const b = renderGroup({ layout: { type: 'flex', justifyContent: 'right', flexWrap: 'nowrap' } });
		expect(containerToken(a1)).toMatch(/^wp-container-core-group-is-layout-[0-9a-f]{8}$/);
		expect(containerToken(a1)).toBe(containerToken(a2));
		expect(containerToken(a1)).not.toBe(containerToken(b));
	});

	it('flow にはコンテナ class を付与しない', () => {
		// 検出対象: flow への container class 誤付与。期待Red理由: モジュール未存在。
		const out = renderGroup({ layout: { type: 'default' } });
		expect(containerToken(out)).toBeUndefined();
	});

	it('blockGap のみの style では group に style 属性を出力しない', () => {
		// 検出対象: blockGap を inline style に出す実装。期待Red理由: モジュール未存在。
		const out = renderGroup({
			style: { spacing: { blockGap: 'var:preset|spacing|10' } },
			layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'right' },
		});
		expect(out).not.toMatch(/\sstyle=/);
	});

	it('style 未指定の group に style 属性を出力しない', () => {
		// 検出対象: 空の style 属性の出力。期待Red理由: モジュール未存在。
		const out = renderGroup({ layout: { type: 'default' } });
		expect(out).not.toMatch(/\sstyle=/);
	});

	it('padding の top/bottom は var:preset 形式を CSS 変数の padding-top/bottom に変換する', () => {
		// 検出対象: padding の変換漏れ、var:preset|spacing|NN から var(--wp--preset--spacing--NN) への変換誤り。期待Red理由: モジュール未存在。
		const out = renderGroup({
			style: { spacing: { padding: { top: 'var:preset|spacing|30', bottom: 'var:preset|spacing|30' } } },
			layout: { type: 'default' },
		});
		expect(out).toMatch(
			/style="padding-top:var\(--wp--preset--spacing--30\);padding-bottom:var\(--wp--preset--spacing--30\)"/,
		);
	});

	it('tagName 未指定の出力タグは div である', () => {
		// 検出対象: 既定タグの誤り。期待Red理由: モジュール未存在。
		const out = renderGroup({});
		expect(out.startsWith('<div ')).toBe(true);
	});

	it('子ブロックは renderChildren に innerBlocks として渡され、その出力が div の中に入る', () => {
		// 検出対象: 子の再帰描画の欠落、renderChildren への未渡し。期待Red理由: モジュール未存在。
		const child: ParsedBlock = { blockName: 'core/paragraph', attrs: {}, innerBlocks: [], innerHTML: '', innerContent: [] };
		const calls: ParsedBlock[][] = [];
		const out = renderGroup({ layout: { type: 'default' } }, [child], (blocks) => {
			calls.push(blocks);
			return '<CHILD/>';
		});
		expect(calls).toEqual([[child]]);
		expect(htmlEquals(out, '<div class="wp-block-group is-layout-flow wp-block-group-is-layout-flow"><CHILD/></div>')).toBe(true);
	});
});

describe('core/group: fail-closed(RangeError)', () => {
	it('未知の layout.type は RangeError', () => {
		// 検出対象: 未知 layout の黙殺・フォールバック。期待Red理由: モジュール未存在。
		const err = captureError(() => renderGroup({ layout: { type: 'grid' } }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('flex で許可されない justifyContent 値は RangeError', () => {
		// 検出対象: justifyContent の許可リスト検証漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() => renderGroup({ layout: { type: 'flex', justifyContent: 'stretch' } }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('align が文字列でない場合は RangeError', () => {
		// 検出対象: 属性の型検証漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() => renderGroup({ align: 5 }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('layout がオブジェクトでない場合は RangeError', () => {
		// 検出対象: 属性の型検証漏れ(layout が文字列)。期待Red理由: モジュール未存在。
		const err = captureError(() => renderGroup({ layout: 'flex' }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('CSS 値に ; を含む padding は RangeError', () => {
		// 検出対象: style インジェクション(宣言の追加)の防止漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() =>
			renderGroup({ style: { spacing: { padding: { top: '1px;color:red' } } }, layout: { type: 'default' } }),
		);
		expect(err).toBeInstanceOf(RangeError);
	});

	it('CSS 値に " を含む padding は RangeError', () => {
		// 検出対象: 属性値の引用符による脱出の防止漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() =>
			renderGroup({ style: { spacing: { padding: { top: '1px"x' } } }, layout: { type: 'default' } }),
		);
		expect(err).toBeInstanceOf(RangeError);
	});

	it('CSS 値に < を含む padding は RangeError', () => {
		// 検出対象: HTML 注入の防止漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() =>
			renderGroup({ style: { spacing: { padding: { top: '<b>' } } }, layout: { type: 'default' } }),
		);
		expect(err).toBeInstanceOf(RangeError);
	});

	it('tagName が div 以外の未許可値(script)は RangeError', () => {
		// 検出対象: tagName の許可リスト検証漏れ。期待Red理由: モジュール未存在。
		const err = captureError(() => renderGroup({ tagName: 'script' }));
		expect(err).toBeInstanceOf(RangeError);
	});
});
