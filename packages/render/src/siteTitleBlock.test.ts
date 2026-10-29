// SPDX-License-Identifier: GPL-3.0-only
// D-1c core/site-title のテスト。実装 './siteTitleBlock.js' は未作成のため、static import の解決失敗でファイル全体がロード時に Red になる想定。
// 期待値は fixtures の HTML から抜き出す(ハードコード禁止)。比較は normalizeHtml で行い、属性順や parse5 の正規化差を無視する。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { siteTitleRenderer } from './siteTitleBlock.js';
import { normalizeHtml } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import type { ParsedBlock } from './renderBlocks.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

// D-1c で RenderCtx に site / page が追加される前提の拡張型(テスト専用)
type SiteCtx = RenderCtx & {
	site: { name: string; url: string };
	page: { isHome: boolean; isSingular: boolean };
};
const baseCtx = { global: cfg, renderState: { modalCounter: 0 } };
const makeCtx = (name: string, url: string, isHome = false): SiteCtx => ({
	...baseCtx,
	site: { name, url },
	page: { isHome, isSingular: !isHome },
});

// validateAttrs と render の両方を通す(groupBlock.test.ts と同じ読み方)
function renderSiteTitle(attrs: Record<string, unknown>, ctx: SiteCtx): string {
	siteTitleRenderer.validateAttrs(attrs);
	const block: ParsedBlock = { blockName: 'core/site-title', attrs, innerBlocks: [], innerHTML: '', innerContent: [] };
	return siteTitleRenderer.render(block, ctx, () => '');
}

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
const findA = (html: string): El | undefined => elementsOf(html).find((e) => e.tagName === 'a');
const attrNames = (el: El): string[] => el.attrs.map((a) => a.name);
const attrValue = (el: El, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value;

function textOf(n: Node): string {
	if (n.nodeName === '#text') return (n as DefaultTreeAdapterMap['textNode']).value;
	const kids = (n as El).childNodes as Node[] | undefined;
	return kids ? kids.map(textOf).join('') : '';
}

// fixture から site-title の <p>…</p> を正規表現で抜き出し、name / url も取り出す
const SITE_TITLE_RE = /<p class="wp-block-site-title">[\s\S]*?<\/p>/;
function fixtureSiteTitle(relPath: string): { html: string; name: string; url: string } {
	const src = readFileSync(join(FIXTURES, relPath), 'utf8');
	const m = SITE_TITLE_RE.exec(src);
	if (!m) throw new Error(`fixture に site-title が無い: ${relPath}`);
	const html = m[0];
	const url = /<a href="([^"]*)"/.exec(html)?.[1];
	const name = />([^<]*)<\/a>/.exec(html)?.[1];
	if (url === undefined || name === undefined) throw new Error(`fixture の a 要素を解析できない: ${relPath}`);
	return { html, name, url };
}

describe('core/site-title: fixture(regions/header.html / single 由来)との比較', () => {
	it('isHome=false で fixture の <p class="wp-block-site-title"> と normalizeHtml 一致し、aria-current を付けない', () => {
		// 検出対象: 出力タグ(p)・a の href/target/rel・テキスト名・home 判定による aria-current の付与有無。
		// 想定Red理由: './siteTitleBlock.js' 未存在のため import 解決に失敗し、ファイル全体がロードできない。
		const fx = fixtureSiteTitle('regions/header.html');
		expect(fx.name).toBe('wpref');
		const out = renderSiteTitle({ level: 0 }, makeCtx(fx.name, fx.url, false));
		expect(normalizeHtml(out)).toBe(normalizeHtml(fx.html));
		expect(out).not.toContain('aria-current');
	});
});

describe('core/site-title: fixture(set-header2 / ホーム由来)との比較', () => {
	// ホーム(page.isHome=true)の時だけ <a> に aria-current="page" が付くことを、2 つの fixture で確認する。
	it.each([
		'set-header2/header.navB-newer-draft-ignored.html',
		'set-header2/header.pages-protected-and-draft.html',
	])('%s の site-title と normalizeHtml 一致し、aria-current="page" を含む', (relPath) => {
		// 検出対象: isHome=true 時の aria-current 付与、a の属性全体、テキスト名。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const fx = fixtureSiteTitle(relPath);
		expect(fx.html).toContain('aria-current="page"');
		const out = renderSiteTitle({ level: 0 }, makeCtx(fx.name, fx.url, true));
		expect(normalizeHtml(out)).toBe(normalizeHtml(fx.html));
	});
});

describe('core/site-title: 別の name/url での手書き期待(過適合防止)', () => {
	it('特殊文字を含む name と & を含む url を、手書きのエスケープ後 HTML と一致させる', () => {
		// 検出対象: テキストのエスケープ(& < > " ')、href の属性エスケープ(&)、isHome=false 時の既定 target/rel。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const name = `Foo & <Bar> "Q" 'S'`;
		const url = 'https://example.test/blog?x=1&y=2';
		const expected =
			'<p class="wp-block-site-title"><a href="https://example.test/blog?x=1&amp;y=2" target="_self" rel="home">Foo &amp; &lt;Bar&gt; "Q" \'S\'</a></p>';
		const out = renderSiteTitle({ level: 0 }, makeCtx(name, url, false));
		expect(normalizeHtml(out)).toBe(normalizeHtml(expected));
	});

	it('isHome=true 時、別の url でも a に aria-current="page" が付き、href は site.url と一致する', () => {
		// 検出対象: home 判定が url に依存せず page.isHome のみで決まること、href が site.url をそのまま保持すること。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const url = 'https://another.example.test/';
		const out = renderSiteTitle({ level: 0 }, makeCtx('Another Site', url, true));
		const a = findA(out);
		expect(a).toBeDefined();
		expect(attrValue(a as El, 'href')).toBe(url);
		expect(attrValue(a as El, 'aria-current')).toBe('page');
	});
});

describe('core/site-title: level による要素切り替え', () => {
	it.each([1, 2, 3, 4, 5, 6])('level=%i で h%i.wp-block-site-title を出力する', (level) => {
		// 検出対象: level 1〜6 の見出しタグへの対応(WP 既定と一致)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle({ level }, makeCtx('Site', 'https://example.test/', false));
		expect(tagNames(out)[0]).toBe(`h${level}`);
		expect(attrValue(elementsOf(out)[0] as El, 'class')).toBe('wp-block-site-title');
	});

	it('level=0 は p.wp-block-site-title を出力する', () => {
		// 検出対象: level=0 の段落タグ切り替え。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle({ level: 0 }, makeCtx('Site', 'https://example.test/', false));
		expect(tagNames(out)[0]).toBe('p');
	});

	it('level 未指定は WP 既定の level=1 として h1 を出力する', () => {
		// 検出対象: 既定 level の扱い(未指定で p ではなく h1 になること)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle({}, makeCtx('Site', 'https://example.test/', false));
		expect(tagNames(out)[0]).toBe('h1');
	});
});

describe('core/site-title: isLink / linkTarget', () => {
	it('isLink=false のとき a 要素を含まず、テキストのみを出力する', () => {
		// 検出対象: isLink=false での a 省略と、テキストだけの出力。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle({ level: 0, isLink: false }, makeCtx('Plain Name', 'https://example.test/', false));
		expect(tagNames(out)).not.toContain('a');
		expect(normalizeHtml(out)).toBe(normalizeHtml('<p class="wp-block-site-title">Plain Name</p>'));
	});

	it('linkTarget="_blank" のとき a の target が _blank になる', () => {
		// 検出対象: linkTarget の反映(既定 _self からの切り替え)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle(
			{ level: 0, linkTarget: '_blank' },
			makeCtx('Site', 'https://example.test/', false),
		);
		expect(attrValue(findA(out) as El, 'target')).toBe('_blank');
	});

	it('linkTarget 未指定の既定では a の target が _self になる', () => {
		// 検出対象: 既定の target 値。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const out = renderSiteTitle({ level: 0 }, makeCtx('Site', 'https://example.test/', false));
		expect(attrValue(findA(out) as El, 'target')).toBe('_self');
	});
});

describe('core/site-title: 負例(インジェクション・URL 検証)', () => {
	it('name に含まれる script/img タグが実行可能な要素として出力されない', () => {
		// 検出対象: name のテキストエスケープ漏れ(script 要素・onerror 付き img の生成)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const name = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
		const out = renderSiteTitle({ level: 0 }, makeCtx(name, 'https://example.test/', false));
		const tags = tagNames(out);
		expect(tags).not.toContain('script');
		expect(tags).not.toContain('img');
		expect(tags).toEqual(['p', 'a']);
		expect(elementsOf(out).find((e) => e.tagName === 'a')).toBeDefined();
		expect(textOf(parseFragment(out))).toBe(name);
	});

	it('site.url に属性脱出を狙う文字列を含めても、onmouseover などの属性が生成されない', () => {
		// 検出対象: href の属性エスケープ漏れ(" で閉じて onmouseover を注入されるケース)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		// 補足: 実装が RangeError で拒否するのも許容する(その場合は RangeError であることを確認する)。
		const url = 'https://example.test/" onmouseover="x';
		const err = captureError(() => renderSiteTitle({ level: 0 }, makeCtx('Site', url, false)));
		if (err !== undefined) {
			expect(err).toBeInstanceOf(RangeError);
			return;
		}
		const out = renderSiteTitle({ level: 0 }, makeCtx('Site', url, false));
		for (const el of elementsOf(out)) {
			expect(attrNames(el)).not.toContain('onmouseover');
		}
		expect(attrValue(findA(out) as El, 'href')).toBe(url);
	});

	it.each([
		'javascript:alert(1)',
		'JAVASCRIPT:alert(1)',
		'data:text/html,<script>alert(1)</script>',
	])('site.url=%s は RangeError になる', (url) => {
		// 検出対象: http/https 以外のスキーム(javascript:, data:)の拒否。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const err = captureError(() => renderSiteTitle({ level: 0 }, makeCtx('Site', url, false)));
		expect(err).toBeInstanceOf(RangeError);
	});

	it.each([{ level: 7 }, { level: -1 }, { level: 1.5 }, { level: '2' }])(
		'属性 %o は RangeError になる',
		(attrs) => {
			// 検出対象: level の範囲(1〜6 かつ整数)と型(number 以外)の検証。
			// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
			const err = captureError(() => renderSiteTitle(attrs, makeCtx('Site', 'https://example.test/', false)));
			expect(err).toBeInstanceOf(RangeError);
		},
	);

	it('linkTarget="_top" は RangeError になる(許可は _self と _blank のみ)', () => {
		// 検出対象: linkTarget の許可値リストの検証。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const err = captureError(() =>
			renderSiteTitle({ level: 0, linkTarget: '_top' }, makeCtx('Site', 'https://example.test/', false)),
		);
		expect(err).toBeInstanceOf(RangeError);
	});

	it('isLink が文字列 "true" のとき RangeError になる(真偽値のみ許可)', () => {
		// 検出対象: isLink の型検証(文字列の真偽値を黙って受け入れないこと)。
		// 想定Red理由: モジュール未存在のため、ファイル全体がロード時に失敗する。
		const err = captureError(() =>
			renderSiteTitle({ level: 0, isLink: 'true' }, makeCtx('Site', 'https://example.test/', false)),
		);
		expect(err).toBeInstanceOf(RangeError);
	});
});

describe('core/site-title: アンパサンドの二重解釈防止', () => {
	it('名前に含まれる実体参照風の文字列は、そのままテキストとして出る(& を & として退避する)', () => {
		// 検出対象: テキストの & 未エスケープ(&lt;b&gt; がタグ文字として再解釈される)。
		const out = renderSiteTitle({ level: 0, isLink: false }, makeCtx('&lt;b&gt;', 'https://example.test/', false));
		expect(out).toContain('&amp;lt;b&amp;gt;');
	});

	it('href の & は &amp; として出る', () => {
		// 検出対象: 属性値の & 未エスケープ。
		const out = renderSiteTitle({ level: 0 }, makeCtx('x', 'https://example.test/?a=1&b=2', false));
		expect(out).toContain('href="https://example.test/?a=1&amp;b=2"');
	});
});
