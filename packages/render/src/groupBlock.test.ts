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

// ---------------------------------------------------------------------------
// D3z1: 後続セクション(post-navigation / more-posts / main)のフィクスチャ一致
// 期待値は fixtures/ref から正規表現で抽出する(手写しの期待値を使わない)。
// ---------------------------------------------------------------------------

type StartTag = { tag: string; attrs: Record<string, string> };

// 開始タグを parse5 で解析する(属性値は DOM が復号した値)。
async function startTag(html: string): Promise<StartTag> {
	const { parseFragment } = await import('parse5');
	const frag = parseFragment(html);
	const node = frag.childNodes.find((n) => 'tagName' in n) as unknown as
		| { tagName: string; attrs: { name: string; value: string }[] }
		| undefined;
	if (!node) throw new Error(`要素が見つからない: ${html}`);
	return { tag: node.tagName, attrs: Object.fromEntries(node.attrs.map((a) => [a.name, a.value])) };
}

// 比較用の形。class と style の宣言は順序を保持する配列にする。
function shape(t: StartTag): { tag: string; classes: string[]; styles: string[]; rest: Record<string, string> } {
	const { class: cls = '', style = '', ...rest } = t.attrs;
	return {
		tag: t.tag,
		classes: cls.split(/\s+/).filter(Boolean),
		styles: style.split(';').map((s) => s.trim()).filter(Boolean),
		rest,
	};
}

// フィクスチャから正規表現で開始タグを1つ抽出する(id 属性は除去する)。
function fixtureTag(file: string, re: RegExp): string {
	const src = readFileSync(join(FIXTURES, file), 'utf8');
	const m = re.exec(src);
	if (!m) throw new Error(`${file} に該当タグなし: ${re.source}`);
	return m[0].replace(/ id="[^"]*"/, '');
}

async function expectSameStartTag(html: string, expected: string): Promise<void> {
	expect(shape(await startTag(html))).toEqual(shape(await startTag(expected)));
}

describe('D3z1: 後続セクションのフィクスチャ一致', () => {
	// D3z1-01 (Green予測): margin のみ・is-layout-flow の外側 group。現実装で一致する見込み。
	it('D3z1-01: post-navigation 外側 group が main-01 の外側 div と一致する', async () => {
		const html = renderGroup({
			align: 'wide',
			style: { spacing: { margin: { top: 'var:preset|spacing|60', bottom: 'var:preset|spacing|60' } } },
			layout: { type: 'default' },
		});
		const expected = fixtureTag('regions/main-01.html', /<div class="wp-block-group alignwide is-layout-flow[^"]*" style="margin-top:[^"]*">/);
		await expectSameStartTag(html, expected);
	});

	// D3z1-02 (Red予測): tagName nav / ariaLabel / border / flex の未実装。
	// 現実装は optionalEnum(tagName, ['div']) により nav で RangeError となる。
	it('D3z1-02: post-navigation 内側 nav が main-01 の nav 開始タグと一致し </nav> で閉じる', async () => {
		const html = renderGroup({
			ariaLabel: 'Post navigation',
			tagName: 'nav',
			align: 'wide',
			style: {
				border: { top: { color: 'var:preset|color|accent-6', width: '1px' } },
				spacing: { padding: { top: 'var:preset|spacing|40', bottom: 'var:preset|spacing|40' } },
			},
			layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between' },
		});
		const expected = fixtureTag('regions/main-01.html', /<nav class="[^"]*" aria-label="Post navigation" style="[^"]*">/);
		await expectSameStartTag(html, expected);
		expect(html.trimEnd().endsWith('</nav>')).toBe(true);
	});

	// D3z1-03 (外側: Green予測 / card: Red予測)
	// card は border の辺順・verticalAlignment(class なし)・空配列辺の扱いに依存する。
	it('D3z1-03: more-posts 外側 group が main-02 の外側 div と一致する', async () => {
		const html = renderGroup({
			align: 'wide',
			style: { spacing: { padding: { top: 'var:preset|spacing|60', bottom: 'var:preset|spacing|60' } } },
			layout: { type: 'constrained' },
		});
		const expected = fixtureTag('regions/main-02.html', /<div class="wp-block-group alignwide has-global-padding is-layout-constrained[^"]*" style="padding-top:[^"]*">/);
		await expectSameStartTag(html, expected);
	});

	// D3z1-03 card (Red予測): border の辺順、verticalAlignment、空配列辺を含む入力。
	it('D3z1-03: more-posts の card が main-02 の card 開始タグと一致する', async () => {
		const html = renderGroup({
			align: 'full',
			style: {
				spacing: { padding: { top: 'var:preset|spacing|30', bottom: 'var:preset|spacing|30' } },
				border: {
					bottom: { color: 'var:preset|color|accent-6', width: '1px' },
					top: [],
					right: [],
					left: [],
				},
			},
			layout: { type: 'flex', flexWrap: 'nowrap', verticalAlignment: 'center', justifyContent: 'space-between' },
		});
		const expected = fixtureTag('regions/main-02.html', /<div class="wp-block-group alignfull is-content-justification-space-between[^"]*" style="border-bottom-color:[^"]*">/);
		await expectSameStartTag(html, expected);
	});

	// D3z1-04 (Red予測): tagName main が未対応。現実装は tagName を無視して div を出す。
	it('D3z1-04: tagName main の出力が spike の main 開始タグと一致し id を持たない', async () => {
		const html = renderGroup({
			tagName: 'main',
			style: { spacing: { margin: { top: 'var:preset|spacing|60' } } },
			layout: { type: 'constrained' },
		});
		expect(html).toBe(
			'<main class="wp-block-group has-global-padding is-layout-constrained wp-block-group-is-layout-constrained" style="margin-top:var(--wp--preset--spacing--60)"></main>',
		);
		const expected = fixtureTag('spike-blocks.html', /<main id="wp--skip-link--target"[^>]*>/);
		await expectSameStartTag(html, expected);
	});
});

describe('D3z1: tagName の受理・拒否', () => {
	// D3z1-05 (Red予測): div 以外は現実装で RangeError になる。
	it.each(['div', 'main', 'nav', 'header', 'footer', 'section'])('D3z1-05: tagName=%s が開始タグと終了タグに反映される', async (tag) => {
		const html = renderGroup({ tagName: tag });
		expect((await startTag(html)).tag).toBe(tag);
		expect(html.trimEnd().endsWith(`</${tag}>`)).toBe(true);
	});

	// D3z1-05 (Red予測): 許可外の値は RangeError。現実装は ['div'] のみ許可するため
	// script / a / DIV / '' / 1 / null は RangeError になる見込み。
	it.each([['script'], ['a'], ['DIV'], [''], [1], [null]])('D3z1-05: tagName=%j は RangeError', (v) => {
		expect(captureError(() => renderGroup({ tagName: v }))).toBeInstanceOf(RangeError);
	});
});

describe('D3z1: ariaLabel', () => {
	// D3z1-06 (Red予測): ariaLabel は未実装のため aria-label が出力されない。
	it('D3z1-06: tagName=nav の ariaLabel が aria-label として出力される', async () => {
		const html = renderGroup({ tagName: 'nav', ariaLabel: 'Post navigation' });
		expect((await startTag(html)).attrs['aria-label']).toBe('Post navigation');
	});

	// D3z1-06 (Red予測): 値を属性として解釈されず、そのまま保持されること。
	it.each([['a"b'], ['<x>&'], ['" onmouseover="x']])('D3z1-06: ariaLabel=%j は属性を追加せず値を保持する', async (v) => {
		const html = renderGroup({ tagName: 'nav', ariaLabel: v });
		const t = await startTag(html);
		expect(t.attrs['aria-label']).toBe(v);
		expect(Object.keys(t.attrs)).not.toContain('onmouseover');
	});

	// D3z1-06 (Red予測): 非文字列は RangeError。
	it.each([[1], [{}]])('D3z1-06: ariaLabel=%j(非文字列)は RangeError', (v) => {
		expect(captureError(() => renderGroup({ tagName: 'nav', ariaLabel: v }))).toBeInstanceOf(RangeError);
	});

	// D3z1-06 (Red予測): nav 以外で ariaLabel は RangeError。
	// 注意: tagName main は現状でも RangeError になるため、main はこの検証に含めない(誤って Green になるのを避ける)。
	it.each([['既定の div', {}], ['tagName=div', { tagName: 'div' }]])('D3z1-06: %s で ariaLabel は RangeError', (_label, extra) => {
		expect(captureError(() => renderGroup({ ...extra, ariaLabel: 'Post navigation' }))).toBeInstanceOf(RangeError);
	});
});

describe('D3z1: align(回帰ガード)', () => {
	// D3z1-07 回帰ガード(Green予測): alignfull / alignwide は wp-block-group の直後に出る。
	it.each([['full'], ['wide']])('D3z1-07: align=%s が wp-block-group の直後に align%s として出る', (a) => {
		const tokens = firstClassTokens(renderGroup({ align: a }));
		expect(tokens.slice(0, 2)).toEqual(['wp-block-group', `align${a}`]);
	});

	// D3z1-07 回帰ガード(Green予測): 許可外の値は RangeError。
	it.each([['left'], [''], [1]])('D3z1-07: align=%j は RangeError', (a) => {
		expect(captureError(() => renderGroup({ align: a }))).toBeInstanceOf(RangeError);
	});
});

describe('D3z1: style.border(フィクスチャ由来の順序と fail-closed)', () => {
	// D3z1-08 (Red予測): border は未実装。出力順は top-color, top-width, bottom-color, bottom-width, padding。
	it('D3z1-08: border の出力順が top-color, top-width, bottom-color, bottom-width, padding の順になる', async () => {
		const html = renderGroup({
			style: {
				border: {
					bottom: { color: 'var:preset|color|accent-6', width: '2px' },
					top: { color: 'var:preset|color|accent-6', width: '1px' },
				},
				spacing: { padding: { top: 'var:preset|spacing|40' } },
			},
		});
		expect(shape(await startTag(html)).styles).toEqual([
			'border-top-color:var(--wp--preset--color--accent-6)',
			'border-top-width:1px',
			'border-bottom-color:var(--wp--preset--color--accent-6)',
			'border-bottom-width:2px',
			'padding-top:var(--wp--preset--spacing--40)',
		]);
	});

	// D3z1-08 (Red予測): 不正な color / width は RangeError。現実装は border を検証しないため通過する。
	it.each([['url(x)'], ['red;x:y'], ['#fff'], ['var:preset|color|Accent-6'], ['var:preset|color|accent 6'], ['accent-6']])(
		'D3z1-08: border.top.color=%j は RangeError',
		(c) => {
			expect(captureError(() => renderGroup({ style: { border: { top: { color: c } } } }))).toBeInstanceOf(RangeError);
		},
	);

	it.each([['-1px'], ['1'], ['url(x)']])('D3z1-08: border.top.width=%j は RangeError', (w) => {
		expect(captureError(() => renderGroup({ style: { border: { top: { width: w } } } }))).toBeInstanceOf(RangeError);
	});

	// D3z1-08 (Red予測): 未知キー・非空の left.color は RangeError。
	it.each([
		['border.radius', { border: { radius: '4px' } }],
		['border.left.color(非空)', { border: { left: { color: 'var:preset|color|accent-6' } } }],
	])('D3z1-08: 未知キー %s は RangeError', (_label, border) => {
		expect(captureError(() => renderGroup({ style: border }))).toBeInstanceOf(RangeError);
	});

	// D3z1-08 回帰ガード(Green予測): 空配列の辺は受理され、宣言を出さない。
	it('D3z1-08: 空配列の border 辺は受理され無視される(回帰ガード)', async () => {
		const html = renderGroup({ style: { border: { top: [], right: [], bottom: [], left: [] } } });
		expect(shape(await startTag(html)).styles).toEqual([]);
	});
});

describe('D3z1: flex verticalAlignment と flex 回帰ガード', () => {
	// D3z1-09 (Green予測): 受理されるが class を増やさない。現実装は無視するため一致する見込み。
	it.each([['top'], ['center'], ['bottom']])('D3z1-09: verticalAlignment=%s は受理され class を増やさない', (va) => {
		const base = firstClassTokens(renderGroup({ layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between' } }));
		const withVa = firstClassTokens(
			renderGroup({ layout: { type: 'flex', flexWrap: 'nowrap', verticalAlignment: va, justifyContent: 'space-between' } }),
		);
		expect(withoutContainer(withVa)).toEqual(withoutContainer(base));
	});

	// D3z1-09 (Red予測): 許可外の値は RangeError。現実装は検証しないため通過する。
	it.each([['middle'], ['Center'], [''], [1]])('D3z1-09: verticalAlignment=%j は RangeError', (va) => {
		expect(captureError(() => renderGroup({ layout: { type: 'flex', verticalAlignment: va } }))).toBeInstanceOf(RangeError);
	});

	// D3z1-09 回帰ガード(Green予測): flexWrap / justifyContent の class 出力。
	it('D3z1-09: flexWrap と justifyContent が class に反映される(回帰ガード)', () => {
		const tokens = firstClassTokens(renderGroup({ layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between' } }));
		expect(withoutContainer(tokens)).toEqual([
			'wp-block-group',
			'is-content-justification-space-between',
			'is-nowrap',
			'is-layout-flex',
			'wp-block-group-is-layout-flex',
		]);
	});
});

// D3z1-08 補強(STEP6 mutation 生存): border の1辺オブジェクトの未知キーと型。
describe('D3z1-08 補強: border 1辺の構造検査', () => {
	it.each([
		['未知キー style', { top: { color: 'var:preset|color|accent-6', width: '1px', style: 'solid' } }],
		['未知キー radius', { bottom: { width: '1px', radius: '3px' } }],
		['文字列', { top: '1px' }],
		['数値', { bottom: 1 }],
		['null', { top: null }],
	])('D3z1-08: border %s は RangeError', (_name, border) => {
		expect(captureError(() => renderGroup({ style: { border } }))).toBeInstanceOf(RangeError);
	});
});

// ---------------------------------------------------------------------------
// D3c2: hidden-written-by の group(fontSize / style.spacing.blockGap)
// 期待値は fixtures/ref から正規表現で抽出する。
// ---------------------------------------------------------------------------

const WRITTEN_BY_MARGIN = { bottom: 'var:preset|spacing|60' };
const WRITTEN_BY_ATTRS = {
	style: { spacing: { blockGap: '0.2em', margin: WRITTEN_BY_MARGIN } },
	fontSize: 'small',
	layout: { type: 'flex', flexWrap: 'wrap' },
};
const WRITTEN_BY_START = /<div class="wp-block-group has-small-font-size[^"]*" style="[^"]*">/;

describe('D3c2-08: hidden-written-by group の開始タグ', () => {
	// D3c2-08 (Red予測): fontSize 未実装のため has-small-font-size が出ず class 列が一致しない。
	it('D3c2-08: 開始タグが main-01 の written-by div と class 順序・ハッシュ・style で一致する', async () => {
		const html = renderGroup(WRITTEN_BY_ATTRS);
		const expected = fixtureTag('regions/main-01.html', WRITTEN_BY_START);
		await expectSameStartTag(html, expected);
	});

	// D3c2-08 (Red予測): blockGap が hash 入力に入らないため、blockGap の値変更・省略で hash が変わらない。
	it('D3c2-08: blockGap を変えても省略しても container hash が変わり、基準は fd1a9a6d になる', () => {
		const withGap = containerToken(renderGroup(WRITTEN_BY_ATTRS));
		const otherGap = containerToken(
			renderGroup({ ...WRITTEN_BY_ATTRS, style: { spacing: { blockGap: '0.3em', margin: WRITTEN_BY_MARGIN } } }),
		);
		const noGap = containerToken(renderGroup({ ...WRITTEN_BY_ATTRS, style: { spacing: { margin: WRITTEN_BY_MARGIN } } }));
		expect(withGap).toBe('wp-container-core-group-is-layout-fd1a9a6d');
		expect(otherGap).not.toBe(withGap);
		expect(noGap).not.toBe(withGap);
	});
});

describe('D3c2-09: fontSize の受理・拒否と class 順序', () => {
	// D3c2-09 (Red予測): fontSize 未実装のため現実装は受理してしまい RangeError にならない。
	it.each([['Small'], ['a b'], ['"'], [1], ['']])('D3c2-09: fontSize=%j は RangeError', (v) => {
		expect(captureError(() => renderGroup({ fontSize: v }))).toBeInstanceOf(RangeError);
	});

	// D3c2-09 (Red予測): has-small-font-size が未出力のため、align 直後の位置が一致しない。
	it('D3c2-09: align と併用すると wp-block-group, alignwide, has-small-font-size の順になる', () => {
		const tokens = firstClassTokens(renderGroup({ align: 'wide', fontSize: 'small' }));
		expect(tokens.slice(0, 3)).toEqual(['wp-block-group', 'alignwide', 'has-small-font-size']);
	});

	// D3c2-09 (Red予測): blockGap 未検証のため不正値が通過し RangeError にならない。
	it.each([['1'], ['1rem;x:y'], ['url(x)'], ['-1px'], [1]])('D3c2-09: blockGap=%j は RangeError', (v) => {
		expect(captureError(() => renderGroup({ style: { spacing: { blockGap: v } } }))).toBeInstanceOf(RangeError);
	});

	// D3c2-09 (Red予測見込み): 許可値は受理される。現実装で通る可能性がある(Green 想定の回帰ガード)。
	it.each([['0'], ['0.2em'], ['10px'], ['1.5rem'], ['var:preset|spacing|40']])('D3c2-09: blockGap=%j は受理される', (v) => {
		expect(() => renderGroup({ style: { spacing: { blockGap: v } } })).not.toThrow();
	});

	// D3c2-09 (Red予測): 現実装は blockGap を style に出さないが、fontSize 未実装で開始タグ全体が一致しないため
	// style の宣言だけを比較する。blockGap は style 属性に出ず margin のみが残ること。
	it('D3c2-09: blockGap は style 属性に出力されず margin-bottom のみが残る', async () => {
		const html = renderGroup(WRITTEN_BY_ATTRS);
		expect(shape(await startTag(html)).styles).toEqual(['margin-bottom:var(--wp--preset--spacing--60)']);
	});
});

// D3g 補強: group の未知属性は黙って捨てず拒否する(anchor が id として出ない等の不一致を fail-closed にする)。
describe('group: 未知の属性は RangeError', () => {
	it.each([['anchor', 'x'], ['className', 'is-style-x'], ['metadata', {}], ['lock', {}], ['templateLock', 'all'], ['backgroundColor', 'base'], ['textColor', 'contrast']])(
		'D3g-group: 属性 %s は RangeError',
		(key, value) => {
			expect(captureError(() => renderGroup({ [key]: value }))).toBeInstanceOf(RangeError);
		},
	);
});
