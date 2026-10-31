// SPDX-License-Identifier: GPL-3.0-only
// D-2c: テーマ(PHP 展開後)由来の core/paragraph レンダラ './paragraphBlock.js' のテスト。
// 実装は未作成のため、static import の解決失敗でファイル全体がロード時に Red になる想定
// (assertion-level Red ではない)。
// 期待値は fixtures/ref/regions/footer.html から抜き出す(ハードコード禁止)。比較は htmlEquals で行う。
// 手書きの期待値は WP 7.1.3 wp-includes/blocks/paragraph の規則に基づく(未照合。各 it のコメントに明記)。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { paragraphRenderer } from './paragraphBlock.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock, renderBlocks } from './renderBlocks.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);
const ctx = { global: cfg, renderState: { modalCounter: 0 } };

// validateAttrs と render の両方を通す(footerLeaf.test.ts と同じ読み方)
const renderPara = (
	attrs: Record<string, unknown>,
	innerHTML: string,
	innerBlocks: ParsedBlock[] = [],
): string => {
	paragraphRenderer.validateAttrs(attrs);
	const block: ParsedBlock = {
		blockName: 'core/paragraph',
		attrs,
		innerBlocks,
		innerHTML,
		innerContent: [innerHTML],
	};
	return paragraphRenderer.render(block, ctx as unknown as RenderCtx, () => '');
};

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

// 出力を parse5 でパースし、要素を深さ優先で列挙する
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
const attrValue = (el: El, name: string): string | undefined =>
	el.attrs.find((a) => a.name === name)?.value;

function textOf(n: Node): string {
	if (n.nodeName === '#text') return (n as DefaultTreeAdapterMap['textNode']).value;
	const kids = (n as El).childNodes as Node[] | undefined;
	return kids ? kids.map(textOf).join('') : '';
}
const fullText = (html: string): string =>
	parseFragment(html).childNodes.map((n) => textOf(n as Node)).join('');

// 出力の最初の要素(外殻 p)の class トークンを昇順で返す
const classesOf = (html: string): string[] => {
	const el = elementsOf(html)[0];
	const cls = el ? (attrValue(el, 'class') ?? '') : '';
	return cls.split(/\s+/).filter((c) => c !== '').sort();
};

// p の子孫に p があるか(parse5 は p 内の p を自動で閉じるため、件数判定と併用する)
function containsP(el: El): boolean {
	return (el.childNodes as Node[]).some((c) => {
		if (c.nodeName.startsWith('#')) return false;
		const child = c as El;
		return child.tagName === 'p' || containsP(child);
	});
}

// fixture 由来の抜き出し(非貪欲正規表現)。期待値をコードに直書きしない。
const FOOTER_HTML = readFileSync(join(FIXTURES, 'regions/footer.html'), 'utf8');
const FIXTURE_P_RE = /<p class="has-small-font-size wp-block-paragraph">[\s\S]*?<\/p>/g;
const fixtureParagraphs = (): string[] => FOOTER_HTML.match(FIXTURE_P_RE) ?? [];

// 投稿由来・テーマ由来で共通に使う入力(属性と内側 HTML の正規化は実装側の責務)
const SMALL_PLAIN = '<p class="has-small-font-size">Twenty Twenty-Five</p>';
const SMALL_FOOTER =
	'<p class="has-small-font-size">\n\t\t\t\tDesigned with <a href="https://wordpress.org" rel="nofollow">WordPress</a>\t\t\t</p>';

// 危険入力: script、on* 属性、javascript:/data: の href、onerror 付き img
const DANGEROUS =
	'<p class="has-small-font-size">Safe text <script>alert(1)</script>' +
	'<a href="javascript:alert(1)" onclick="alert(1)">bad</a> ' +
	'<img src="x" onerror="alert(1)"> ' +
	'<a href="data:text/html,<script>alert(1)</script>">d</a> ' +
	'<a href="https://wordpress.org" rel="nofollow">WordPress</a></p>';

describe('D-2c paragraphBlock (テーマ由来 core/paragraph)', () => {
	it('D2c-01 基準一致: fixtures の footer 由来 p 2 件と htmlEquals で一致し、a の href/rel を保持する', () => {
		// 期待値: fixtures/ref/regions/footer.html から非貪欲正規表現で 2 件抜き出す。
		// 出典: WP 7.1.3 wp-includes/blocks/paragraph の規則(未照合)。外殻 p に
		//   has-<slug>-font-size と wp-block-paragraph を付与する。
		// 検出対象: 属性導出の欠落、内側 HTML の欠落、<a rel="nofollow"> の消失。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const [e1, e2] = fixtureParagraphs();
		expect(fixtureParagraphs()).toHaveLength(2);
		const out1 = renderPara({ fontSize: 'small' }, SMALL_PLAIN);
		const out2 = renderPara({ fontSize: 'small' }, SMALL_FOOTER);
		expect(htmlEquals(out1, e1 ?? '')).toBe(true);
		expect(htmlEquals(out2, e2 ?? '')).toBe(true);
		const a = elementsOf(out2).find((e) => e.tagName === 'a');
		expect(a).toBeDefined();
		expect(attrValue(a as El, 'href')).toBe('https://wordpress.org');
		expect(attrValue(a as El, 'rel')).toBe('nofollow');
	});

	it('D2c-02 fontSize 未指定は wp-block-paragraph のみ、large は has-large-font-size になる', () => {
		// 出典: WP 7.1.3 wp-includes/blocks/paragraph の規則(未照合)。fontSize 無しは
		//   プリセット class を付けない。
		// 検出対象: 未指定時に余計な has-*-font-size が付く、または large の slug 導出ミス。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const none = renderPara({}, '<p>Hello</p>');
		expect(classesOf(none)).toEqual(['wp-block-paragraph']);
		const large = renderPara({ fontSize: 'large' }, '<p>Big</p>');
		expect(classesOf(large)).toEqual(['has-large-font-size', 'wp-block-paragraph'].sort());
	});

	it('D2c-03 属性導出の独立検査(§8.4 B): 保存 HTML の class は使わず attrs.fontSize から導出する', () => {
		// 入力: innerHTML の class は has-small-font-size のまま、attrs.fontSize だけ large。
		// 期待: 出力は has-large-font-size のみ。small が残れば保存 HTML の class をコピーしている。
		// 出典: WP 7.1.3 wp-includes/blocks/paragraph の規則(未照合)。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const out = renderPara({ fontSize: 'large' }, SMALL_PLAIN);
		const cls = classesOf(out);
		expect(cls).toEqual(['has-large-font-size', 'wp-block-paragraph'].sort());
		expect(cls).not.toContain('has-small-font-size');
	});

	it.each(['a b', '"', '<', '', 5])(
		'D2c-04 不正 slug は RangeError (fontSize=%s)',
		(slug) => {
			// 出典: 委任仕様の入力検証(WP 7.1.3 の規則ではない。未照合)。slug は ^[a-z0-9]+(?:-[a-z0-9]+)*$ に限る。
			// 検出対象: 不正 slug を class に連結してしまう(属性インジェクションの入口)。
			// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
			const err = captureError(() =>
				renderPara({ fontSize: slug as unknown as string }, SMALL_PLAIN),
			);
			expect(err).toBeInstanceOf(RangeError);
		},
	);

	it.each([
		{ fontSize: 'small', align: 'center' },
		{ fontSize: 'small', style: {} },
		{ fontSize: 'small', dropCap: true },
	])('D2c-05 許可外 attrs は RangeError (%j)', (attrs) => {
		// 出典: 委任仕様の入力検証(WP 7.1.3 の規則ではない。未照合)。許可は fontSize のみ。align/style/dropCap は保存時に
		//   テーマ由来 paragraph が扱わない前提として拒否する。
		// 検出対象: 許可外キーを黙って無視または class に反映する。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const err = captureError(() => renderPara(attrs, SMALL_PLAIN));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2c-06 子ブロックを持つ paragraph は RangeError', () => {
		// 出典: 委任仕様の入力検証(WP 7.1.3 の規則ではない。未照合)。core/paragraph は innerBlocks を持たない。
		// 検出対象: 子ブロックを黙って捨てる(内容欠落)。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const child: ParsedBlock = {
			blockName: 'core/image',
			attrs: null,
			innerBlocks: [],
			innerHTML: '',
			innerContent: [],
		};
		const err = captureError(() => renderPara({ fontSize: 'small' }, SMALL_PLAIN, [child]));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2c-07 サニタイズ(§8.4 C・除去方針): 危険要素・属性・URL を除去し安全な本文と正規の a は残す', () => {
		// 入力: DANGEROUS (script、on* 属性、javascript:/data: href、onerror 付き img を含む)。
		// 期待: 例外にならず正常終了。出力に script、on* 属性、javascript:/data: の href が無い。
		//   script の中身 alert(1) はテキストとしても残らない。
		//   "Safe text" と href=https://wordpress.org rel=nofollow の a は残る。
		// 出典: 委任仕様の除去方針(WP 7.1.3 の規則ではない。未照合)。
		// 検出対象: 危険部分の除去漏れ、または安全部分の過剰除去。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		const out = renderPara({ fontSize: 'small' }, DANGEROUS);
		const els = elementsOf(out);
		expect(tagNames(out)).not.toContain('script');
		expect(els.flatMap(attrNames).filter((n) => n.startsWith('on'))).toEqual([]);
		const hrefs = els.filter((e) => e.tagName === 'a').map((e) => attrValue(e, 'href') ?? '');
		expect(hrefs.filter((h) => /^\s*(javascript|data):/i.test(h))).toEqual([]);
		const text = fullText(out);
		expect(text).toContain('Safe text');
		expect(text).not.toContain('alert(1)');
		const good = els.find((e) => e.tagName === 'a' && attrValue(e, 'href') === 'https://wordpress.org');
		expect(good).toBeDefined();
		expect(attrValue(good as El, 'rel')).toBe('nofollow');
	});

	it('D2c-08 入口の分離(既存回帰・開始時 Green): 投稿由来 renderBlocks に同じ危険入力を渡しても除去される', () => {
		// 既存回帰。renderBlocks は既存関数で、本件では変更しない。開始時点から Green で良い。
		// 入力: 同じ DANGEROUS を wp:paragraph の innerHTML として渡す。
		// 検出対象: 投稿由来経路でサニタイズが外れること(テーマ由来の実装変更による回帰)。
		const post = `<!-- wp:paragraph {"fontSize":"small"} -->${DANGEROUS}<!-- /wp:paragraph -->`;
		const out = renderBlocks(post);
		expect(tagNames(out)).not.toContain('script');
		const els = elementsOf(out);
		expect(els.flatMap(attrNames).filter((n) => n.startsWith('on'))).toEqual([]);
		const hrefs = els.filter((e) => e.tagName === 'a').map((e) => attrValue(e, 'href') ?? '');
		expect(hrefs.filter((h) => /^\s*(javascript|data):/i.test(h))).toEqual([]);
		expect(fullText(out)).not.toContain('alert(1)');
		// 正の錨: 空出力では通らないよう、安全な本文と正規の a を必ず残す
		expect(fullText(out)).toContain('Safe text');
		const good = elementsOf(out).find(
			(e) => e.tagName === 'a' && attrValue(e, 'href') === 'https://wordpress.org',
		);
		expect(good).toBeDefined();
		expect(attrValue(good as El, 'rel')).toBe('nofollow');
	});

	it('D2c-09 外殻 p を落とし忘れない: 出力に p が 1 件のみで、p の中に p が無い', () => {
		// 検出対象: innerHTML の外殻 <p> を剥がさず二重に p を出す(parse5 は p 内 p を自動で閉じるため、
		//   件数判定を主とし、子孫判定を補助とする)。
		// 出典: WP 7.1.3 wp-includes/blocks/paragraph の規則(未照合)。
		// 想定Red: paragraphBlock.js 未作成のため collection 失敗。
		for (const inner of [SMALL_PLAIN, SMALL_FOOTER]) {
			const out = renderPara({ fontSize: 'small' }, inner);
			const ps = elementsOf(out).filter((e) => e.tagName === 'p');
			expect(ps).toHaveLength(1);
			expect(ps.some(containsP)).toBe(false);
		}
	});
});

// STEP6 で追加(mutation 生存の補強)。
describe('D-2c 補強: 外殻 p の厳格確認', () => {
	it.each([
		['外殻が div', '<div>x</div>'],
		['外殻が無いテキスト', 'plain text'],
		['p が複数並ぶ', '<p>a</p><p>b</p>'],
		['p の後ろに別要素', '<p>a</p><span>b</span>'],
		['前に別要素', '<span>b</span><p>a</p>'],
	])('D2c-10 %s は RangeError(最外が単一の p でない保存 HTML を黙って連結しない)', (_label, html) => {
		// 検出対象: 外殻 p 検査(正規表現側 / parse5 側)の欠落。
		const err = captureError(() => renderPara({ fontSize: 'small' }, html));
		expect(err).toBeInstanceOf(RangeError);
	});
});
