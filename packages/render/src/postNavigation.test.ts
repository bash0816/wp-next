// SPDX-License-Identifier: GPL-3.0-only
// D-3e STEP4-render: core/post-navigation-link のレンダリングと、twentytwentyfive/post-navigation パターン全体のテスト。test_id は D3e-10 〜。
// 期待値はすべて fixtures/ref の HTML から抽出する(ハードコードしない。ただし DB タイトルの期待文字列のみ仕様どおり明記)。
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { parseFragment } from 'parse5';
import { makeQueriesPort, openCurrentPost } from '@wpn/db';
import type { ContentPort, PostCtx } from '@wpn/core/ports';
import { applyS1, openDumpDb } from '@wpn/db/testing';
import { describe, expect, it, vi } from 'vitest';
import { createPostRegistry, type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock } from './renderBlocks.js';
import { expandPatterns, type ThemeFiles } from './templateResolve.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

const realTheme: ThemeFiles = {
	read(relPath: string): string | undefined {
		const p = join(THEME_DIR, relPath);
		return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
	},
};

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

// startMarker で始まる <div> を開始位置から、対応する </div> まで(深さカウント)で切り出す。
function extractDiv(html: string, startMarker: string): string {
	const start = html.indexOf(startMarker);
	if (start < 0) throw new Error(`marker not found: ${startMarker}`);
	const re = /<div\b|<\/div>/g;
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		depth += m[0] === '</div>' ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	throw new Error(`unclosed div after marker: ${startMarker}`);
}

// S0 (openDumpDb のみ) / S1 (applyS1) の post 5 (spike-blocks) を使う ctx を作る。
function makeCtx(db: DatabaseSync): RenderCtx {
	const current = openCurrentPost(db, { slug: 'spike-blocks' });
	if (!current) throw new Error('spike-blocks post not found');
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		post: current.post,
		content: current.content,
		queries: makeQueriesPort(db),
	} as unknown as RenderCtx;
}

// 単一の wp:post-navigation-link ブロックを、テーマ登録済みのレジストリで描画する。
function renderLinkBlock(attrsJson: string, ctx: RenderCtx): string {
	const markup = `<!-- wp:post-navigation-link ${attrsJson} /-->`;
	return renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

function renderPattern(ctx: RenderCtx): string {
	const markup = expandPatterns('<!-- wp:pattern {"slug":"twentytwentyfive/post-navigation"} /-->', realTheme);
	return renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

// DOM を parse5 で走査し、要素名と子ノード種別を集める補助。
type P5Node = { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: P5Node[] };
function walk(node: P5Node, visit: (n: P5Node) => void): void {
	visit(node);
	for (const c of node.childNodes ?? []) walk(c, visit);
}

describe('D3e-10: post-navigation-link(previous/next)を S0 で描画すると main-01 の 2 つの div と一致する', () => {
	// D3e-10 (Red予測): packages/render/src/postNavigation.ts が未存在のため収集失敗。
	// 実装後の想定: adjacent() が S0 では DB 側 UnsupportedDataError を投げうる(postData.ts の adjacent は未対応)ため、
	// adjacent 実装(別担当 packages/db/src/adjacent.test.ts の対象)が入るまで失敗する見込み。
	const MAIN01 = 'regions/main-01.html';

	it('D3e-10a: previous ブロックの描画結果が main-01.html の post-navigation-link-previous div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const actual = renderLinkBlock('{"type":"previous","showTitle":true,"arrow":"arrow"}', makeCtx(db));
			const expected = extractDiv(fixture(MAIN01), '<div class="post-navigation-link-previous');
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3e-10b: next ブロック(type 省略)の描画結果が main-01.html の post-navigation-link-next div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const actual = renderLinkBlock('{"showTitle":true,"arrow":"arrow"}', makeCtx(db));
			const expected = extractDiv(fixture(MAIN01), '<div class="post-navigation-link-next');
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3e-10c: next のタイトルは DOM 上 1 つのテキストノードで、要素ノード「特殊」を作らない', () => {
		const db = openDumpDb();
		try {
			const actual = renderLinkBlock('{"showTitle":true,"arrow":"arrow"}', makeCtx(db));
			const frag = parseFragment(actual) as unknown as P5Node;
			const names: string[] = [];
			walk(frag, (n) => names.push(n.nodeName));
			// 要素ノードは div / span / a のみ(特殊 は要素にならない)
			expect(names).not.toContain('特殊');
			const anchor = findFirst(frag, 'a');
			expect(anchor).toBeDefined();
			const textNodes = (anchor?.childNodes ?? []).filter((c) => c.nodeName === '#text');
			expect(textNodes.length).toBe(1);
			expect(textNodes[0]?.value).toBe('入れ子 & <特殊> “文字”');
		} finally {
			db.close();
		}
	});
});

function findFirst(node: P5Node, name: string): P5Node | undefined {
	let found: P5Node | undefined;
	walk(node, (n) => {
		if (found === undefined && n.nodeName === name) found = n;
	});
	return found;
}

const GROUP_MARKER = '<div class="wp-block-group alignwide is-layout-flow wp-block-group-is-layout-flow" style="margin-top';
const PREV_ATTRS = '{"type":"previous","showTitle":true,"arrow":"arrow"}';
const NEXT_ATTRS = '{"showTitle":true,"arrow":"arrow"}';

// 任意の adjacent 実装を持つ ContentPort スタブ(DB 不要)。
function stubContent(adjacent: ContentPort['adjacent']): ContentPort {
	return {
		terms: () => [],
		adjacent,
		commentsState: () => 'unsupported',
		hasThumbnail: () => false,
		author: () => null,
	};
}

const STUB_POST = {
	id: 7,
	title: 'T',
	url: 'http://127.0.0.1:8080/t/',
	protected: false,
	className: '',
	dateIso: '2026-10-27T23:38:31+00:00',
	dateText: 'October 27, 2026',
} as PostCtx;

function stubCtx(content: ContentPort | undefined, post: PostCtx | undefined): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		post,
		content,
		queries: undefined,
	} as unknown as RenderCtx;
}

function prevCtx(title: string, url = 'http://127.0.0.1:8080/x/'): RenderCtx {
	return stubCtx(
		stubContent(() => ({ title, url })),
		STUB_POST,
	);
}

describe('D3e-11: twentytwentyfive/post-navigation パターン全体が main-01 / set-main2 の外側グループと一致する', () => {
	// D3e-11 (Red予測): core/post-navigation-link 未登録のため UnsupportedBlockError で失敗する見込み。
	it('D3e-11a: S0 で展開・描画したパターンが main-01.html の外側 group div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const actual = renderPattern(makeCtx(db));
			const expected = extractDiv(fixture('regions/main-01.html'), GROUP_MARKER);
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});

	it('D3e-11b: S1(applyS1) で描画したパターンが set-main2 の mixed-status-protected-adjacent の外側 group div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			applyS1(db);
			const actual = renderPattern(makeCtx(db));
			const expected = extractDiv(fixture('set-main2/main.mixed-status-protected-adjacent.html'), GROUP_MARKER);
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3e-12: 仕様外の attrs と innerBlocks は RangeError で拒否する', () => {
	// D3e-12 (Red予測): 実装前は UnsupportedBlockError が投げられるため、RangeError を期待するテストは失敗する。
	it.each([
		'{"type":"sideways","showTitle":true,"arrow":"arrow"}',
		'{"type":"previous","showTitle":false,"arrow":"arrow"}',
		'{"showTitle":"true","arrow":"arrow"}',
		'{"arrow":"arrow"}',
		'{"showTitle":true}',
		'{"showTitle":true,"arrow":"chevron"}',
		'{"showTitle":true,"arrow":true}',
		'{"showTitle":true,"arrow":"arrow","linkLabel":"x"}',
		'{"showTitle":true,"arrow":"arrow","label":"x"}',
		'{"showTitle":true,"arrow":"arrow","taxonomy":"category"}',
	])('D3e-12: 不正な attrs %s は RangeError', (attrsJson) => {
		const db = openDumpDb();
		try {
			expect(() => renderLinkBlock(attrsJson, makeCtx(db))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('D3e-12i: innerBlocks を持つ post-navigation-link は RangeError', () => {
		const db = openDumpDb();
		try {
			const markup =
				'<!-- wp:post-navigation-link {"showTitle":true,"arrow":"arrow"} --><!-- wp:paragraph --><p>x</p><!-- /wp:paragraph --><!-- /wp:post-navigation-link -->';
			expect(() =>
				renderTree(parse(markup) as unknown as ParsedBlock[], makeCtx(db), createThemeRegistry()),
			).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3e-13: adjacent が null、または ctx.content / ctx.post が欠けると RangeError', () => {
	// D3e-13 (Red予測): 実装前は UnsupportedBlockError のため RangeError を期待するテストは失敗する。
	it('D3e-13a: adjacent("previous") が null なら RangeError', () => {
		const ctx = stubCtx(stubContent(() => null), STUB_POST);
		expect(() => renderLinkBlock(PREV_ATTRS, ctx)).toThrow(RangeError);
	});

	it('D3e-13b: adjacent("next") が null なら RangeError', () => {
		const ctx = stubCtx(stubContent(() => null), STUB_POST);
		expect(() => renderLinkBlock(NEXT_ATTRS, ctx)).toThrow(RangeError);
	});

	it('D3e-13c: ctx.content が無ければ RangeError', () => {
		const ctx = stubCtx(undefined, STUB_POST);
		expect(() => renderLinkBlock(PREV_ATTRS, ctx)).toThrow(RangeError);
	});

	it('D3e-13d: ctx.post が無ければ RangeError', () => {
		const ctx = stubCtx(stubContent(() => ({ title: 'T', url: 'http://127.0.0.1:8080/x/' })), undefined);
		expect(() => renderLinkBlock(PREV_ATTRS, ctx)).toThrow(RangeError);
	});
});

describe('D3e-14: タイトル・URL のエスケープと fail-closed', () => {
	// D3e-14 (Red予測): 実装前は UnsupportedBlockError のため、要素・属性・RangeError の期待が全て失敗する。
	it('D3e-14a: タイトルの <script> は要素を作らない', () => {
		const actual = renderLinkBlock(PREV_ATTRS, prevCtx('<script>alert(1)</script>'));
		const frag = parseFragment(actual) as unknown as P5Node;
		const names: string[] = [];
		walk(frag, (n) => names.push(n.nodeName));
		expect(names).not.toContain('script');
	});

	it('D3e-14b: タイトルの & は DOM 上 1 つのテキストノード & として現れる', () => {
		const actual = renderLinkBlock(PREV_ATTRS, prevCtx('&'));
		const anchor = findFirst(parseFragment(actual) as unknown as P5Node, 'a');
		const textNodes = (anchor?.childNodes ?? []).filter((c) => c.nodeName === '#text');
		expect(textNodes.length).toBe(1);
		expect(textNodes[0]?.value).toBe('&');
	});

	it('D3e-14c: タイトルの直引用符 " は奇数個なので RangeError', () => {
		expect(() => renderLinkBlock(PREV_ATTRS, prevCtx('"'))).toThrow(RangeError);
	});

	it('D3e-14d: 直引用符の対は作法どおり曲線引用符 “ ” になる', () => {
		const actual = renderLinkBlock(PREV_ATTRS, prevCtx('a "b" c'));
		const anchor = findFirst(parseFragment(actual) as unknown as P5Node, 'a');
		const textNodes = (anchor?.childNodes ?? []).filter((c) => c.nodeName === '#text');
		expect(textNodes[0]?.value).toBe('a “b” c');
	});

	it.each([
		"it's",
		'a--b',
		'wait...',
		'(c)',
		'3x4',
	])('D3e-14e: fail-closed 対象のタイトル %s は RangeError', (title) => {
		expect(() => renderLinkBlock(PREV_ATTRS, prevCtx(title))).toThrow(RangeError);
	});

	it.each([
		'javascript:alert(1)',
		'//evil',
	])('D3e-14f: http/https 以外・プロトコル相対の URL %s は RangeError', (url) => {
		expect(() => renderLinkBlock(PREV_ATTRS, prevCtx('T', url))).toThrow(RangeError);
	});

	it('D3e-14g: URL 内の " は属性を追加しない(拒否されるか、href と rel のみ)', () => {
		const url = 'http://127.0.0.1:8080/a"onmouseover="x';
		let actual: string;
		try {
			actual = renderLinkBlock(PREV_ATTRS, prevCtx('T', url));
		} catch (e) {
			expect(e).toBeInstanceOf(RangeError);
			return;
		}
		const anchor = findFirst(parseFragment(actual) as unknown as P5Node, 'a');
		expect((anchor?.attrs ?? []).map((a) => a.name).sort()).toEqual(['href', 'rel']);
	});
});

describe('D3e-15: テーマ登録とポスト登録の内容', () => {
	// D3e-15 (Red予測): 実装前はテーマ登録が 20 件で has が false のため失敗する。
	it('D3e-15: createThemeRegistry は 21 件で core/post-navigation-link を含み、PostRegistry は含まない', () => {
		const theme = createThemeRegistry();
		expect(theme.size).toBe(21);
		expect(theme.has('core/post-navigation-link')).toBe(true);
		expect(createPostRegistry().has('core/post-navigation-link')).toBe(false);
	});
});

describe('D3e-16: adjacent は方向ごとに 1 回だけ呼ばれる', () => {
	// D3e-16 (Red予測): 実装前は UnsupportedBlockError のため呼び出し回数の期待が失敗する。
	it('D3e-16a: previous ブロックは adjacent("previous") を 1 回だけ呼ぶ', () => {
		const adjacent = vi.fn((_dir: 'previous' | 'next') => ({ title: 'T', url: 'http://127.0.0.1:8080/x/' }));
		renderLinkBlock(PREV_ATTRS, stubCtx(stubContent(adjacent), STUB_POST));
		expect(adjacent).toHaveBeenCalledTimes(1);
		expect(adjacent).toHaveBeenCalledWith('previous');
	});

	it('D3e-16b: next ブロックは adjacent("next") を 1 回だけ呼ぶ', () => {
		const adjacent = vi.fn((_dir: 'previous' | 'next') => ({ title: 'T', url: 'http://127.0.0.1:8080/x/' }));
		renderLinkBlock(NEXT_ATTRS, stubCtx(stubContent(adjacent), STUB_POST));
		expect(adjacent).toHaveBeenCalledTimes(1);
		expect(adjacent).toHaveBeenCalledWith('next');
	});
});
