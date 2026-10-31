// SPDX-License-Identifier: GPL-3.0-only
// D-2a footer の葉ブロック(core/site-logo, core/site-tagline, core/spacer)のテスト。
// 実装 './siteLogoBlock.js' / './siteTaglineBlock.js' / './spacerBlock.js' は未作成のため、
// static import の解決失敗でファイル全体がロード時に Red になる想定(assertion-level Red ではない)。
// 期待値は fixtures の HTML から抜き出す(ハードコード禁止)。比較は normalizeHtml で行う。
// 手書きの期待値は WP 7.1.3 wp-includes/blocks/<file>.php の規則に基づく(各 it のコメントに明記)。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { describe, expect, it } from 'vitest';
import type { BlockRenderer, RenderCtx } from './blockRegistry.js';
import { siteLogoRenderer } from './siteLogoBlock.js';
import { siteTaglineRenderer } from './siteTaglineBlock.js';
import { spacerRenderer } from './spacerBlock.js';
import { normalizeHtml, htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import type { ParsedBlock } from './renderBlocks.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

// D-2a で RenderCtx.site に追加される前提の拡張型(テスト専用)
type FooterSite = {
	name: string;
	url: string;
	tagline?: string;
	logoId?: number | null;
};
type FooterCtx = RenderCtx & { site: FooterSite };
const baseCtx = { global: cfg, renderState: { modalCounter: 0 } };
// 欠落テストで明示的に undefined を渡すため(exactOptionalPropertyTypes 下でも受け付ける)
type FooterSiteOverride = { [K in keyof FooterSite]?: FooterSite[K] | undefined };
const footerCtx = (site: FooterSiteOverride = {}): FooterCtx => ({
	...baseCtx,
	site: { name: 'wpref', url: 'http://127.0.0.1:8080', ...site } as FooterSite,
});

// validateAttrs と render の両方を通す(siteTitleBlock.test.ts と同じ読み方)
function renderLeaf(
	renderer: BlockRenderer,
	blockName: string,
	attrs: Record<string, unknown>,
	ctx: FooterCtx,
): string {
	renderer.validateAttrs(attrs);
	const block: ParsedBlock = { blockName, attrs, innerBlocks: [], innerHTML: '', innerContent: [] };
	return renderer.render(block, ctx, () => '');
}
const renderLogo = (attrs: Record<string, unknown>, ctx: FooterCtx): string =>
	renderLeaf(siteLogoRenderer, 'core/site-logo', attrs, ctx);
const renderTagline = (attrs: Record<string, unknown>, ctx: FooterCtx): string =>
	renderLeaf(siteTaglineRenderer, 'core/site-tagline', attrs, ctx);
const renderSpacer = (attrs: Record<string, unknown>, ctx: FooterCtx = footerCtx()): string =>
	renderLeaf(spacerRenderer, 'core/spacer', attrs, ctx);

const captureError = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
};

type Node = DefaultTreeAdapterMap['node'];
type El = DefaultTreeAdapterMap['element'];

// 出力を parse5 でパースし、要素を深さ優先で列挙する(実行可能タグや属性の検査用)
function elementsOf(html: string): El[] {
	const out: El[] = [];
	const walk = (nodes: Node[]): void => {
		for (const n of nodes) {
			if (n.nodeName.startsWith('#')) continue;
			const el = n as El;
			out.push(el);
			walk(el.childNodes as Node[]);
		}
	};
	walk(parseFragment(html).childNodes as Node[]);
	return out;
}
const tagNames = (html: string): string[] => elementsOf(html).map((e) => e.tagName);
const attrNames = (el: El): string[] => el.attrs.map((a) => a.name);
const attrValue = (el: El, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value;

function textOf(n: Node): string {
	if (n.nodeName === '#text') return (n as DefaultTreeAdapterMap['textNode']).value;
	const kids = (n as El).childNodes as Node[] | undefined;
	return kids ? kids.map(textOf).join('') : '';
}

// fixture 由来の抜き出し(正規表現)。期待値をコードに直書きしない。
const TAGLINE_RE = /<p class="wp-block-site-tagline">[\s\S]*?<\/p>/;
function fixtureTagline(relPath: string): string {
	const src = readFileSync(join(FIXTURES, relPath), 'utf8');
	const m = TAGLINE_RE.exec(src);
	if (!m || m[0] === undefined) throw new Error(`fixture に site-tagline が無い: ${relPath}`);
	return m[0];
}
function fixtureSpacers(relPath: string): string[] {
	const src = readFileSync(join(FIXTURES, relPath), 'utf8');
	return [...src.matchAll(/<div [^>]*class="wp-block-spacer"[^>]*><\/div>/g)].map((m) => m[0] ?? '');
}

const FOOTER_REGION = readFileSync(join(FIXTURES, 'regions/footer.html'), 'utf8');

describe('core/site-logo', () => {
	it('D2a-01: logoId=null(未設定)のとき出力は空文字', () => {
		// 検出対象: 未設定ロゴで余計なマークアップ(<a>/<img>/<div>)を出さないこと。
		// 想定Red理由: モジュール未存在でロード時 Red(ファイル全体)。実装後の想定: logoId null で空文字を返す。no-op stub でも Green になるため、この件単独では実装の正しさを担保しない。
		// 根拠: WP 7.1.3 wp-includes/blocks/site-logo.php で logo 未設定時は空を返す規則。
		expect(renderLogo({}, footerCtx({ logoId: null }))).toBe('');
	});

	it('D2a-02: logoId が数値(設定済み)のとき RangeError(D-2a 未対応・fail-closed)', () => {
		// 検出対象: 設定済みロゴを黙って無視せず、未対応として診断付きで落とすこと。
		// 想定Red理由: 実装後に数値 logoId を受理して出力すると RangeError が返らず toBeInstanceOf が失敗する(stub 観測: expected undefined to be an instance of RangeError)。
		const err = captureError(() => renderLogo({}, footerCtx({ logoId: 42 })));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2a-03: logoId 欠落(undefined)は未設定と区別し RangeError(fail-closed)', () => {
		// 検出対象: 未知情報を「未設定」と誤認して空出力にしないこと(§8.2 v3 omission 規則)。
		// 想定Red理由: 実装後に undefined を null 同様に空扱いすると RangeError が返らず toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => renderLogo({}, footerCtx({ logoId: undefined })));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2a-04: 未知の attrs を validateAttrs が RangeError で拒否する', () => {
		// 検出対象: 未対応属性(width など)の黙殺防止。
		// 想定Red理由: 実装後に未知属性を拒否しないと err が undefined となり toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => siteLogoRenderer.validateAttrs({ width: 100 }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2a-05: fixture の footer 領域に site-logo 要素が無く、描画結果も空文字', () => {
		// 検出対象: fixture に logo が無いのに描画が何かを出力すること(fixture 由来の確認)。
		// 想定Red理由: 実装後に footer で logo を出力すると toBe(空文字) が失敗する。no-op stub では空出力で Green になる(vacuous、D2a-02/03/04 と組で意味を持つ)。
		const hasLogo = elementsOf(FOOTER_REGION).some((e) =>
			(attrValue(e, 'class') ?? '').split(/\s+/).includes('wp-block-site-logo'),
		);
		expect(hasLogo).toBe(false);
		expect(renderLogo({}, footerCtx({ logoId: null }))).toBe('');
	});
});

describe('core/site-tagline', () => {
	it('D2a-06: fixture set-footer2 の site-tagline と normalizeHtml 一致(特殊文字を含む値)', () => {
		// 検出対象: テキストのエスケープ(&amp; &lt; &gt;)と <p class="wp-block-site-tagline"> の構造。
		// 入力値 'Tag line & <b>more</b>' は fixture の説明文(入力側)であり、期待 HTML は fixture から抜き出す。
		// 想定Red理由: モジュール未存在でロード時 Red(ファイル全体)。実装後の想定: fixture の特殊文字を含む tagline を normalizeHtml 比較で一致させる。stub では htmlEquals が false(stub 観測: expected false to be true)。
		const expected = fixtureTagline('set-footer2/footer.name-tagline-special.html');
		const out = renderTagline({}, footerCtx({ tagline: 'Tag line & <b>more</b>' }));
		expect(htmlEquals(out, expected)).toBe(true);
		expect(normalizeHtml(out)).toBe(normalizeHtml(expected));
	});

	it('D2a-07: tagline が空文字なら出力は空(何も描画しない)', () => {
		// 検出対象: 空タグラインで <p></p> を出さないこと。
		// 想定Red理由: 実装後に空 tagline で p 要素を出すと toBe(空文字) が失敗する。no-op stub でも Green(vacuous)。
		expect(renderTagline({}, footerCtx({ tagline: '' }))).toBe('');
	});

	it('D2a-08: tagline 欠落(undefined)は RangeError(fail-closed)', () => {
		// 検出対象: 未知の tagline を空扱いしないこと(§8.2 v3)。
		// 想定Red理由: 実装後に undefined tagline を空文字扱いすると RangeError が返らず toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => renderTagline({}, footerCtx({ tagline: undefined })));
		expect(err).toBeInstanceOf(RangeError);
	});

	it.each([['level'], ['textAlign']])('D2a-09: 未対応 attr %s を validateAttrs が RangeError で拒否する', (key) => {
		// 検出対象: site-tagline で受け付けない属性の黙殺防止。
		// 想定Red理由: 実装後に level/textAlign を拒否しないと err が undefined となり toBeInstanceOf が失敗する(stub 観測あり、level と textAlign の両件)。
		const err = captureError(() => siteTaglineRenderer.validateAttrs({ [key]: 2 }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2a-10: タグライン中の script / 引用符 / b はエスケープされ、DOM に要素・属性を追加しない', () => {
		// 検出対象: 注入による要素追加(script, b)と属性追加(onerror 等)、テキストの生 HTML 解釈。
		// 期待: 要素は p のみ、p の属性は class のみ、テキストは入力そのもの。
		// 想定Red理由: 実装後に tagline を未エスケープで出すと tagNames が ["p"] と一致せず失敗する(stub 観測: 要素 0 件 vs ["p"])。
		const value = '<script>alert(1)</script><b onclick="x">q"\'</b>';
		const out = renderTagline({}, footerCtx({ tagline: value }));
		const els = elementsOf(out);
		expect(els.map((e) => e.tagName)).toEqual(['p']);
		expect(attrNames(els[0] as El)).toEqual(['class']);
		expect(attrValue(els[0] as El, 'class')).toBe('wp-block-site-tagline');
		expect(textOf(els[0] as El)).toBe(value);
	});
});

describe('core/spacer', () => {
	it('D2a-11: fixture regions/footer.html の spacer(40, width:0px) と normalizeHtml 一致', () => {
		// 検出対象: preset 変数の展開 var:preset|spacing|40 → var(--wp--preset--spacing--40)、width 出力、aria-hidden、class。
		// 期待 HTML は fixture 1 件目(height 40 / width 0px)から抜き出す。
		// 想定Red理由: モジュール未存在でロード時 Red(ファイル全体)。実装後の想定: fixture の spacer(40, width 0px) と normalizeHtml 不一致なら失敗(stub 観測: htmlEquals false)。
		const expected = fixtureSpacers('regions/footer.html')[0] ?? '';
		expect(elementsOf(expected)).toHaveLength(1);
		const out = renderSpacer({ height: 'var:preset|spacing|40', width: '0px' });
		expect(htmlEquals(out, expected)).toBe(true);
	});

	it('D2a-12: fixture regions/footer.html の spacer(70, width 省略) と normalizeHtml 一致', () => {
		// 検出対象: width 未指定時に width を出力しないこと。
		// 期待 HTML は fixture 2 件目(height 70 のみ)から抜き出す。
		// 想定Red理由: 実装後に fixture の spacer(70, width 省略) と normalizeHtml 不一致なら失敗(stub 観測: htmlEquals false)。
		const expected = fixtureSpacers('regions/footer.html')[1] ?? '';
		const out = renderSpacer({ height: 'var:preset|spacing|70' });
		expect(htmlEquals(out, expected)).toBe(true);
		const els = elementsOf(out);
		expect(els).toHaveLength(1);
		const style = attrValue(els[0] as El, 'style') ?? '';
		const props = style.split(';').map((d) => (d.split(':')[0] ?? '').trim());
		expect(props).toEqual(['height']);
	});

	it('D2a-13: 出力は div 1 要素のみ、class は wp-block-spacer、aria-hidden="true"、子ノード無し', () => {
		// 検出対象: 余計な子要素・テキスト、aria-hidden の欠落、class の欠落。
		// 根拠: WP 7.1.3 wp-includes/blocks/spacer.php の規則(装飾用の空 div)。
		// 想定Red理由: 実装後に div 以外の構造・class 違い・子ノードがあると tagNames や属性の検査が失敗する(stub 観測: 要素 0 件 vs ["div"])。
		const out = renderSpacer({ height: '100px' });
		const els = elementsOf(out);
		expect(els.map((e) => e.tagName)).toEqual(['div']);
		const div = els[0] as El;
		expect(attrValue(div, 'class')).toBe('wp-block-spacer');
		expect(attrValue(div, 'aria-hidden')).toBe('true');
		expect(div.childNodes.length).toBe(0);
	});

	it('D2a-14: 長さ指定 100px は preset 変換せずそのまま style に出る', () => {
		// 検出対象: 長さ値の不正な変換(var() 化の誤適用)。
		// 根拠: WP 7.1.3 wp-includes/blocks/spacer.php の規則(長さ値は style にそのまま出力)。
		// 想定Red理由: 実装後に 100px を preset 変換したり style を欠落させると失敗する(stub 観測: 要素 0 件で length 0)。
		const els = elementsOf(renderSpacer({ height: '100px' }));
		expect(els).toHaveLength(1);
		expect(attrValue(els[0] as El, 'style')).toBe('height:100px');
	});

	it.each([
		['セミコロン注入', '100px;background:red'],
		['二重引用符', '100px"'],
		['山括弧', '<b>1px</b>'],
		['url() 注入', 'url(x)'],
	])('D2a-15: height に %s があると RangeError', (_label, height) => {
		// 検出対象: style 属性の注入・HTML 注入の拒否(fail-closed)。
		// 想定Red理由: 実装後に height のセミコロン等を拒否しないと err が undefined となり toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => renderSpacer({ height }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it.each([
		['負値', '-10px'],
		['単位なし数値', '100'],
		['空文字', ''],
	])('D2a-16: height が %s のとき RangeError', (_label, height) => {
		// 検出対象: 不正な長さ値の拒否。
		// 想定Red理由: 実装後に負値・単位なし・空文字を拒否しないと err が undefined となり toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => renderSpacer({ height }));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2a-17: height 欠落は RangeError(TypeError ではない)', () => {
		// 検出対象: 必須 height 欠落時に型エラー(TypeError)で落ちるのではなく診断用 RangeError になること。
		// 想定Red理由: 実装後に height 欠落で TypeError を投げると not.toBeInstanceOf(TypeError) が失敗する。RangeError を返さない場合も toBeInstanceOf が失敗する。
		const err = captureError(() => renderSpacer({}));
		expect(err).toBeInstanceOf(RangeError);
		expect(err).not.toBeInstanceOf(TypeError);
	});

	it('D2a-18: height が文字列でない(数値)とき RangeError', () => {
		// 検出対象: 型違い入力の拒否。TypeError ではなく RangeError で落ちること。
		// 想定Red理由: 実装後に数値 height を拒否しないと err が undefined となり toBeInstanceOf が失敗する(stub 観測あり)。
		const err = captureError(() => renderSpacer({ height: 100 }));
		expect(err).toBeInstanceOf(RangeError);
	});
});

describe('footer 葉ブロック: fail-closed omission(§8.4 D)', () => {
	it('D2a-19: tagline と logoId が両方欠落なら、logo も tagline も RangeError', () => {
		// 検出対象: 両方の未知情報を黙って空扱いしないこと。
		// 想定Red理由: 実装後に logoId と tagline の両方が欠落しても片方しか RangeError にしないと、もう片方の toBeInstanceOf が失敗する(stub 観測あり)。
		const ctx = footerCtx({});
		expect(captureError(() => renderLogo({}, ctx))).toBeInstanceOf(RangeError);
		expect(captureError(() => renderTagline({}, ctx))).toBeInstanceOf(RangeError);
	});

	it('D2a-20: logoId 欠落のみ(tagline は設定済み)なら logo は RangeError、tagline は正常描画', () => {
		// 検出対象: 片方の欠落が他方の判定に波及しない(独立に fail-closed)こと。
		// 想定Red理由: 実装後に logoId 欠落が tagline 側の判定まで波及すると tagNames や class の検査が失敗する。logo 側は undefined が RangeError にならず失敗する(stub 観測あり)。
		const ctx = footerCtx({ tagline: 'x' });
		expect(captureError(() => renderLogo({}, ctx))).toBeInstanceOf(RangeError);
		const html = renderTagline({}, ctx);
		expect(tagNames(html)).toEqual(['p']);
		const els = elementsOf(html);
		expect(attrValue(els[0] as El, 'class')).toBe('wp-block-site-tagline');
	});
});

// STEP6 で追加(mutation 生存の補強)。
describe('D-2a 補強(mutation 対策)', () => {
	it('D2a-21: tagline の実体参照風テキスト(&lt;)は二重解釈されず文字列のまま残る', () => {
		// 検出対象: & のエスケープ欠落(出力 DOM のテキストが '<' に化ける)。
		const out = renderTagline({}, footerCtx({ tagline: 'a &lt; b &amp; c' }));
		const els = elementsOf(out);
		expect(textOf(els[0] as El)).toBe('a &lt; b &amp; c');
	});

	it.each([
		['前置きの付いた preset', 'xvar:preset|spacing|40'],
		['後置きの付いた preset', 'var:preset|spacing|40;color:red'],
		['単位のみ', 'px'],
		['単位の後ろに余分', '10pxx'],
		['単位の後ろに宣言', '10px;color:red'],
		['先頭に余分', 'a10px'],
		['calc', 'calc(1px)'],
	])('D2a-22: spacer の height 厳密一致 (%s) は RangeError', (_label, value) => {
		// 検出対象: 正規表現の前方/後方アンカー欠落、数字部の必須性欠落。
		expect(captureError(() => renderSpacer({ height: value }))).toBeInstanceOf(RangeError);
	});

	it('D2a-23: spacer の width にも同じ検証が掛かる(不正 width は RangeError)', () => {
		expect(captureError(() => renderSpacer({ height: '10px', width: '1;x' }))).toBeInstanceOf(RangeError);
	});
});
